import { useEffect, useRef, useState, type RefObject } from 'react';
import { Avatar, Robot } from '../diplomacy/Illustrations';
import { api, ApiError, type Auth } from './api';
import { avatarRoles, cards, cardName, metrics, names, roles } from './catalogue';
import type { ActionId, ActionPreview, ClaimKind, CommitLevel, Commitments, Deal, IssueId, NewsItem, Phase, Preference, Role, RoundBrief, RoundReport, SecretaryAdvice, Session, Snapshot, Standing, Statement, TermId, Tone } from './types';
import './styles.css';


const phaseName: Record<Phase,string> = {announcement:'公开宣示',negotiation:'闭门磋商',signing:'正式安排',actions:'实际措施',report:'公开战报',finished:'最终结果'};
const stanceTemplates:Record<Tone,Record<CommitLevel,string>> = {
  hawk: {signal:'认为应坚持更严格的立场',pledge:'准备采取更严格的措施',redline:'划出红线：决不接受相反安排，并将采取一切必要措施'},
  dove: {signal:'认为应保持对话与灵活性',pledge:'准备展现灵活并推动合作',redline:'明确承诺不会走向对抗，愿以对话解决分歧'},
};
const levelHint:Record<CommitLevel,string> = {signal:'只表达看法，维持现状也不算背离',pledge:'预告将要采取措施，说了不做会被记上',redline:'最强措辞，背离代价最大'};
const issueLabel=(id:IssueId)=>({controls:'技术出口管制',materials:'关键材料与供应链',licensing:'设备许可自主',enforcement:'执法与灰色渠道',commerce:'商业收益与市场'} as Record<IssueId,string>)[id]??id;
const toneLabel=(t:Tone)=>({dove:'合作姿态',hawk:'强硬姿态'} as Record<Tone,string>)[t]??t;
const levelLabel=(l:CommitLevel)=>({signal:'看法',pledge:'预告',redline:'红线'} as Record<CommitLevel,string>)[l]??l;
const sayTplKinds:{kind:ClaimKind;label:string;hint:string}[] = [
  {kind:'offer',label:'愿意让步',hint:'对我方名下措施给出承诺，接受门槛降幅最大'},
  {kind:'consider',label:'可以谈',hint:'松口，降幅较小'},
  {kind:'request',label:'提出要求',hint:'对他方名下措施提出诉求'},
  {kind:'mention',label:'只提及',hint:'不带态度，仅作记录'},
  {kind:'refuse',label:'明确拒绝',hint:'写进条款会被视为强塞，慎用'},
];
const sayTplSentence=(kind:ClaimKind,name:string)=>({offer:`关于「${name}」，我方愿意作出让步。`,consider:`「${name}」可以谈。`,request:`希望贵方重新考虑「${name}」。`,mention:`我们注意到「${name}」。`,refuse:`「${name}」，我们不能接受。`} as Record<ClaimKind,string>)[kind];
const phaseOrder:Phase[] = ['announcement','negotiation','signing','actions','report'];
const dateline:Record<Role,string> = {US:'华盛顿电',CN:'北京电',NL:'海牙电',AS:'埃因霍芬电'};
const wireLabel:Record<NewsItem['kind'],string> = {announcement:'公开宣示',talks:'闭门磋商',pact:'正式安排',nopact:'安排未成',kept:'履行安排',broken:'违背安排',consistent:'言行一致',deviated:'言行相悖'};
const storageKey = 'chip-diplomacy-v16-session';
declare const __BUILD_TIME__: string;
const BUILD_TIME = typeof __BUILD_TIME__==='string'?__BUILD_TIME__:'';
const buildLabel=(iso:string)=>{if(!iso)return '';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';const p=(n:number)=>String(n).padStart(2,'0');return `${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;};
const count = (value:string) => Array.from(value).length;
const messageOf = (error:unknown) => error instanceof Error ? error.message : '请求未成功，请重试';
function save(auth: Auth|null) { try { if (auth) sessionStorage.setItem(storageKey,JSON.stringify(auth)); else sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ } }
function restore(): Auth|null { try { const value=JSON.parse(sessionStorage.getItem(storageKey)||'null'); return value && typeof value.id==='string' && typeof value.token==='string' ? {id:value.id,token:value.token} : null; } catch { return null; } }
function retryableIntent(operation:Parameters<typeof api.write>[1],payload:Parameters<typeof api.write>[3],before:Snapshot,after:Snapshot) {
  if(before.id!==after.id||before.playerRole!==after.playerRole||before.round!==after.round||before.phase!==after.phase)return false;
  const role=before.playerRole;
  const ownDeal=(s:Snapshot)=>s.deals.find(d=>d.round===s.round&&d.status==='effective'&&d.commitments?.[role]);
  const sameSigned=()=>before.signedDealId===after.signedDealId&&ownDeal(before)?.id===ownDeal(after)?.id;
  const terms=(d:Deal|undefined)=>JSON.stringify({text:d?.text,commitments:d?.commitments&&Object.entries(d.commitments).sort(([a],[b])=>a.localeCompare(b))});
  if(operation==='ready')return ['negotiation','signing'].includes(after.phase)&&!after.readyRoles.includes(role);
  if(operation==='action')return after.phase==='actions'&&!after.ownAction&&!after.submittedRoles.includes(role)&&after.legalActions.some(c=>c.id===payload?.actionId)&&sameSigned()&&terms(ownDeal(before))===terms(ownDeal(after))&&metrics.every(m=>before.roundStart[m.id]===after.roundStart[m.id]);
  if(operation==='respond'){
    const original=before.deals.find(d=>d.id===payload?.dealId),fresh=after.deals.find(d=>d.id===payload?.dealId);
    return after.phase==='signing'&&sameSigned()&&!!original&&original.status==='pending'&&!!original.commitments?.[role]&&!original.accepted?.includes(role)&&!!fresh&&fresh.status==='pending'&&!!fresh.commitments?.[role]&&!fresh.accepted?.includes(role)&&terms(original)===terms(fresh);
  }
  return false;
}

export default function App() {
  const [playerRole,setPlayerRole] = useState<Role>('US');
  const [health,setHealth] = useState<{enabled:boolean;model:string}|null>(null);
  const [healthError,setHealthError] = useState('');
  const [servedBuild,setServedBuild] = useState<string>('');
  const [session,setSession] = useState<Session|null>(null);
  const [restoring,setRestoring] = useState(false);
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [draft,setDraft] = useState('');
  const [tplKind,setTplKind] = useState<ClaimKind|null>(null);
  const [tplAction,setTplAction] = useState<ActionId|null>(null);
  const [tone,setTone] = useState<'neutral'|'firm'|'friendly'>('neutral');
  const [target,setTarget] = useState<Role|''>('');
  const [commitments,setCommitments] = useState<Commitments>({});
  const [dealText,setDealText] = useState('');
  const [selectedAction,setSelectedAction] = useState<ActionId|null>(null);
  const [declared,setDeclared] = useState<ActionId|null>(null);
  const [issue,setIssue] = useState<IssueId>('controls');
  const [stance,setStance] = useState<Tone>('hawk');
  const [level,setLevel] = useState<CommitLevel>('pledge');
  const [named,setNamed] = useState<Role|''>('');
  const [statementText,setStatementText] = useState('');
  const [stanceInput,setStanceInput] = useState('');
  const [brief,setBrief] = useState<RoundBrief|null>(null);
  const briefKey = useRef('');
  const [panel,setPanel] = useState<'wire'|'intel'|'aide'>('wire');
  const [news,setNews] = useState<NewsItem[]>([]); const newsKey=useRef('');
  const previewHeading=useRef<HTMLHeadingElement>(null); const actionsHeading=useRef<HTMLHeadingElement>(null);
  const [advice,setAdvice] = useState<SecretaryAdvice|null>(null);
  const [reportRound,setReportRound] = useState<number|null>(null);
  const [assistBusy,setAssistBusy]=useState(''); const assistFlight=useRef(false); const autoRounds=useRef(new Set<string>());
  const [polishNote,setPolishNote]=useState('');
  const [reference,setReference]=useState<ActionId|null>(null);
  const [tutorial,setTutorial]=useState<number|null>(()=>{try{return localStorage.getItem('chip-guided-tour')?null:0}catch{return 0}});
  const current = useRef<Session|null>(null);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const snapshot = session?.snapshot;


  function adopt(next:Snapshot, auth:Auth, generation:number) {
    if (!mounted.current || epoch.current!==generation || next.id!==auth.id) return;
    if (current.current?.id===auth.id && current.current.snapshot.version>next.version) return;
    const value={...auth,snapshot:next}; current.current=value; setSession(value);
  }
  useEffect(()=>{
    mounted.current=true;
    api.health().then(value=>{if(mounted.current){setHealth(value.llm);setServedBuild(value.build?.time||'')}}).catch(()=>{if(mounted.current)setHealthError('模型不可用：无法连接服务端。请检查服务后刷新。')});
    const auth=restore(); const generation=epoch.current;
    if(auth) {
      setRestoring(true);
      api.read(auth).then(value=>adopt(value,auth,generation)).catch(err=>{
        if(!mounted.current||generation!==epoch.current)return;
        if(err instanceof ApiError && [401,404,410].includes(err.status))save(null);
        setError(`恢复对局失败：${messageOf(err)}`);
      }).finally(()=>{if(mounted.current && generation===epoch.current)setRestoring(false)});
    }
    return ()=>{mounted.current=false; epoch.current++};
  },[]);
  useEffect(()=>{
    if(!session)return;
    const auth={id:session.id,token:session.token};
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    async function poll() {
      const generation=epoch.current;
      try {const value=await api.read(auth);if(!stopped)adopt(value,auth,generation)}
      catch(err){if(!stopped&&mounted.current&&generation===epoch.current)setError(`同步暂时失败：${messageOf(err)}。服务器仍独立推进，正在重试。`)}
      if(!stopped)timer=setTimeout(poll,1000);
    }
    timer=setTimeout(poll,1000);
    return ()=>{stopped=true;clearTimeout(timer)};
  },[session?.id,session?.token]);
  useEffect(()=>{setSelectedAction(null);setAdvice(null);setReportRound(null);setDeclared(null);setNews([]);setBrief(null);newsKey.current='';briefKey.current='';setStatementText('');setStanceInput('');setPolishNote('')},[snapshot?.round]);
  // The settlement is a ledger; the brief turns the same facts into prose (digits stay local).
  useEffect(()=>{
    if(!snapshot||!session||snapshot.phase!=='report')return;
    const key=`${snapshot.id}:${snapshot.round}`;
    if(briefKey.current===key)return;
    briefKey.current=key;
    const auth={id:session.id,token:session.token},generation=epoch.current;
    api.brief(auth,snapshot.version).then(value=>{
      if(!mounted.current||epoch.current!==generation)return;
      if(value?.brief)setBrief(value.brief);
    }).catch(()=>{/* the template brief arrives on next sync */});
  },[snapshot?.id,snapshot?.round,snapshot?.phase,session?.id]);
  // Fetch the newscast whenever a fresh batch of public subjects exists (announcements, then consistency results).
  useEffect(()=>{
    if(!snapshot||!session||['announcement','finished'].includes(snapshot.phase))return;
    const key=`${snapshot.id}:${snapshot.round}:${snapshot.phase}`;
    if(newsKey.current===key)return;
    newsKey.current=key;
    const auth={id:session.id,token:session.token},generation=epoch.current;
    api.newscast(auth,snapshot.version).then(value=>{
      if(!mounted.current||epoch.current!==generation)return;
      setNews(Array.isArray(value?.items)?value.items:[]);
      setPanel('wire'); // a fresh bulletin always wins the panel back
    }).catch(()=>{/* newscast is decorative; the template copy arrives on next sync */});
  },[snapshot?.phase,snapshot?.round,snapshot?.id]);
  useEffect(()=>{if(snapshot?.phase==='actions'&&selectedAction)bringIntoView(previewHeading.current)},[selectedAction,snapshot?.phase]);

  async function start() {
    if(inFlight.current || !health?.enabled || restoring)return;
    inFlight.current=true; setBusy('start');setError('');const generation=++epoch.current;
    try {
      const value=await api.create(playerRole);
      if(!mounted.current||epoch.current!==generation){void api.remove(value).catch(()=>{});return}
      save(value);adopt(value.snapshot,value,generation);setDraft('');setCommitments({});setDealText('');
    } catch(err){if(mounted.current&&epoch.current===generation)setError(messageOf(err))}
    finally{if(mounted.current&&epoch.current===generation){setBusy('');inFlight.current=false}}
  }
  async function reset() {
    const auth=current.current;if(!auth||busy==='reset')return;
    inFlight.current=true;const generation=++epoch.current;setBusy('reset');setError('');
    try {
      await api.remove(auth);
      if(!mounted.current||epoch.current!==generation)return;
      current.current=null;setSession(null);save(null);setDraft('');setCommitments({});setDealText('');setAdvice(null);setSelectedAction(null);setPolishNote('');assistFlight.current=false;setAssistBusy('');
    }catch(err){if(mounted.current&&epoch.current===generation)setError(`结束对局失败：${messageOf(err)}`)}
    finally{if(mounted.current&&epoch.current===generation){inFlight.current=false;setBusy('')}}
  }
  async function write(operation:Parameters<typeof api.write>[1], payload:Parameters<typeof api.write>[3]={}) {
    const auth=current.current;if(!auth||inFlight.current)return false;
    const generation=epoch.current;inFlight.current=true;setBusy(operation);setError('');
    try {const next=await api.write(auth,operation,auth.snapshot.version,payload);adopt(next,auth,generation);return mounted.current&&generation===epoch.current}
    catch(err){
      if(!mounted.current||epoch.current!==generation)return false;
      if(err instanceof ApiError&&err.status===409){
        try{
          const fresh=await api.read(auth);if(!mounted.current||epoch.current!==generation)return false;
          adopt(fresh,auth,generation);
          const latest=current.current?.id===auth.id?current.current.snapshot:fresh;
          if(retryableIntent(operation,payload,auth.snapshot,latest)){
            try{
              const next=await api.write(auth,operation,latest.version,payload);
              adopt(next,auth,generation);return mounted.current&&epoch.current===generation;
            }catch(retryError){
              if(!mounted.current||epoch.current!==generation)return false;
              if(!(retryError instanceof ApiError&&retryError.status===409)){setError(messageOf(retryError));return false;}
              adopt(await api.read(auth),auth,generation);
            }
          }
          if(mounted.current&&epoch.current===generation)setError('局面已更新，请核对后再次提交。你的草稿已保留。');
        }
        catch(refreshError){if(mounted.current&&epoch.current===generation)setError(`同步失败：${messageOf(refreshError)}。草稿已保留。`)}
      }else setError(messageOf(err));
      return false;
    }finally{if(mounted.current&&epoch.current===generation){inFlight.current=false;setBusy('')}}
  }
  async function doDeclare(value:Statement|null) {
    const auth=current.current;if(!auth||inFlight.current)return false;
    const generation=epoch.current;inFlight.current=true;setBusy('declare');setError('');
    try {const next=await api.declare(auth,auth.snapshot.version,value);adopt(next,auth,generation);return mounted.current&&generation===epoch.current}
    catch(err){
      if(mounted.current&&epoch.current===generation){
        if(err instanceof ApiError&&err.status===409){try{adopt(await api.read(auth),auth,generation)}catch{/* sync retries via polling */}}
        setError(messageOf(err));
      }
      return false;
    }finally{if(mounted.current&&epoch.current===generation){inFlight.current=false;setBusy('')}}
  }
  async function assist(kind:'polish'|'secretary') {
    const auth=current.current;if(!auth||assistFlight.current)return;
    const generation=epoch.current,round=auth.snapshot.round,phase=auth.snapshot.phase,original=draft;
    assistFlight.current=true;setAssistBusy(kind);
    try {
      if(kind==='polish'){
        const value=await api.polish(auth,original,tone);
        if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round&&current.current?.snapshot.phase===phase){
          setDraft(existing=>existing===original?value.candidate:existing);
          setPolishNote(value.source==='llm'?'已改写为正式磋商措辞，诉求识别不变，可直接改动后发送。':'模型未改动你的原文，已按原句保留。');
        }
      }else{
        const value=await api.secretary(auth);
        if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round&&current.current?.snapshot.phase===phase)setAdvice(value.advice);
      }
    }catch(err){if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round&&current.current?.snapshot.phase===phase)setError(`AI 请求失败：${messageOf(err)}`)}
    finally{if(mounted.current&&epoch.current===generation){assistFlight.current=false;setAssistBusy('')}}
  }
  async function draftStance() {
    const auth=current.current;if(!auth||assistFlight.current)return;
    const text=stanceInput.trim();
    if(!text){setError('请先写一句你想说的话，或直接使用下方议题模板。');return;}
    const generation=epoch.current,round=auth.snapshot.round;
    assistFlight.current=true;setAssistBusy('stance');setError('');
    try {
      const value=await api.draftStatement(auth,text);
      if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round){
        setIssue(value.statement.issue);setStance(value.statement.tone);setLevel(value.statement.level);
        setNamed(value.statement.target||'');setStatementText(value.statement.text);
      }
    }catch(err){if(mounted.current&&epoch.current===generation)setError(`AI 判定失败：${messageOf(err)}。你可以改用下方模板。`)}
    finally{if(mounted.current&&epoch.current===generation){assistFlight.current=false;setAssistBusy('')}}
  }
  // The template sentence is built to be parseable; the model only makes it read like a formal
  // negotiation statement, and the server rejects any rewrite that would change the recorded claim.
  async function polishTemplate() {
    if(!tplKind||!tplAction)return;
    const sentence=sayTplSentence(tplKind,cardName(tplAction));
    const auth=current.current;if(!auth||assistFlight.current)return;
    const generation=epoch.current,round=auth.snapshot.round,phase=auth.snapshot.phase;
    assistFlight.current=true;setAssistBusy('tpl');setError('');setPolishNote('');
    try {
      const value=await api.polish(auth,sentence,tone);
      if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round&&current.current?.snapshot.phase===phase){
        setDraft(value.candidate||sentence);
        setPolishNote(value.source==='llm'?'已改写为正式磋商措辞，诉求识别不变，可直接改动后发送。':'模型未改动模板原句，已按原句填入。');
      }
    }catch(err){
      if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round&&current.current?.snapshot.phase===phase){
        setDraft(sentence);
        setPolishNote(`模型未能改写，已填入模板原句（引擎仍可识别）：${messageOf(err)}`);
      }
    }finally{if(mounted.current&&epoch.current===generation){assistFlight.current=false;setAssistBusy('')}}
  }
  useEffect(()=>{
    if(!snapshot||snapshot.phase!=='negotiation'||snapshot.aiStatus?.busy||snapshot.readyRoles.filter(r=>r!==snapshot.playerRole).length!==3)return;
    const key=`${snapshot.id}:${snapshot.round}`;if(autoRounds.current.has(key)||assistFlight.current)return;
    autoRounds.current.add(key);void assist('secretary');
  },[snapshot?.id,snapshot?.round,snapshot?.phase,snapshot?.aiStatus?.busy,snapshot?.readyRoles.join(','),assistBusy]);
  const ownReady=!!snapshot?.readyRoles.includes(snapshot.playerRole),negotiating=snapshot?.phase==='negotiation'&&!ownReady;
  const own=snapshot?.roles.find(r=>r.id===snapshot.playerRole);
  const ownDeal=snapshot?.deals.find(d=>d.round===snapshot.round&&d.status==='effective'&&d.commitments?.[snapshot.playerRole]);
  const promised=ownDeal?.commitments?.[snapshot!.playerRole];
  // Direct talks in this round or the last one count as a working relationship.
  const contacts=snapshot?[...new Set(snapshot.messages.filter(m=>m.to&&m.round>=snapshot.round-1&&(m.from===snapshot.playerRole||m.to===snapshot.playerRole)).map(m=>m.from===snapshot.playerRole?m.to!:m.from!))]:[];
  const tplCards = !snapshot||!tplKind?[]:(tplKind==='offer'||tplKind==='consider'?cards[snapshot.playerRole]:tplKind==='request'?roles.filter(r=>r!==snapshot.playerRole).flatMap(r=>cards[r]):roles.flatMap(r=>cards[r]));
  const legalCommitments=(role:Role)=>cards[role].filter(c=>c.id!=='S4'&&(c.id!=='C1'||snapshot!.round<4&&(snapshot!.researchUses??0)<3)&&(c.id!=='C4'||snapshot!.roundStart.P>=1)&&(c.id!=='N2'||snapshot!.roundStart.A<4));
  const validProposal=!!snapshot&&Object.keys(commitments).length>=2&&!!commitments[snapshot.playerRole]&&Object.entries(commitments).every(([r,id])=>legalCommitments(r as Role).some(c=>c.id===id));
  const report=snapshot?.reportHistory.find(r=>r.round===reportRound)??snapshot?.reportHistory.at(-1);
  const finishTour=()=>{setTutorial(null);try{localStorage.setItem('chip-guided-tour','done')}catch{/* optional */}};
  const primaryLabel=!snapshot?'':snapshot.phase==='finished'?'重新选择角色':snapshot.phase==='report'?`进入第 ${snapshot.round+1} 回合`:snapshot.phase==='actions'?snapshot.ownAction?'已提交，等待其余代表':'秘密提交措施':snapshot.phase==='announcement'?snapshot.declaredRoles?.includes(snapshot.playerRole)?'已发表，等待其余代表':'保持静默':ownReady?'已就绪':snapshot.phase==='negotiation'?'结束磋商 · 就绪':'结束安排 · 就绪';
  const primaryDisabled=!!busy||!!snapshot&&(snapshot.phase==='actions'?(!!snapshot.ownAction||!selectedAction):snapshot.phase==='announcement'?!!snapshot.declaredRoles?.includes(snapshot.playerRole):['negotiation','signing'].includes(snapshot.phase)?ownReady:false);
  const stale=!!BUILD_TIME&&!!servedBuild&&servedBuild!==BUILD_TIME;
  const instructions:Record<Phase,[string,string]>={announcement:['就一个议题发表公开宣示','美方先公开宣示，其余各方观测后再表态。宣示是议题层面的姿态，不是措施卡：它更新各方对你的类型判断，并按语义在结算时与你的实际措施核对。也可以保持静默——不做承诺就没有代价。'],negotiation:['先谈一笔对你有用的交换','先看措施速查，再发出首条消息或安排草案，AI 会围绕首批输入回应。之后的补充仍用于安排与措施判断；也可跳过发言。'],signing:['决定接受哪些安排','核对你要承诺的措施是否帮助目标；条款只对参与方可见。可以拒绝或跳过未处理邀请。'],actions:['选择一项抬高你收益的措施','选中后先看条件化后果预览：每个情景都会给出相对提升 ΔU，而不只是指标变化。再秘密提交。其他代表的真实选择未知；提交后不能更改。'],report:['看看措施改变了什么','核对指标、公开措施、未公开方的合计影响和取位截断，以及本回合你收益的变化。可以立即继续下一轮。'],finished:['查看你达成了什么','先看自己的偏好与相对提升，再展开所有角色的结局——偏好此时全部揭晓，可以看到每一方实际在最大化什么。']};
  return <div className="guided-app">
    <header className="g-header"><div><p className="g-eyebrow">CHIP DIPLOMACY · V1.6{buildLabel(BUILD_TIME)?` · 构建 ${buildLabel(BUILD_TIME)}`:''}</p><h1>芯片外交</h1></div><div><small>DeepSeek · {health?.model||'连接中'}</small>{session&&<button onClick={reset} disabled={busy==='reset'}>结束对局</button>}</div></header>
    {stale&&<div className="g-stale" role="status">线上已有新版本（{buildLabel(servedBuild)}），你打开的是旧页面（{buildLabel(BUILD_TIME)}）。<button onClick={()=>location.reload()}>刷新页面</button></div>}
    {error&&<div className="g-error" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}>×</button></div>}
    {!snapshot?<main className="g-welcome"><h2>代表一方，把局势推向你要的方向。</h2><p>四方、四回合。你抽到本方两种政策偏好之一：它只决定同一个局势对你值多少，不改变你能做什么。四回合末把相对开局的收益提升做上去，并守住信用。</p><div className="g-rolechoices">{roles.map(r=><button key={r} aria-pressed={playerRole===r} onClick={()=>setPlayerRole(r)}><Avatar role={avatarRoles[r]}/><strong>{names[r]} {r}</strong></button>)}</div><button className="primary" disabled={!health?.enabled||!!busy||restoring} onClick={start}>{restoring?'恢复对局中…':busy==='start'?'正在创建对局…':'开始四回合博弈'}</button><p role="status">{healthError||(!health?.enabled?'模型不可用：服务端尚未配置 DeepSeek，暂不能开始。':'真实 DeepSeek 参与 · 私人偏好随机抽取 · 不需要输入密钥')}</p><details><summary>想多了解一点？</summary><p>收益 U = 偏好权重对归一化局势项加权求和，再加信用的小额加成。第四回合末 ΔU ≥ 门槛且信用 ≥1 为实质胜利；另有一份全员履约安排为外交胜利。偏好只影响评价，不影响可选措施。游戏数值不代表现实政策预测。</p></details></main>:<>
      <StatusHud snapshot={snapshot}/>
      <div className="g-layout">
      <div className="g-main">
      <MyPreference snapshot={snapshot}/>
      <main className="g-task"><header><p className="g-eyebrow">{phaseName[snapshot.phase]} · 现在该做什么</p><h2>{instructions[snapshot.phase][0]}</h2><p>{instructions[snapshot.phase][1]}</p>{snapshot.aiStatus?.busy&&<small role="status">{snapshot.aiStatus.role?names[snapshot.aiStatus.role]:'代表'}正在处理本阶段；你可以继续准备。</small>}</header>
        {snapshot.phase==='announcement'&&<section className="g-announce"><h3>本轮公开宣示</h3>{snapshot.focusIssue&&<p className="g-focus">本轮焦点议题：<strong>{issueLabel(snapshot.focusIssue)}</strong>{snapshot.focusRole?`（由${names[snapshot.focusRole]}设定）`:''}——聚焦之下，该议题上的安排若与公开宣示相悖，将被所有人看到。</p>}<p className="g-note">声明是议题层面的公开姿态，<strong>不是措施卡，也不是承诺</strong>——具体措施只在实际措施阶段出现，唯一真正的承诺是安排条款。措辞强度只决定这句话有多重。你这句话会去三个地方：</p><ol className="g-stancelist"><li><strong>立刻改变别人对你的判断</strong>：他们按此推断你更像哪类角色；被点名者收到的信号更强，旁观者更弱。信号强度 = 姿态 × 措辞强度 × 你的可信度（当前 {Math.round((snapshot.statementCred?.[snapshot.playerRole]??1)*100)}%）。</li><li><strong>进入签约环节被逐条比对</strong>：若某方承诺的条款与他就同一议题发表的公开立场相反，签约界面会标出「与公开立场相悖」，其他代表也会认为难以兑现而倾向拒绝。</li><li><strong>结算时与你的实际措施核对</strong>：<strong>在别的议题上行动不受约束</strong>，只在一个议题上表态可以为其他方向留余地；一致则可信度回升，背离则下降（看法 −0.15、预告 −0.3、红线 −0.45）。</li></ol><p className="g-hint">保持静默不构成任何义务，也没有代价。</p>
        <div className="g-announcelist">{roles.map(r=>{const done=snapshot.declaredRoles?.includes(r),value=snapshot.statements?.[r];return <p key={r} className={done?'':'g-pending'}><strong>{names[r]}</strong>{done?(value?`就${snapshot.issues?.[value.issue]??value.issue}发表${snapshot.tones?.[value.tone]??value.tone}（${snapshot.commitLevels?.[value.level]??value.level}）${value.target?` · 点名${names[value.target]}`:''}`:'保持静默'):(r==='US'?'正在考虑…':'等待美方表态…')}</p>})}</div>
        {(()=>{const mine=snapshot.declaredRoles?.includes(snapshot.playerRole),canGo=!mine&&(snapshot.playerRole==='US'||snapshot.declaredRoles?.includes('US'));
         if(mine)return <p role="status">你已发表本轮立场，等待其余代表。</p>;
         if(!canGo)return <p role="status">等待美方先发表公开宣示。</p>;
         const build=(i:IssueId,t:Tone,l:CommitLevel,n:Role|'')=>`${names[snapshot.playerRole]}就${snapshot.issues?.[i]??i}${stanceTemplates[t][l]}${n?`，并点名${names[n]}`:''}。`;
         return <>
          <div className="g-stancefield"><label htmlFor="stance-input">用一句话说出你的立场（可选，交给模型判定并润色）</label>
           <textarea id="stance-input" value={stanceInput} maxLength={100} rows={2} placeholder="例如：我们希望荷兰在许可问题上保持自主，但愿意就技术安全进行对话。" onChange={e=>setStanceInput(e.target.value)}/>
           <div className="g-buttons"><button disabled={!!busy||assistBusy==='stance'} onClick={draftStance}>{assistBusy==='stance'?'判定中…':'让模型判定立场'}</button><span className="g-hint">{count(stanceInput)}/100</span></div></div>
          <div className="g-stancegrid">
           <div><strong>议题</strong><div className="g-buttons">{Object.entries(snapshot.issues??{}).map(([id,label])=><button key={id} className={issue===id?'selected':''} aria-pressed={issue===id} disabled={!!busy} onClick={()=>{setIssue(id as IssueId);setStatementText(build(id as IssueId,stance,level,named))}}>{label}</button>)}</div></div>
           <div><strong>姿态</strong><div className="g-buttons"><button className={stance==='dove'?'selected':''} aria-pressed={stance==='dove'} disabled={!!busy} onClick={()=>{setStance('dove');setStatementText(build(issue,'dove',level,named))}}>合作</button><button className={stance==='hawk'?'selected':''} aria-pressed={stance==='hawk'} disabled={!!busy} onClick={()=>{setStance('hawk');setStatementText(build(issue,'hawk',level,named))}}>强硬</button></div></div>
           <div><strong>措辞强度</strong><div className="g-buttons">{Object.entries(snapshot.commitLevels??{}).map(([id,label])=><button key={id} className={level===id?'selected':''} aria-pressed={level===id} disabled={!!busy} onClick={()=>{setLevel(id as CommitLevel);setStatementText(build(issue,stance,id as CommitLevel,named))}} title={levelHint[id as CommitLevel]}>{label}</button>)}</div></div>
           <div><strong>点名（可选）</strong><div className="g-buttons"><button className={named===''?'selected':''} aria-pressed={named===''} disabled={!!busy} onClick={()=>{setNamed('');setStatementText(build(issue,stance,level,''))}}>不点名</button>{roles.filter(r=>r!==snapshot.playerRole).map(r=><button key={r} className={named===r?'selected':''} aria-pressed={named===r} disabled={!!busy} onClick={()=>{setNamed(r);setStatementText(build(issue,stance,level,r))}}>{names[r]}</button>)}</div></div>
          </div>
          <p className="g-hint">{levelHint[level]}。点名会让被点名方收到更强的信号，旁观者收到的更弱。</p>
          <div className="g-stancefield"><label htmlFor="statement-text">官方表态正文</label><textarea id="statement-text" value={statementText} maxLength={200} rows={3} onChange={e=>setStatementText(e.target.value)}/></div>
          <div className="g-buttons"><button className="primary" disabled={!!busy||!statementText.trim()} onClick={async()=>{if(await doDeclare({issue,tone:stance,level,target:named||null,text:statementText.trim()})){setStatementText('');setStanceInput('')}}}>发表宣示</button><button disabled={!!busy} onClick={()=>doDeclare(null)}>保持静默</button></div>
         </>})()}</section>}
        {snapshot.phase==='negotiation'&&<><details className="g-reference"><summary>先看中文措施速查 · 我能交换什么？</summary>{roles.map(r=><div key={r}><h3>{names[r]}</h3>{cards[r].map(c=><button key={c.id} onClick={()=>setReference(c.id)}>{c.name}</button>)}</div>)}</details><section aria-label="磋商记录" className="g-messages">{snapshot.messages.length?snapshot.messages.map(m=><article key={m.id}><small>{names[m.from]} · 第 {m.round} 回合 · {m.to?`私聊 → ${names[m.to]}`:'公开'}</small><p><ActionText text={m.content} open={setReference}/></p></article>):<p>桌上还没有发言。可以先提出你想交换的行动。</p>}</section><section className="g-compose"><h3>磋商发言 <small>{snapshot.messageCount}/2</small></h3><div className="g-formrow"><label>发送给<select aria-label="消息收件人" value={target} disabled={!negotiating} onChange={e=>setTarget(e.target.value as Role|'')}><option value="">公开 · 所有人</option>{roles.filter(r=>r!==snapshot.playerRole).map(r=><option key={r} value={r}>私聊 · {names[r]}</option>)}</select></label><label>润色语气<select aria-label="润色语气" value={tone} onChange={e=>setTone(e.target.value as typeof tone)}><option value="neutral">中性</option><option value="firm">坚定</option><option value="friendly">友好</option></select></label></div><details className="g-saytpl"><summary>不会写？用模板组一句（措辞已对齐引擎识别词）</summary><p className="g-note">发言会被本地规则解析成诉求：愿意让步 −0.5、可以谈 −0.25、提出要求 −0.15、只提及 0、明确拒绝 +0.6。选态度和措施，一键填入后可以再改，也可以交给模型改写成正式磋商措辞（改变诉求识别的改写会被服务端拒绝，失败时仍填入模板原句）。</p><div className="g-tplrow"><div className="g-tplkinds" role="group" aria-label="模板态度">{sayTplKinds.map(k=><button key={k.kind} title={k.hint} className={tplKind===k.kind?'selected':''} aria-pressed={tplKind===k.kind} disabled={!negotiating} onClick={()=>{setTplKind(k.kind);setTplAction(null)}}>{k.label}</button>)}</div><label>措施<select aria-label="模板措施" value={tplAction??''} disabled={!tplKind} onChange={e=>setTplAction((e.target.value||null) as ActionId|null)}><option value="">{tplKind?'选择措施':'先选态度'}</option>{tplCards.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>{tplKind&&tplAction&&<p className="g-tplpreview">{sayTplSentence(tplKind,cardName(tplAction))}<button disabled={!negotiating} onClick={()=>setDraft(sayTplSentence(tplKind,cardName(tplAction)))}>填入发言框</button><button disabled={!negotiating||!!assistBusy} onClick={()=>void polishTemplate()}>{assistBusy==='tpl'?'改写中…':'AI 改写为正式措辞'}</button></p>}</details><textarea aria-label="谈判消息" placeholder="写一句话：你希望对方做什么，愿意交换什么？" value={draft} disabled={!negotiating||snapshot.messageCount>=2} onChange={e=>setDraft(e.target.value)}/><div className="g-buttons"><small>{count(draft)}/100 字</small><button onClick={()=>assist('polish')} disabled={!negotiating||!!assistBusy||!draft.trim()||count(draft)>100}>{assistBusy==='polish'?'润色中…':'AI 润色'}</button><button className="primary" disabled={!negotiating||!!busy||!draft.trim()||count(draft)>100||snapshot.messageCount>=2} onClick={async()=>{if(await write('message',{content:draft,target:target||null}))setDraft('')}}>发送</button></div>{polishNote&&<small className="g-hint" role="status">{polishNote}</small>}<p className="g-note">润色只填入可编辑候选，不会自动发送，也不会改变引擎识别到的诉求（措施名与态度词会被保留）。发言是磋商，不是公开宣示：它不改变指标，但措辞仍会作为较弱的信号——公开发言影响所有人，私聊只影响对方。要把话变成义务，请发起协议。</p><details><summary>＋ 发起正式安排（每轮 1 份）</summary><p>选择你和至少一方的本轮合法行动承诺。口头承诺不算正式安排，灰色交付不能签约。</p>{(snapshot.claims?.length??0)>0&&<div className="g-claims"><h4>桌上诉求 · 磋商里说出口的措施</h4><p className="g-note">写进条款时按对方说过的态度判定：说过愿意或可以谈的更容易被接受，明确拒绝过的等于强塞，大概率被拒。</p>{(snapshot.claims??[]).map(c=><p key={c.id} className={`g-claim g-claim-${c.kind}`}><strong>{cardName(c.actionId)}</strong> · {names[c.from]}{c.to?` → ${names[c.to]}`:' · 公开'} · {snapshot.claimKinds?.[c.kind]??c.kind}{c.kind==='refuse'?' · 写进条款会被视为强塞':''} <button disabled={!negotiating||snapshot.proposalsMade>=1} onClick={()=>setCommitments(old=>({...old,[c.owner]:c.actionId}))}>填入 {names[c.owner]} 的承诺</button></p>)}{roles.filter(r=>r!==snapshot.playerRole&&!contacts.includes(r)).map(r=><p key={r} className="g-hint">本轮还没有与{names[r]}直接磋商；直接把条款递过去，会被视为缺乏诚意。</p>)}</div>}{roles.map(r=><label key={r}>{names[r]}<select aria-label={`${names[r]}协议承诺`} value={commitments[r]??''} disabled={!negotiating||snapshot.proposalsMade>=1} onChange={e=>setCommitments(old=>{const next={...old};if(e.target.value)next[r]=e.target.value as ActionId;else delete next[r];return next})}><option value="">{r===snapshot.playerRole?'选择你的承诺':'不参加'}</option>{legalCommitments(r).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>)}<textarea aria-label="协议说明" value={dealText} onChange={e=>setDealText(e.target.value)} placeholder="说明（可选，最多300字，不生成额外政策效果）"/><button disabled={!negotiating||!!busy||!validProposal||count(dealText)>300||snapshot.proposalsMade>=1} onClick={()=>write('proposal',{commitments,text:dealText})}>提交提案（已发起 {snapshot.proposalsMade}/1）</button></details></section></>}
        {['negotiation','signing'].includes(snapshot.phase)&&<section><h3>{snapshot.phase==='signing'?'本轮安排与邀请':'本轮安排草案'}</h3><p className="g-note">安排条款才是真正的承诺：它会锁定你本轮措施，守约信用 +1、违约 −1。条款若与某方本轮公开立场相悖，会在下方标出「兑现存疑」，其他代表也会据此降低接受意愿{snapshot.focusIssue?`；发生在焦点议题（${issueLabel(snapshot.focusIssue)}）上的相悖，连局外人也会看到`:''}。此前与你有过定向磋商接触的一方，更容易接受你的条款。</p>{snapshot.deals.filter(d=>d.round===snapshot.round).map(d=><DealView key={d.id} deal={d} viewer={snapshot.playerRole} contacts={contacts} canRespond={snapshot.phase==='signing'&&!ownReady&&!busy} respond={accept=>write('respond',{dealId:d.id,accept})}/>)}{!snapshot.deals.some(d=>d.round===snapshot.round)&&<p>本轮尚无安排草案。你可以跳过签约，仍能争取实质胜利。</p>}</section>}
        {snapshot.phase==='actions'&&<><p className="g-promise">{promised?`你的生效安排承诺：${cardName(promised)}。可以违约，但信用将减少。`:'本轮没有生效安排，按目标自由选择。'}</p><h3 ref={actionsHeading} tabIndex={-1} className="g-action-heading">可选措施</h3><div className="g-actions">{snapshot.legalActions.map(c=><button key={c.id} className={selectedAction===c.id||snapshot.ownAction===c.id?'selected':''} aria-pressed={selectedAction===c.id||snapshot.ownAction===c.id} disabled={!!snapshot.ownAction||!!busy} onClick={()=>selectedAction===c.id?bringIntoView(previewHeading.current):setSelectedAction(c.id)}><strong>{c.name}</strong><span>{purpose[c.id]}</span></button>)}</div>{selectedAction&&<Preview preview={snapshot.actionPreviews?.find(p=>p.actionId===selectedAction)} snapshot={snapshot} headingRef={previewHeading} changeAction={()=>bringIntoView(actionsHeading.current)}/>}<details><summary>展开查看计算规则</summary>{snapshot.legalActions.filter(c=>!selectedAction||c.id===selectedAction).map(c=><p key={c.id}>{c.name}：{c.description}</p>)}</details>{snapshot.playerRole==='AS'&&snapshot.ownGreyRisk!==undefined&&<p>你的基础查获风险 {Math.round(snapshot.ownGreyRisk*100)}%；实际受本轮政策及协调变化影响，不等于已知对方选择后的查获概率。</p>}{promised&&selectedAction&&promised!==selectedAction&&<p className="g-warning">此措施与你在正式安排中的承诺不同，提交将导致违约。</p>}{snapshot.ownAction&&<p role="status">你已秘密提交：{cardName(snapshot.ownAction)}。等待其他代表。</p>}</>}
        {snapshot.phase==='report'&&report&&<Report report={report} brief={brief}/>}
        {snapshot.phase==='finished'&&<Results snapshot={snapshot}/>}
      </main>
      <details className="g-situation"><summary>局势详情 · 指标、角色、规则与历史</summary><div className="g-metrics">{metrics.map(m=><div key={m.id}><strong>{m.name} {fmt(snapshot.state[m.id])}/{m.max}</strong><p>{m.explanation}</p>{(snapshot.state[m.id]===0||snapshot.state[m.id]===m.max)&&<p className="g-warning">{snapshot.state[m.id]===0?'已达下限':'已达上限'}：继续同方向变化会被截断。</p>}</div>)}</div><p>ASML重点监控：{snapshot.monitoring?'已触发':'未触发'}。{snapshot.pendingResearch?.map(x=>`第${x.dueRound}轮自主能力 +${x.amount}。`)}{snapshot.pendingPenalties?.map(x=>`第${x.dueRound}轮技术难度 +${x.amount}。`)}</p>{snapshot.roles.map(r=><details key={r.id}><summary>{r.name} · 信用 {r.credit}/2 · 履约 {r.fulfilledDeals}</summary><p>{r.description}</p>{(snapshot.preferenceCatalogue[r.id]??[]).map(p=><p key={p.id}>{p.label}（50%）：{p.blurb}；权重 {Object.entries(p.weights??{}).map(([t,w])=>`${snapshot.termLabels[t as TermId]??t} ${pct(w??0)}%`).join('、')}</p>)}<p className="g-note">里程碑：{(snapshot.milestones?.[r.id]??[]).map(m=>`${m.earned?'★':'☆'} ${m.label}`).join('；')}</p></details>)}<details><summary>统一收益与胜利规则</summary><p>收益 U = 偏好权重对归一化局势项加权求和（有效 T=max(0,T−0.5×max(0,S−2))，T/A/E/S 各除以 5，渠道敞口=(5−有效T)/5，低压制=1−A/5，美国低压力=1−P/2）+ 0.05×(信用−1) + 0.05×全员履约安排数。第四回合末 ΔU=U−开局U ≥ {fmt(snapshot.ownStanding.deltaThreshold)} 且信用 ≥1 为实质胜利，另需至少一份全员履约安排才是外交胜利。八张旧目标卡已降级为里程碑徽章，只作展示。</p></details><h3>公开战报档案</h3>{snapshot.reportHistory.length?<><select aria-label="历史回合" value={report?.round??''} onChange={e=>setReportRound(Number(e.target.value))}>{snapshot.reportHistory.map(r=><option key={r.round} value={r.round}>第 {r.round} 回合</option>)}</select>{report&&<Report report={report}/>}</>:<p>结算后保留各轮战报。</p>}</details>
      {!!snapshot.notices.length&&<details className="g-notices"><summary>模型与服务提示（{snapshot.notices.length}）</summary>{snapshot.notices.map((n,i)=><p key={i}>第{n.round}轮 · {n.role?names[n.role]:''}：{n.message}</p>)}</details>}
      </div>
      <aside className="g-hud" aria-label="固定栏：电讯、情报与幕僚">
        <div className="g-hudtabs" role="tablist" aria-label="固定栏面板">
          <button type="button" role="tab" aria-selected={panel==='wire'} className={panel==='wire'?'selected':''} onClick={()=>setPanel('wire')}>电讯{news.length?`（${news.length}）`:''}</button>
          <button type="button" role="tab" aria-selected={panel==='intel'} className={panel==='intel'?'selected':''} onClick={()=>setPanel('intel')}>情报</button>
          <button type="button" role="tab" aria-selected={panel==='aide'} className={panel==='aide'?'selected':''} onClick={()=>setPanel('aide')}>幕僚</button>
        </div>
        {snapshot.phase!=='finished'&&panel==='wire'&&<NewsWire news={news} round={snapshot.round}/>}
        {snapshot.phase!=='finished'&&panel==='intel'&&<Beliefs snapshot={snapshot}/>}
        {snapshot.phase!=='finished'&&panel==='aide'&&<SecretaryPanel advice={advice} busy={assistBusy==='secretary'} onAsk={()=>void assist('secretary')}/>}
      </aside>
      </div>
      <footer className="g-next"><div><strong>下一步</strong><p>{ownReady?'你已就绪，等待其余代表。':snapshot.phase==='announcement'?'可以写一句话让模型判定立场，也可以直接用议题模板；不选则保持静默。':snapshot.phase==='actions'?'未提交前可更换选择；也可选择维持现状。':snapshot.phase==='negotiation'?'可以不发言、不提案，直接进入安排环节。':snapshot.phase==='signing'?'可以跳过未接受的邀请；未全员接受的安排将失效。':snapshot.phase==='report'?'可以立即进入下一回合。':'查看结果后可重新开局。'}</p></div><button className="primary" disabled={primaryDisabled} onClick={()=>snapshot.phase==='finished'?reset():snapshot.phase==='announcement'?doDeclare(null):snapshot.phase==='actions'?selectedAction&&write('action',{actionId:selectedAction}):write(snapshot.phase==='report'?'next':'ready')}>{primaryLabel}</button></footer>
    </>}
    {snapshot&&tutorial!==null&&<div className="g-overlay"><section role="dialog" aria-modal="true" aria-label="一分钟上手" className="g-dialog"><p className="g-eyebrow">一分钟上手 · {tutorial+1}/3</p><h2>{['先看你的偏好','每个阶段只做一件事','先看后果，再决定'][tutorial]}</h2><p>{['你代表的角色和私人偏好始终在顶部：它会告诉你同一个局势对你值多少。第四回合末把相对开局的收益提升到门槛以上并守住信用，是第一件事。','谈判可以交换行动，签约决定承诺，实际措施才会改数值；底部按钮告诉你下一步。','行动选中后会显示条件化后果，每个情景都给出相对提升 ΔU。别人的选择未知，预览不保证最终结果；公式和历史在局势详情。'][tutorial]}</p><div className="g-buttons"><button onClick={finishTour}>跳过引导</button><button className="primary" onClick={()=>tutorial===2?finishTour():setTutorial(tutorial+1)}>{tutorial===2?'开始我的回合':'下一步提示'}</button></div></section></div>}
    {reference&&<div className="g-overlay"><section role="dialog" aria-modal="true" aria-label="措施说明" className="g-dialog"><h2>{cardName(reference)}</h2><p>{purpose[reference]}</p><p>{Object.values(cards).flat().find(c=>c.id===reference)?.description}</p><small>这是公开的行动规则，不代表对方已经选择。</small><button onClick={()=>setReference(null)}>关闭措施说明</button></section></div>}
    <p className="g-disclaimer">虚构策略游戏 · 所有数值为游戏假设 [G]</p>
  </div>;
}

function bringIntoView(element:HTMLElement|null){
  // Immediate scrolling avoids animation, including for reduced-motion preferences.
  element?.scrollIntoView?.({block:'start',behavior:'auto'});element?.focus({preventScroll:true});
}
const fmt=(n:number)=>Number(n.toFixed(2)).toString();
const metricTitle=(key:string)=>metrics.find(m=>m.id===key)?.name??key;
const purpose:Record<ActionId,string>={U1:'提高技术限制，但会损失商业收益。',U2:'降低技术限制、缓和压力，并改善商业环境。',U3:'争取荷兰合作，提高政策协调；需要对方配合。',U4:'付出少量商业成本，加强对灰色交付的查处。',C1:'牺牲当前收益，积累下一回合的自主技术。',C2:'让美国承受材料压力，但不会自动迫使其让步。',C3:'争取中荷商业合作，降低美荷协调。',C4:'放松已有材料限制，作为谈判让步并改善收益。',N1:'配合技术限制，提高协调但牺牲商业收益。',N2:'放宽有限许可；需要ASML合规订单配合。',N3:'配合美国争取协调，单独使用没有收益。',S1:'在荷兰许可配合下执行合规订单。',S2:'拓展非中国市场，改善收益但提高中国技术获取难度。',S4:'收益潜力高，但查获会损失收益、信用并带来后续处罚。',PASS:'保持现状，不产生本方行动效果。'};
function ActionText({text,open}:{text:string;open:(id:ActionId)=>void}){return <>{text.split(/\b([UCNS][1-4])\b/g).map((part,i)=>Object.values(cards).flat().some(c=>c.id===part)?<button className="g-inline" key={i} onClick={()=>open(part as ActionId)}>{cardName(part)}<small> {part}</small></button>:<span key={i}>{part.replace(/\b(US|CN|NL|AS|[TAESP])\b/g,key=>names[key as Role]??`${metricTitle(key)}（${key}）`)}</span>)}</>}
const statuses:Record<Deal['status'],string>={pending:'等待接受',effective:'已生效',rejected:'已拒绝',expired:'已过期',conflict:'安排冲突',fulfilled:'全员履约',breached:'存在违约'};
const pct=(n:number)=>Math.round(n*100);
const sgn=(n:number)=>(n>=0?'+':'')+fmt(n);
// A preference is a weighting of the public situation: it says what a state is worth, never what you may do.
function WeightBars({preference,terms,labels}:{preference:Preference;terms?:Record<TermId,number>;labels:Record<TermId,string>}){
  const entries=(Object.entries(preference.weights??{}) as [TermId,number][]).sort((a,b)=>b[1]-a[1]);
  return <div className="g-weights">{entries.map(([term,w])=><div key={term}><div><strong>{labels[term]??term} · 权重 {pct(w)}%</strong><span>{terms?`当前 ${fmt(terms[term]??0)} · 贡献 ${fmt((terms[term]??0)*w)}`:''}</span></div><div className="g-weightbar"><span style={{width:`${pct(w)}%`}}/></div></div>)}</div>;
}
function UtilityMeter({standing}:{standing:Standing}){
  const need=Math.max(0,standing.deltaThreshold-standing.delta);
  return <div className="g-utility"><div><strong>相对提升 ΔU {sgn(standing.delta)} / 门槛 {fmt(standing.deltaThreshold)}</strong><span>{standing.substantiveVictory?'已越过实质胜利线':`距门槛还差 ${fmt(need)}`}</span></div><progress max={Math.max(standing.deltaThreshold,.01)} value={Math.max(0,standing.delta)} aria-label="相对提升进度"/><p className="g-note">开局基准 U {fmt(standing.initial)} → 当前 U {fmt(standing.utility)}（含信用 {standing.credit}/2 与履约 {standing.fulfilledDeals} 份的小额加成）。</p></div>;
}
function MyPreference({snapshot}:{snapshot:Snapshot}){
  const standing=snapshot.ownStanding,own=snapshot.roles.find(r=>r.id===snapshot.playerRole);
  return <section className="g-goal" aria-label="我的偏好与相对提升">
    <div className="g-goalhead"><div><p className="g-eyebrow">你代表 {names[snapshot.playerRole]} · 第 {snapshot.round}/4 回合</p><h2>我的偏好：{snapshot.ownPreference.label}</h2><p>{snapshot.ownPreference.blurb}</p></div>
    <strong className="g-credit">信用 {own?.credit??1}/2 · 全员履约 {own?.fulfilledDeals??0}</strong></div>
    <UtilityMeter standing={standing}/>
    <WeightBars preference={snapshot.ownPreference} terms={standing.terms} labels={snapshot.termLabels}/>
    <details><summary>偏好如何影响胜负 · 里程碑徽章</summary>
      <p>偏好是私有的，只改变同一个局势对你值多少，<strong>不改变你能做什么</strong>：四方在同一局面下的合法行动完全相同。第四回合末，相对开局的收益提升 ΔU ≥ {fmt(standing.deltaThreshold)} 且信用 ≥1 为实质胜利；再有一份全员履约安排为外交胜利。下面的徽章只作展示，不再决定胜负。</p>
      {(snapshot.milestones?.[snapshot.playerRole]??[]).map(m=><p key={m.id}>{m.earned?'★':'☆'} {m.label}：{m.description}</p>)}
    </details></section>;
}
function Results({snapshot}:{snapshot:Snapshot}){
  const mine=snapshot.results?.[snapshot.playerRole];
  return <><h2>{mine?.diplomaticVictory?'你达成了外交胜利！':mine?.substantiveVictory?'你达成了实质胜利！':'四回合结束，所有偏好揭晓'}</h2>
    {roles.map(r=>{const result=snapshot.results?.[r],pref=snapshot.revealedPreferences?.[r]??result?.preference;if(!result||!pref)return null;
      return <article key={r} className="g-result"><h3>{names[r]} · {result.diplomaticVictory?'外交胜利':result.substantiveVictory?'实质胜利':'未获胜'}</h3>
      <strong>{pref.label} · {pref.blurb}</strong>
      <p>开局 U {fmt(result.initial)} → 终局 U {fmt(result.utility)} · 相对提升 ΔU {sgn(result.delta)}（门槛 {fmt(result.deltaThreshold)}）</p>
      <p>实质胜利：{result.substantiveVictory?'达成':'未达成'} · 外交胜利：{result.diplomaticVictory?'达成':'未达成'}</p>
      <WeightBars preference={pref} terms={result.terms} labels={snapshot.termLabels}/>
      <p className="g-note">里程碑：{(snapshot.milestones?.[r]??[]).map(m=>`${m.earned?'★':'☆'} ${m.label}`).join('；')}</p>
      <small>信用 {result.credit}/2 · 全员履约安排 {result.fulfilledDeals} · 终局指标 T {fmt(snapshot.state.T)} / A {fmt(snapshot.state.A)} / E {fmt(snapshot.state.E)} / S {fmt(snapshot.state.S)}{r==='US'?` / P ${snapshot.state.P}`:''}</small></article>})}</>;
}
function StatusHud({snapshot}:{snapshot:Snapshot}){
  const index=phaseOrder.indexOf(snapshot.phase),own=snapshot.roles.find(r=>r.id===snapshot.playerRole);
  return <div className="g-statusbar" aria-label="回合与阶段进度"><span className="g-statusround">第 {snapshot.round}/{snapshot.totalRounds} 回合</span>
    <ol className="g-phasechain">{phaseOrder.map((p,i)=><li key={p} className={i===index?'now':i<index?'done':''} aria-current={i===index?'step':undefined}>{phaseName[p]}</li>)}</ol>
    <span className="g-statusmeta">{snapshot.focusIssue?`焦点 · ${issueLabel(snapshot.focusIssue)}`:'焦点 · 待首方宣示'}</span>
    <span className="g-statusmeta">信用 {own?.credit??1}/2</span></div>;
}
function NewsWire({news,round}:{news:NewsItem[];round:number}){
  if(!news.length)return <p className="g-note">本轮还没有电讯。每个阶段结束后，通讯社会就刚发生的事发一批稿。</p>;
  return <div className="g-wire">{news.map(item=>{const image=item.image||'talks';return <article key={item.id} className="g-wirecard">
    <img className="g-wireimg" src={`/news/${image}.webp`} alt={item.caption||'新闻配图'} width={960} height={640} loading="lazy"/>
    <div className="g-wirebody">
      <small className="g-wiresource">{dateline[item.role]??'本刊电'} · 第 {round} 回合 · {item.source==='llm'?'通讯社电稿':'本刊模板稿'}</small>
      <h4>{item.headline}</h4>
      <p>{item.body}</p>
      <div className="g-wiretags"><span className="g-wiretag">{wireLabel[item.kind]}</span>{item.issue&&<span className="g-wiretag">{item.issue}</span>}{item.focus&&<span className="g-wiretag g-wirefocus">焦点议题</span>}</div>
    </div>
    <small className="g-wirecaption">{item.caption??'示意图'}</small></article>})}</div>;
}
function SecretaryPanel({advice,busy,onAsk}:{advice:SecretaryAdvice|null;busy:boolean;onAsk:()=>unknown}){
  return <div className="g-aide"><p className="g-note">只分析你可见的信息，建议不代替决定，也不会阻止下一步。</p>
    {busy?<p role="status">秘书正在整理当前要求…你可以继续操作。</p>:advice?<><h3>对方要求</h3>{advice.otherRequests.map((s,i)=><p key={i}>{s}</p>)}<h3>可能动机 · 推测</h3>{advice.possibleMotives.map((s,i)=><p key={i}>推测：{s.text}</p>)}<p>相关措施：{advice.relevantActions.map(cardName).join('、')}</p>{advice.risks.map((s,i)=><p key={i}>{s}</p>)}</>:<p>磋商信息齐备后自动提供一次建议；也可主动询问。</p>}
    <button disabled={busy} onClick={onAsk}>请秘书建议</button></div>;
}
function Beliefs({snapshot}:{snapshot:Snapshot}){
  const ownPrefs=snapshot.preferenceCatalogue?.[snapshot.playerRole];
  if(!ownPrefs?.[0]||!ownPrefs?.[1])return null;
  const others=roles.filter(r=>r!==snapshot.playerRole&&(snapshot.preferenceCatalogue[r]?.[0]&&snapshot.preferenceCatalogue[r]?.[1])),own=snapshot.ownImage??.5;
  return <section className="g-beliefs"><p className="g-note">每个代表按公开规则更新对其他方<strong>偏好类型</strong>的后验：似然不是写死的表，而是从行为策略 σ(a|θ) 读出来的——先按各类型对当前公开局势算期望效用，再 softmax 成它选各行动的概率，观测到某个行动就按该行动在该类型下的概率更新。因此同一个姿态在不同局势下信息量不同；公开措施与履约/违约是强信号，私聊只影响收件人。他方会按各自的判断调整回应与行动。</p><div className="g-beliefgrid">{others.map(r=>{const p=snapshot.beliefs?.[r]??.5,prefs=snapshot.preferenceCatalogue[r];return <div key={r} className="g-belief"><div className="g-beliefhead"><strong>{names[r]}</strong><small>{prefs[0].label} {pct(p)}% · {prefs[1].label} {pct(100-pct(p))}%</small></div><div className="g-beliefbar" role="img" aria-label={`你对${names[r]}的判断：${prefs[0].label} ${pct(p)}%，${prefs[1].label} ${pct(100-pct(p))}%`}><span style={{width:`${pct(p)}%`}}/><span style={{width:`${100-pct(p)}%`}}/></div><p className="g-note">{prefs[0].blurb}／{prefs[1].blurb}</p></div>})}</div><p className="g-ownimage">你的公开形象：仅按公开信息，其他方认为你 {pct(own)}% 是「{ownPrefs[0].label}」、{pct(100-pct(own))}% 是「{ownPrefs[1].label}」。你发出的私聊与未公开措施不会计入。</p></section>;
}
function DealView({deal,viewer,canRespond,respond,contacts}:{deal:Deal;viewer:Role;canRespond:boolean;respond:(accept:boolean)=>unknown;contacts?:Role[]}){const invited=!!deal.commitments?.[viewer]&&!deal.accepted?.includes(viewer)&&deal.status==='pending';
 const partners=deal.participants.filter(r=>r!==viewer&&contacts?.includes(r));
 return <article className="g-deal"><h3>{names[deal.proposer]} 发起 · {statuses[deal.status]}</h3><p>参与方：{deal.participants.map(r=>names[r]).join('、')}</p>{invited&&!!partners.length&&<p className="g-hint">你与{partners.map(r=>names[r]).join('、')}此前有过定向磋商接触 · 已有沟通基础，条款更容易被接受。</p>}{deal.commitments?<>{deal.text&&<p>{deal.text}</p>}{Object.entries(deal.commitments).map(([r,id])=><p key={r}>{names[r as Role]} → <strong>{cardName(id!)}</strong> · {deal.accepted?.includes(r as Role)?'已同意':'待同意'}{deal.fulfillment?.[r as Role]!==undefined?(deal.fulfillment[r as Role]?' · 履约':' · 违约'):''}</p>)}</>:<p>条款仅参与方可见。</p>}{!!deal.conflicts?.length&&<div className="g-conflict">{deal.conflicts.map((c,i)=><p key={i}><strong>{names[c.role]}</strong>本轮就{issueLabel(c.issue)}公开表态为{toneLabel(c.tone)}（{levelLabel(c.level)}），而此条款与之相悖 · 兑现存疑，其他代表会据此降低接受意愿。</p>)}</div>}{!!deal.backing?.length&&<div className="g-backing">{deal.backing.map((b,i)=><p key={i} className={b.kind==='refuse'?'g-claim-refuse':''}>{names[b.party]} → {cardName(b.action)}：{b.kind==='refuse'?'他在磋商中明确拒绝过这一条 · 属于强塞':b.kind==='offer'?'他在磋商中说过愿意 · 有口头铺垫':b.kind==='consider'?'他在磋商中说过可以谈 · 有口头铺垫':b.kind==='request'?'你在磋商中要求过这一条 · 有铺垫':b.kind==='mention'?'磋商中提到过 · 未表态':b.contact?'磋商中谈过，但未就这一条表态':'本轮没谈过这一条 · 缺乏铺垫'}</p>)}</div>}{invited&&<div className="g-buttons"><button disabled={!canRespond} onClick={()=>respond(false)}>拒绝</button><button disabled={!canRespond} onClick={()=>respond(true)}>接受安排</button></div>}</article>}
function Preview({preview,snapshot,headingRef,changeAction}:{preview:ActionPreview|undefined;snapshot:Snapshot;headingRef:RefObject<HTMLHeadingElement|null>;changeAction:()=>void}){return <section className="g-preview" aria-label="措施后果预览"><div className="g-preview-heading"><h3 ref={headingRef} tabIndex={-1}>本轮预计 · 条件化后果</h3><button onClick={changeAction}>换一项措施</button></div>{preview?<><p>{preview.summary}</p><p className="g-note">情景前提：除分支明确列出的合作方外，其他代表均按保持现状估算；真实秘密选择未知。</p><details className="g-preview-premises"><summary>展开完整情景前提</summary>{preview.assumptions.map((s,i)=><p className="g-note" key={i}>{s}</p>)}</details>{preview.branches.map((b,i)=><article key={i}><strong>{b.label}{b.probability!==undefined?`（${Math.round(b.probability*100)}%）`:''}</strong><div className="g-changes">{metrics.filter(m=>b.delta[m.id]!==0).map(m=><span key={m.id}>{m.name} {fmt(snapshot.roundStart[m.id])} → {fmt(b.state[m.id])}（{b.delta[m.id]>=0?'+':''}{fmt(b.delta[m.id])}）{b.state[m.id]===m.max?' · 达到上限':b.state[m.id]===0?' · 达到下限':''}</span>)}</div><p className="g-branchu">按该情景：收益 U {fmt(b.utility??0)} · 相对提升 ΔU {sgn(b.deltaU??0)}（门槛 {fmt(snapshot.ownStanding.deltaThreshold)}）{b.substantive?' · 越过实质胜利线':' · 尚未越过'}</p>{b.delayed.map((d,j)=><p key={j}>{d.when}：{metricTitle(d.metric)} {d.amount>=0?'+':''}{d.amount}</p>)}{!!b.creditDelta&&<p>信用变化 {sgn(b.creditDelta)} → {b.credit}</p>}{!!b.fulfilledDelta&&<p>全员履约安排 +{b.fulfilledDelta}</p>}</article>)}{preview.riskIsEstimate&&<p>概率是所述情景下的估计，实际受其他方秘密选择影响。</p>}</>:<p>服务端暂未提供数值预览。请先展开计算规则；不据未知选择假设最终结果。</p>}<p className="g-note">其他方本轮选择未知，最终结果以统一结算为准。</p></section>}
function Report({report,brief}:{report:RoundReport;brief?:RoundBrief|null}){return <section className="g-report"><h3>第 {report.round} 回合 · 已公开结果</h3>{brief&&<div className="g-brief"><p className="g-eyebrow">本轮综述 · {brief.source==='llm'?'模型撰写':'模板稿'}</p><p className="g-brief-lead">{brief.summary}</p><p>{brief.moves}</p><p className="g-watch">{brief.watch}</p>{!!brief.backing?.length&&<p className="g-note">磋商与安排核对：{brief.backing.map(b=>`${b.party}的${b.measure}（${b.kind}）`).join('；')}。</p>}<p className="g-note">综述不含数字，数字以下方对账表为准。</p></div>}{report.focusIssue&&<p className="g-focus">本轮焦点议题：<strong>{issueLabel(report.focusIssue)}</strong>{report.focusRole?`（由${names[report.focusRole]}设定）`:''}——该议题上的安排相悖会对所有人公开。</p>}<div className="g-tablewrap"><table><thead><tr><th>指标</th><th>轮初</th><th>合计影响</th><th>取位/截断</th><th>结算后</th></tr></thead><tbody>{metrics.map(m=>{const adjustment=report.adjustment?.[m.id]??report.state[m.id]-report.roundStart[m.id]-report.delta[m.id];return <tr key={m.id}><th>{m.name}</th><td>{fmt(report.roundStart[m.id])}</td><td>{fmt(report.delta[m.id])}</td><td>{fmt(adjustment)}</td><td>{fmt(report.state[m.id])}{report.state[m.id]===m.max?'（上限）':report.state[m.id]===0?'（下限）':''}</td></tr>})}</tbody></table></div><p className="g-note">轮初 + 合计影响 + 取位/截断 = 结算后。达到边界时，继续同方向的增量会被截断。</p>{roles.map(r=><p key={r}>{names[r]}：<strong>{cardName(report.actions[r])}</strong>{report.sources[r]==='fallback'?' · 模型失败 · 确定性策略兜底':report.sources[r]==='timeout'?' · 玩家超时保持现状':''}</p>)}<details><summary>展开对账原因与履约</summary>{report.effects.map((e,i)=><p key={i}>{e.rule==='UNDISCLOSED'?'未公开方影响':e.description}：{Object.entries(e.delta).map(([k,v])=>`${metricTitle(k)} ${v!>=0?'+':''}${fmt(v!)}`).join('，')||'0'}</p>)}{report.deals.map(d=><DealView key={d.id} deal={d} viewer="US" canRespond={false} respond={()=>{}}/>)}{!!report.beliefShifts?.length&&<><h3>公开信号 · 类型后验更新</h3><p className="g-note">后验指各方「抽中偏好目录第一种」的概率，由行为策略 σ(a|θ) 推出的似然更新：公开措施与履约/违约是强信号，一句话的分量来自它与随后措施的关联；私聊与未公开措施不在其中。</p>{report.beliefShifts.map((s,i)=><p key={i}>{s.reason} → 对{names[s.target]}的公开判断 {Math.round(s.from*100)}% → {Math.round(s.to*100)}%</p>)}</>}{!!report.statementChecks?.length&&<><h3>言行一致性 · 宣示与措施核对</h3><p className="g-note">只核对同一议题：在其他议题上行动、或做出不具姿态的动作时不予核对（显示为未核对）。「看法」级别维持现状不算背离，「预告」与「红线」级别则算背离。</p>{report.statementChecks.map((c,i)=><p key={i}>{names[c.role]}：就{issueLabel(c.issue)}发表{toneLabel(c.tone)}（{levelLabel(c.level)}）{c.target?` · 点名${names[c.target]}`:''} → 实际{c.actual==='hidden'?'（未公开）':cardName(c.actual)}{c.consistent===undefined?' · 未核对':c.consistent?' · 一致 ✓':' · 背离，可信度下降'}（可信度 {Math.round(c.cred*100)}%）</p>)}</>}</details></section>}
