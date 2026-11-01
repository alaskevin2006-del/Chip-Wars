import { Component, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BookOpen } from 'lucide-react';
import { Avatar, Robot } from '../diplomacy/Illustrations';
import { api, ApiError, type Auth } from './api';
import { avatarRoles, cards, cardName, metrics, names, roles } from './catalogue';
import { CONTEXT_INTRO_STORAGE_KEY, IntroGuide, hasCompletedContextIntro } from './IntroGuide';
import AnnouncementPanel from './AnnouncementPanel';
import ReportPanel from './ReportPanel';
import RoundReview from './RoundReview';
import RulesGuide, { RULES_GUIDE_STORAGE_KEY, hasCompletedRulesGuide } from './RulesGuide';
import SubgameReview, { type RoundActionData } from './SubgameReview';
import type { ActionId, ActionPreview, ClaimKind, CommitLevel, Commitments, Deal, EndingNarrative, IssueId, Metric, NewsItem, Phase, Preference, PreviewBranch, Role, RoundBrief, RoundReport, SecretaryAdvice, Session, Snapshot, Standing, Statement, TermId, Tone } from './types';
import './styles.css';
import './report-results.css';


const phaseName: Record<Phase,string> = {announcement:'公开表态',negotiation:'闭门磋商',signing:'安排确认',actions:'实际措施',report:'公开战报',finished:'最终结果'};
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
const wireLabel:Record<NewsItem['kind'],string> = {announcement:'公开表态',talks:'闭门磋商',pact:'正式安排',nopact:'安排未成',kept:'履行安排',broken:'违背安排',consistent:'言行一致',deviated:'言行相悖'};
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
  if(operation==='action')return after.phase==='actions'&&!after.ownAction&&!after.submittedRoles.includes(role)&&(after.currentActor??role)===role&&after.legalActions.some(c=>c.id===payload?.actionId)&&sameSigned()&&terms(ownDeal(before))===terms(ownDeal(after))&&metrics.every(m=>before.roundStart[m.id]===after.roundStart[m.id]);
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
  const [introOpen,setIntroOpen] = useState(()=>!hasCompletedContextIntro());
  const [rulesGuideOpen,setRulesGuideOpen] = useState(false);
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
  // The aide reads one plain sentence and returns a structured card; the tags stay adjustable afterwards,
  // but the player never has to assemble four fields by hand before writing anything.
  const [stanceReason,setStanceReason] = useState('');
  const [drafted,setDrafted] = useState(false);
  const [stanceEdit,setStanceEdit] = useState<'issue'|'tone'|'level'|'target'|''>('');
  const [brief,setBrief] = useState<RoundBrief|null>(null);
  const briefKey = useRef('');
  const [ending,setEnding] = useState<EndingNarrative|null>(null);
  const [endingLoading,setEndingLoading] = useState(false);
  const endingKey = useRef('');
  const [panel,setPanel] = useState<'wire'|'intel'|'aide'>('wire');
  // The aide badge marks advice the player has not read yet; viewing the panel clears it.
  const [aideFresh,setAideFresh] = useState(false);
  const [news,setNews] = useState<NewsItem[]>([]); const newsKey=useRef('');
  const previewHeading=useRef<HTMLHeadingElement>(null); const actionsHeading=useRef<HTMLHeadingElement>(null);
  const [advice,setAdvice] = useState<SecretaryAdvice|null>(null);
  const [reportRound,setReportRound] = useState<number|null>(null);
  const [assistBusy,setAssistBusy]=useState(''); const assistFlight=useRef(false); const autoRounds=useRef(new Set<string>());
  const [polishNote,setPolishNote]=useState('');
  const [reference,setReference]=useState<ActionId|null>(null);
  // The role briefing shows once after a fresh start, before round 1: the drawn preference is
  // already known at that point, so it doubles as the "who am I / who might they think I am" card.
  const [roleIntroOpen,setRoleIntroOpen]=useState(false);
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
  useEffect(()=>{setSelectedAction(null);setAdvice(null);setReportRound(null);setDeclared(null);setNews([]);setBrief(null);setEnding(null);newsKey.current='';briefKey.current='';endingKey.current='';setStatementText('');setStanceInput('');setPolishNote('')},[snapshot?.round]);
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
  useEffect(()=>{
    if(!snapshot||!session||snapshot.phase!=='finished'){setEnding(null);setEndingLoading(false);endingKey.current='';return;}
    const key=`${snapshot.id}:${snapshot.round}:${snapshot.version}`;
    if(endingKey.current===key)return;
    endingKey.current=key;
    setEndingLoading(true);
    const auth={id:session.id,token:session.token},generation=epoch.current;
    api.ending(auth,snapshot.version).then(value=>{
      if(!mounted.current||epoch.current!==generation)return;
      if(value?.ending?.title&&Array.isArray(value.ending.paragraphs))setEnding(value.ending);
    }).catch(()=>{/* deterministic ending remains available */})
      .finally(()=>{if(mounted.current&&epoch.current===generation)setEndingLoading(false)});
  },[snapshot?.id,snapshot?.phase,snapshot?.round,snapshot?.version,session?.id]);
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
      save(value);adopt(value.snapshot,value,generation);setRulesGuideOpen(false);setRoleIntroOpen(true);setDraft('');setCommitments({});setDealText('');
    } catch(err){if(mounted.current&&epoch.current===generation)setError(messageOf(err))}
    finally{if(mounted.current&&epoch.current===generation){setBusy('');inFlight.current=false}}
  }
  async function reset() {
    const auth=current.current;if(!auth||busy==='reset')return;
    inFlight.current=true;const generation=++epoch.current;setBusy('reset');setError('');
    try {
      await api.remove(auth);
      if(!mounted.current||epoch.current!==generation)return;
      current.current=null;setSession(null);save(null);setRulesGuideOpen(false);setDraft('');setCommitments({});setDealText('');setAdvice(null);setSelectedAction(null);setPolishNote('');assistFlight.current=false;setAssistBusy('');setAideFresh(false);setDrafted(false);setStanceReason('');setStanceEdit('');setStatementText('');setStanceInput('');
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
  async function draftAnnouncement(text:string) {
    const auth=current.current;
    if(!auth)throw new Error('当前对局已不可用。');
    return api.draftStatement(auth,text);
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
        if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round&&current.current?.snapshot.phase===phase){setAdvice(value.advice);setAideFresh(true);}
      }
    }catch(err){if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round&&current.current?.snapshot.phase===phase)setError(`AI 请求失败：${messageOf(err)}`)}
    finally{if(mounted.current&&epoch.current===generation){assistFlight.current=false;setAssistBusy('')}}
  }
  async function draftStance() {
    const auth=current.current;if(!auth||assistFlight.current)return;
    // A blank draft is not an error: it asks the aide to propose a stance outright.
    const text=stanceInput.trim();
    const generation=epoch.current,round=auth.snapshot.round;
    assistFlight.current=true;setAssistBusy('stance');setError('');
    try {
      const value=await api.draftStatement(auth,text);
      if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round){
        setIssue(value.statement.issue);setStance(value.statement.tone);setLevel(value.statement.level);
        setNamed(value.statement.target||'');setStatementText(value.statement.text);
        setStanceReason(value.reason);setDrafted(true);setStanceEdit('');
      }
    }catch(err){if(mounted.current&&epoch.current===generation)setError(`幕僚未能判定：${messageOf(err)}。可以直接保持静默，或换一种说法后重试。`)}
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
  // Advice and the stance card are stage-specific: when the game moves on, last stage's answer is stale.
  useEffect(()=>{setAdvice(null);setDrafted(false);setStanceReason('');setStanceEdit('');setStatementText('');setStanceInput('')},[snapshot?.id,snapshot?.round,snapshot?.phase]);
  useEffect(()=>{if(panel==='aide')setAideFresh(false)},[panel,advice]);
  const ownReady=!!snapshot?.readyRoles.includes(snapshot.playerRole),negotiating=snapshot?.phase==='negotiation'&&!ownReady;
  const own=snapshot?.roles.find(r=>r.id===snapshot.playerRole);
  const ownDeal=snapshot?.deals.find(d=>d.round===snapshot.round&&d.status==='effective'&&d.commitments?.[snapshot.playerRole]);
  const promised=ownDeal?.commitments?.[snapshot!.playerRole];
  // Direct talks in this round or the last one count as a working relationship.
  const contacts=snapshot?[...new Set(snapshot.messages.filter(m=>m.to&&m.round>=snapshot.round-1&&(m.from===snapshot.playerRole||m.to===snapshot.playerRole)).map(m=>m.from===snapshot.playerRole?m.to!:m.from!))]:[];
  const tplCards = !snapshot||!tplKind?[]:(tplKind==='offer'||tplKind==='consider'?cards[snapshot.playerRole]:tplKind==='request'?roles.filter(r=>r!==snapshot.playerRole).flatMap(r=>cards[r]):roles.flatMap(r=>cards[r]));
  const legalCommitments=(role:Role)=>cards[role].filter(c=>c.id!=='S4'&&(c.id!=='C1'||snapshot!.round<4&&(snapshot!.researchUses??0)<3)&&(c.id!=='C4'||snapshot!.roundStart.P>=1)&&(c.id!=='N2'||snapshot!.roundStart.A<4));
  const validProposal=!!snapshot&&Object.keys(commitments).length>=2&&!!commitments[snapshot.playerRole]&&Object.entries(commitments).every(([r,id])=>legalCommitments(r as Role).some(c=>c.id===id));
  const roundDeals=snapshot?.deals.filter(deal=>deal.round===snapshot.round)??[];
  const report=snapshot?.reportHistory.find(r=>r.round===reportRound)??snapshot?.reportHistory.at(-1);
  const finishContextIntro=()=>{setIntroOpen(false);try{localStorage.setItem(CONTEXT_INTRO_STORAGE_KEY,'done')}catch{/* optional */}};
  const beginGameFromWelcome=()=>{if(hasCompletedRulesGuide())void start();else setRulesGuideOpen(true)};
  const completeRulesGuide=()=>{try{localStorage.setItem(RULES_GUIDE_STORAGE_KEY,'done')}catch{/* optional */}setRulesGuideOpen(false);if(!session)void start()};
  const primaryLabel=!snapshot?'':snapshot.phase==='finished'?'再来一局':snapshot.phase==='report'?`进入第 ${snapshot.round+1} 回合`:snapshot.phase==='actions'?snapshot.ownAction?'已提交，等待后续窗口':(snapshot.currentActor&&snapshot.currentActor!==snapshot.playerRole?`等待${names[snapshot.currentActor]}行动`:'提交本方措施'):snapshot.phase==='announcement'?snapshot.declaredRoles?.includes(snapshot.playerRole)?'已发表，等待其余代表':'保持静默':ownReady?'已确认，等待其余代表':snapshot.phase==='negotiation'?'谈判结束 · 进入安排确认':'确认完成 · 进入实际措施';
  const primaryDisabled=!!busy||!!snapshot&&(snapshot.phase==='actions'?(!!snapshot.ownAction||!selectedAction||!!snapshot.currentActor&&snapshot.currentActor!==snapshot.playerRole):snapshot.phase==='announcement'?!!snapshot.declaredRoles?.includes(snapshot.playerRole):['negotiation','signing'].includes(snapshot.phase)?ownReady:false);
  const stale=!!BUILD_TIME&&!!servedBuild&&servedBuild!==BUILD_TIME;
  const instructions:Record<Phase,[string,string]>={announcement:['就一个议题公开表态','美国先发言，其他方随后表态。也可以保持沉默。'],negotiation:['谈条件、起草安排','发消息和其他方谈条件，也可以起草一份包含各方行动的安排。安排提交后不会立即生效，而是在下一阶段由受邀方确认。'],signing:['确认是否签署安排','发起方在提交时已经确认；其余受邀方在这里决定接受或拒绝。所有受邀方接受后安排生效，任意一方拒绝则整份安排作废。看清各方的行动承诺后再确认。'],actions:['选择你本轮的实际行动','各方按 美国 → 荷兰 → 中国 → ASML 的顺序依次行动：先行动者的措施会公开，后行动者可以看到再作反应（ASML 的措施始终不公开）。轮到你时：选中措施，先看清它在各种情形下的得失预估，再提交——提交后不能更改。'],report:['看看措施改变了什么','看看这轮各方的行动把局势推向了哪里，以及你的收益变化。可以立即继续下一轮。'],finished:['查看你达成了什么','先看你的目标达成得如何，再看其他三方的结局——此时所有人的目标全部揭晓，可以看到每一方实际在最大化什么。']};
  return <div className="guided-app">
    <header className="g-header"><div><p className="g-eyebrow">CHIP DIPLOMACY · V1.6{buildLabel(BUILD_TIME)?` · 构建 ${buildLabel(BUILD_TIME)}`:''}</p><h1>Lithography-Crossboard光刻机棋局：芯片外交博弈</h1></div><div>{!introOpen&&!rulesGuideOpen&&<><button className="g-header-intro" onClick={()=>setIntroOpen(true)}><BookOpen aria-hidden="true" size={15}/>背景导读</button><button className="g-header-intro" onClick={()=>setRulesGuideOpen(true)}><BookOpen aria-hidden="true" size={15}/>规则导读</button></>}<small>DeepSeek · {health?.model||'连接中'}</small>{session&&<button onClick={reset} disabled={busy==='reset'}>结束对局</button>}</div></header>
    {stale&&<div className="g-stale" role="status">线上已有新版本（{buildLabel(servedBuild)}），你打开的是旧页面（{buildLabel(BUILD_TIME)}）。<button onClick={()=>location.reload()}>刷新页面</button></div>}
    {error&&<div className="g-error" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}>×</button></div>}
    {introOpen?<IntroGuide onComplete={finishContextIntro}/>:rulesGuideOpen?<RulesGuide role={playerRole} activeGame={!!session} disabled={!health?.enabled||!!busy||restoring} onBack={()=>setRulesGuideOpen(false)} onComplete={completeRulesGuide}/>:<>{!snapshot?<main className="g-welcome"><h2>选择你要扮演的角色</h2><p>游戏规则：开局你将秘密抽取一个只有自己知道的个人目标，它决定什么局面对你有利。四回合结束时，胜利进度（局面得分相对开局的提升）越过个人门槛、且声誉信用不低于 1，即为实质胜利；如果还达成过一份全员都履约的协议，则是外交胜利。游戏数值为虚构模拟，不代表现实政策预测。</p><div className="g-rolechoices">{roles.map(r=><button key={r} aria-pressed={playerRole===r} onClick={()=>setPlayerRole(r)}><Avatar role={avatarRoles[r]}/><strong>{names[r]} {r}</strong></button>)}</div><button className="primary" disabled={!health?.enabled||!!busy||restoring} onClick={beginGameFromWelcome}>{restoring?'恢复对局中…':busy==='start'?'正在创建对局…':hasCompletedRulesGuide()?'开始四回合博弈':'查看规则并开始'}</button>{(healthError||!health?.enabled)&&<p role="status">{healthError||'模型不可用：服务端尚未配置 DeepSeek，暂不能开始。'}</p>}</main>:<>
      <StatusHud snapshot={snapshot}/>
      <div className="g-layout">
      <div className="g-main">
      {snapshot.phase!=='finished'&&<MyPreference snapshot={snapshot}/>}
      <main className={snapshot.phase==='report'||snapshot.phase==='finished'?'g-task g-task-plain':'g-task'}><header><p className="g-eyebrow">{phaseName[snapshot.phase]} · 现在该做什么</p><h2>{instructions[snapshot.phase][0]}</h2><p>{instructions[snapshot.phase][1]}</p>{snapshot.aiStatus?.busy&&<small role="status">{snapshot.aiStatus.role?names[snapshot.aiStatus.role]:'代表'}正在处理本阶段；你可以继续准备。</small>}</header>
        {snapshot.phase==='announcement'&&<AnnouncementPanel snapshot={snapshot} busy={!!busy} onDraft={draftAnnouncement} onDeclare={doDeclare}/>}
        {snapshot.phase==='negotiation'&&<>
          <details className="g-reference">
            <summary>先看中文措施速查 · 我能交换什么？</summary>
            {roles.map(r=><div key={r}><h3>{names[r]}</h3>{cards[r].map(c=><button key={c.id} onClick={()=>setReference(c.id)}>{c.name}</button>)}</div>)}
          </details>
          <section aria-label="磋商记录" className="g-messages">
            {snapshot.messages.length?snapshot.messages.map(m=><article key={m.id}><small>{names[m.from]} · 第 {m.round} 回合 · {m.to?`私聊 → ${names[m.to]}`:'公开'}</small><p><ActionText text={m.content} open={setReference}/></p></article>):<p>桌上还没有发言。可以先提出你想交换的行动。</p>}
          </section>
          <section className="g-compose">
            <h3>磋商发言 <small>{snapshot.messageCount}/2</small></h3>
            <div className="g-formrow">
              <label>发送给<select aria-label="消息收件人" value={target} disabled={!negotiating} onChange={e=>setTarget(e.target.value as Role|'')}><option value="">公开 · 所有人</option>{roles.filter(r=>r!==snapshot.playerRole).map(r=><option key={r} value={r}>私聊 · {names[r]}</option>)}</select></label>
              <label>润色语气<select aria-label="润色语气" value={tone} onChange={e=>setTone(e.target.value as typeof tone)}><option value="neutral">中性</option><option value="firm">坚定</option><option value="friendly">友好</option></select></label>
            </div>
            <details className="g-saytpl">
              <summary>不会写？用模板组一句</summary>
              <p className="g-note">选态度和措施，一键生成发言填入输入框，填入后仍可修改；AI 改写不会改变你的原意。</p>
              <div className="g-tplrow">
                <div className="g-tplkinds" role="group" aria-label="模板态度">{sayTplKinds.map(k=><button key={k.kind} title={k.hint} className={tplKind===k.kind?'selected':''} aria-pressed={tplKind===k.kind} disabled={!negotiating} onClick={()=>{setTplKind(k.kind);setTplAction(null)}}>{k.label}</button>)}</div>
                <label>措施<select aria-label="模板措施" value={tplAction??''} disabled={!tplKind} onChange={e=>setTplAction((e.target.value||null) as ActionId|null)}><option value="">{tplKind?'选择措施':'先选态度'}</option>{tplCards.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              </div>
              {tplKind&&tplAction&&<p className="g-tplpreview">{sayTplSentence(tplKind,cardName(tplAction))}<button disabled={!negotiating} onClick={()=>setDraft(sayTplSentence(tplKind,cardName(tplAction)))}>填入发言框</button><button disabled={!negotiating||!!assistBusy} onClick={()=>void polishTemplate()}>{assistBusy==='tpl'?'改写中…':'AI 改写为正式措辞'}</button></p>}
            </details>
            <textarea aria-label="谈判消息" placeholder="写一句话：你希望对方做什么，愿意交换什么？" value={draft} disabled={!negotiating||snapshot.messageCount>=2} onChange={e=>setDraft(e.target.value)}/>
            <div className="g-buttons">
              <small>{count(draft)}/100 字</small>
              <button onClick={()=>assist('polish')} disabled={!negotiating||!!assistBusy||!draft.trim()||count(draft)>100}>{assistBusy==='polish'?'润色中…':'AI 润色'}</button>
              <button className="primary" disabled={!negotiating||!!busy||!draft.trim()||count(draft)>100||snapshot.messageCount>=2} onClick={async()=>{if(await write('message',{content:draft,target:target||null}))setDraft('')}}>发送</button>
            </div>
            {polishNote&&<small className="g-hint" role="status">{polishNote}</small>}
            <p className="g-note">发言只是磋商，不会改变局势指标，但会影响别人对你的判断（公开发言影响所有人，私聊只影响对方）。要形成有约束力的承诺，请起草正式安排，并在下一阶段由受邀方确认。</p>
            <details>
              <summary>＋ 起草正式安排（每轮 1 份）</summary>
              <p>选择你和至少一方的本轮合法行动承诺。提交后进入安排确认队列；口头承诺不具约束力，灰色交易不能签约。</p>
              {(snapshot.claims?.length??0)>0&&<div className="g-claims">
                <h4>桌上诉求 · 磋商里说出口的措施</h4>
                <p className="g-note">写进条款时按对方说过的态度判定：说过愿意或可以谈的更容易被接受，明确拒绝过的等于强塞，大概率被拒。</p>
                {(snapshot.claims??[]).map(c=><p key={c.id} className={`g-claim g-claim-${c.kind}`}><strong>{cardName(c.actionId)}</strong> · {names[c.from]}{c.to?` → ${names[c.to]}`:' · 公开'} · {snapshot.claimKinds?.[c.kind]??c.kind}{c.kind==='refuse'?' · 写进条款会被视为强塞':''} <button disabled={!negotiating||snapshot.proposalsMade>=1} onClick={()=>setCommitments(old=>({...old,[c.owner]:c.actionId}))}>填入 {names[c.owner]} 的承诺</button></p>)}
                {roles.filter(r=>r!==snapshot.playerRole&&!contacts.includes(r)).map(r=><p key={r} className="g-hint">本轮还没有与{names[r]}直接磋商；直接把条款递过去，会被视为缺乏诚意。</p>)}
              </div>}
              {roles.map(r=><label key={r}>{names[r]}<select aria-label={`${names[r]}协议承诺`} value={commitments[r]??''} disabled={!negotiating||snapshot.proposalsMade>=1} onChange={e=>setCommitments(old=>{const next={...old};if(e.target.value)next[r]=e.target.value as ActionId;else delete next[r];return next})}><option value="">{r===snapshot.playerRole?'选择你的承诺':'不参加'}</option>{legalCommitments(r).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>)}
              <textarea aria-label="协议说明" value={dealText} onChange={e=>setDealText(e.target.value)} placeholder="说明（可选，最多300字，不生成额外政策效果）"/>
              <button disabled={!negotiating||!!busy||!validProposal||count(dealText)>300||snapshot.proposalsMade>=1} onClick={()=>write('proposal',{commitments,text:dealText})}>起草并提交安排（已发起 {snapshot.proposalsMade}/1）</button>
            </details>
          </section>
        </>}
        {snapshot.phase==='signing'&&<section aria-label="安排确认">
          <h3>确认本轮安排</h3>
          <p className="g-note">发起方已在提交时确认；其余受邀方在这里决定接受或拒绝。所有受邀方确认后安排生效，任意一方拒绝则整份安排作废。签了就要做到：履约信用 +1，违约 −1。</p>
          {!!roundDeals.length&&<p className="g-hint">条款若与某方本轮公开表态相悖，会标出「兑现存疑」。拿不准时，右侧「幕僚」可分析接受或拒绝的利弊。</p>}
          {roundDeals.map(deal=><DealView key={deal.id} deal={deal} viewer={snapshot.playerRole} contacts={contacts} canRespond={!ownReady&&!busy} respond={accept=>write('respond',{dealId:deal.id,accept})}/>)}
          {!roundDeals.length&&<p>本轮没有进入确认的安排。确认完成后直接进入实际措施；没有安排仍可争取实质胜利。</p>}
        </section>}
        {snapshot.phase==='negotiation'&&roundDeals.length>0&&<section className="g-deal-queue" aria-label="安排确认队列">
          <div className="g-deal-queue-head"><h3>安排已进入确认队列</h3><span>{roundDeals.length} 份</span></div>
          <p>你已提交的安排不会在这里重复展开。完整条款将在下一阶段供受邀方确认。</p>
          {roundDeals.map(deal=><p key={deal.id}><strong>{deal.proposer===snapshot.playerRole?'你':names[deal.proposer]}</strong>提交 · 参与方：{deal.participants.map(name=>names[name]).join('、')} · 等待安排确认</p>)}
        </section>}
        {snapshot.phase==='actions'&&<><div className="g-announcelist">{(snapshot.actionOrder??(['US','NL','CN','AS'] as Role[])).map(r=>{const acted=snapshot.submittedRoles.includes(r),pub=snapshot.publicActions?.[r],mine=r===snapshot.playerRole;return <p key={r} className={acted||snapshot.currentActor===r?'':'g-pending'}><strong>{names[r]}</strong>{acted?(pub?`已行动：${cardName(pub)}`:'已行动（措施不公开）'):(snapshot.currentActor===r?(mine?'轮到你行动':'正在行动…'):(mine?'还没轮到你':'等待行动'))}</p>})}</div><p className="g-promise">{promised?`你的生效安排承诺：${cardName(promised)}。可以违约，但信用将减少。`:'本轮没有生效安排，按目标自由选择。'}</p><h3 ref={actionsHeading} tabIndex={-1} className="g-action-heading">可选措施</h3><p className="g-hint">选不准？右侧「幕僚」可比较各合法措施对你胜利进度的影响。</p><div className="g-actions">{snapshot.legalActions.map(c=><button key={c.id} className={selectedAction===c.id||snapshot.ownAction===c.id?'selected':''} aria-pressed={selectedAction===c.id||snapshot.ownAction===c.id} disabled={!!snapshot.ownAction||!!busy} onClick={()=>selectedAction===c.id?bringIntoView(previewHeading.current):setSelectedAction(c.id)}><strong>{c.name}</strong><span>{purpose[c.id]}</span></button>)}</div>{selectedAction&&<Preview preview={snapshot.actionPreviews?.find(p=>p.actionId===selectedAction)} snapshot={snapshot} headingRef={previewHeading} changeAction={()=>bringIntoView(actionsHeading.current)}/>}<details><summary>展开查看计算规则</summary>{snapshot.legalActions.filter(c=>!selectedAction||c.id===selectedAction).map(c=><p key={c.id}>{c.name}：{c.description}</p>)}</details>{snapshot.playerRole==='AS'&&snapshot.ownGreyRisk!==undefined&&<p>你的灰色交易当前查获风险约 {Math.round(snapshot.ownGreyRisk*100)}%（会随本轮各方政策变化）。</p>}{promised&&selectedAction&&promised!==selectedAction&&<p className="g-warning">此措施与你在正式安排中的承诺不同，提交将导致违约。</p>}{snapshot.ownAction&&<p role="status">你已提交：{cardName(snapshot.ownAction)}{snapshot.playerRole==='AS'?'（该措施不公开，查获除外）。':'（已公开）。'}等待其余各方行动与结算。</p>}</>}
        {snapshot.phase==='report'&&report&&<ReportPanel report={report} brief={brief} snapshot={snapshot}/>}
        {snapshot.phase==='finished'&&<ResultBoundary key={`${snapshot.id}:${snapshot.version}`} snapshot={snapshot}><Results snapshot={snapshot} ending={ending} endingLoading={endingLoading}/></ResultBoundary>}
      </main>
      <details className="g-situation"><summary>局势详情 · 指标、角色、规则与历史</summary><div className="g-metrics">{metrics.map(m=><div key={m.id}><strong>{m.name} {fmt(snapshot.state[m.id])}/{m.max}</strong><p>{m.explanation}</p>{(snapshot.state[m.id]===0||snapshot.state[m.id]===m.max)&&<p className="g-warning">{snapshot.state[m.id]===0?'已达下限':'已达上限'}：继续同方向变化会被截断。</p>}</div>)}</div><p>ASML重点监控：{snapshot.monitoring?'已触发':'未触发'}。{snapshot.pendingResearch?.map(x=>`第${x.dueRound}轮自主能力 +${x.amount}。`)}{snapshot.pendingPenalties?.map(x=>`第${x.dueRound}轮技术难度 +${x.amount}。`)}</p>{snapshot.roles.map(r=><details key={r.id}><summary>{r.name} · 信用 {r.credit}/2 · 履约 {r.fulfilledDeals}</summary><p>{r.description}</p>{(snapshot.preferenceCatalogue[r.id]??[]).map(p=><p key={p.id}>{p.label}（50%）：{p.blurb}；权重 {Object.entries(p.weights??{}).map(([t,w])=>`${snapshot.termLabels[t as TermId]??t} ${pct(w??0)}%`).join('、')}</p>)}<p className="g-note">成就徽章（仅纪念，不计分）：{(snapshot.milestones?.[r.id]??[]).map(m=>`${m.earned?'★':'☆'} ${m.label}`).join('；')}</p></details>)}<details><summary>统一收益与胜利规则</summary><p>局面得分 U = 目标权重对归一化局势项加权求和（有效 T=max(0,T−0.5×max(0,S−2))，T/A/E/S 各除以 5，渠道敞口=(5−有效T)/5，低压制=1−A/5，美国低压力=1−P/2）+ 0.05×(信用−1) + 0.05×全员履约安排数。胜利进度 = 当前局面得分 − 开局得分。第四回合末胜利进度 ≥ {fmt(snapshot.ownStanding.deltaThreshold)} 且信用 ≥1 为实质胜利，另需至少一份全员履约安排才是外交胜利。胜利线分两档：主动方（美国/荷兰）0.12、被遏制方（中国/ASML）0.08，避免某方因结构劣势被卡死。成就徽章以现实事件为原型命名，达成条件按各目标路线的可达性分别校准分数线，达成时亮起，只作纪念、不计入胜负。</p></details><h3>公开战报档案</h3>{snapshot.reportHistory.length?<><select aria-label="历史回合" value={report?.round??''} onChange={e=>setReportRound(Number(e.target.value))}>{snapshot.reportHistory.map(r=><option key={r.round} value={r.round}>第 {r.round} 回合</option>)}</select>{report&&<ReportPanel report={report} snapshot={snapshot}/>}</>:<p>结算后保留各轮战报。</p>}</details>
      {!!snapshot.notices.length&&<details className="g-notices"><summary>模型与服务提示（{snapshot.notices.length}）</summary>{snapshot.notices.map((n,i)=><p key={i}>第{n.round}轮 · {n.role?names[n.role]:''}：{n.message}</p>)}</details>}
      </div>
      <aside className="g-hud" aria-label="固定栏：电讯、情报与幕僚">
        <div className="g-hudtabs" role="tablist" aria-label="固定栏面板">
          <button type="button" role="tab" aria-selected={panel==='wire'} className={panel==='wire'?'selected':''} onClick={()=>setPanel('wire')}>电讯{news.length?`（${news.length}）`:''}</button>
          <button type="button" role="tab" aria-selected={panel==='intel'} className={panel==='intel'?'selected':''} onClick={()=>setPanel('intel')}>情报</button>
          <button type="button" role="tab" aria-selected={panel==='aide'} className={panel==='aide'?'selected':''} onClick={()=>setPanel('aide')}>幕僚{aideFresh&&panel!=='aide'?'（新）':''}</button>
        </div>
        {snapshot.phase!=='finished'&&panel==='wire'&&<NewsWire news={news} round={snapshot.round}/>}
        {snapshot.phase!=='finished'&&panel==='intel'&&<Beliefs snapshot={snapshot}/>}
        {snapshot.phase!=='finished'&&panel==='aide'&&<SecretaryPanel advice={advice} busy={assistBusy==='secretary'} phase={snapshot.phase} onAsk={()=>void assist('secretary')}/>}
      </aside>
      </div>
      <footer className="g-next"><div><strong>下一步</strong><p>{ownReady?'你已确认，等待其余代表。':snapshot.phase==='announcement'?'可以写一句话让幕僚判定，也可以留白让幕僚代拟；不选则保持静默。':snapshot.phase==='actions'?(snapshot.ownAction?'已提交，等待后续窗口与结算。':(snapshot.currentActor&&snapshot.currentActor!==snapshot.playerRole?`等待${names[snapshot.currentActor]}行动，可先研究预览。`:'轮到你时选中措施、看预览后提交；未提交前可更换，也可选择维持现状。')):snapshot.phase==='negotiation'?'磋商和安排起草完成后，进入安排确认；没有安排也可以直接进入。':snapshot.phase==='signing'?'处理完收到的安排后进入实际措施；未确认的安排会作废。':snapshot.phase==='report'||snapshot.phase==='finished'?'':'查看结果后可重新开局。'}</p></div><button className="primary" disabled={primaryDisabled} onClick={()=>snapshot.phase==='finished'?reset():snapshot.phase==='announcement'?doDeclare(null):snapshot.phase==='actions'?selectedAction&&write('action',{actionId:selectedAction}):write(snapshot.phase==='report'?'next':'ready')}>{primaryLabel}</button></footer>
    </>}
    {snapshot&&roleIntroOpen&&<RoleIntro snapshot={snapshot} onEnter={()=>setRoleIntroOpen(false)}/>}
    {reference&&<div className="g-overlay"><section role="dialog" aria-modal="true" aria-label="措施说明" className="g-dialog"><h2>{cardName(reference)}</h2><p>{purpose[reference]}</p><p>{Object.values(cards).flat().find(c=>c.id===reference)?.description}</p><small>这是公开的行动规则，不代表对方已经选择。</small><button onClick={()=>setReference(null)}>关闭措施说明</button></section></div>}
    <p className="g-disclaimer">虚构策略游戏 · 所有数值为游戏假设 [G]</p>
    </>}
  </div>;
}

function bringIntoView(element:HTMLElement|null){
  // Immediate scrolling avoids animation, including for reduced-motion preferences.
  element?.scrollIntoView?.({block:'start',behavior:'auto'});element?.focus({preventScroll:true});
}
const fmt=(n:number)=>Number(n.toFixed(2)).toString();
const metricTitle=(key:string)=>metrics.find(m=>m.id===key)?.name??key;
const purpose:Record<ActionId,string>={U1:'提高技术限制，但会损失商业收益。',U2:'降低技术限制、缓和压力，并改善商业环境。',U3:'争取荷兰合作，提高政策协调；需要对方配合。',U4:'付出少量商业成本，加强对灰色交易的查处。',C1:'牺牲当前收益，积累下一回合的自主技术。',C2:'让美国承受材料压力，但不会自动迫使其让步。',C3:'争取中荷商业合作，降低美荷协调。',C4:'放松已有材料限制，作为谈判让步并改善收益。',N1:'配合技术限制，提高协调但牺牲商业收益。',N2:'放宽有限许可；需要ASML合规订单配合。',N3:'配合美国争取协调，单独使用没有收益。',S1:'在荷兰许可配合下执行合规订单。',S2:'拓展非中国市场，改善收益但提高中国技术获取难度。',S4:'收益潜力高，但查获会损失收益、信用并带来后续处罚。',PASS:'保持现状，不产生本方行动效果。'};
function ActionText({text,open}:{text:string;open:(id:ActionId)=>void}){return <>{text.split(/\b([UCNS][1-4])\b/g).map((part,i)=>Object.values(cards).flat().some(c=>c.id===part)?<button className="g-inline" key={i} onClick={()=>open(part as ActionId)}>{cardName(part)}<small> {part}</small></button>:<span key={i}>{part.replace(/\b(US|CN|NL|AS|[TAESP])\b/g,key=>names[key as Role]??`${metricTitle(key)}（${key}）`)}</span>)}</>}
const statuses:Record<Deal['status'],string>={pending:'等待参与方确认',effective:'已生效',rejected:'已拒绝',expired:'已过期',conflict:'安排冲突',fulfilled:'全员履约',breached:'存在违约'};
const pct=(n:number)=>Math.round(n*100);
const sgn=(n:number)=>(n>=0?'+':'')+fmt(n);
// A personal goal is a weighting of the public situation: it says what a state is worth, never what you may do.
// Players see the weighting as one plain line — the arithmetic behind it (current value × weight) is
// accounting, not a decision input, so it lives only in the rulebook details.
function WeightLine({preference,labels}:{preference:Preference;labels:Record<TermId,string>}){
  const entries=(Object.entries(preference.weights??{}) as [TermId,number][]).sort((a,b)=>b[1]-a[1]);
  return <p className="g-note">你的分数取决于：{entries.map(([t,w])=>`${labels[t]??t} ${pct(w)}%`).join(' ｜ ')}</p>;
}
function MyPreference({snapshot}:{snapshot:Snapshot}){
  const standing=snapshot.ownStanding,own=snapshot.roles.find(r=>r.id===snapshot.playerRole);
  const need=Math.max(0,standing.deltaThreshold-standing.delta);
  return <section className="g-goal g-goalslim" aria-label="我的个人目标与胜利进度">
    <div className="g-goalhead"><div><p className="g-eyebrow">你代表 {names[snapshot.playerRole]} · 第 {snapshot.round}/4 回合</p><h2>我的目标：{snapshot.ownPreference.label}</h2></div>
    <strong className="g-credit">信用 {own?.credit??1}/2 · 全员履约 {own?.fulfilledDeals??0}</strong></div>
    <div className="g-utility"><div><strong>胜利进度 {sgn(standing.delta)} / 胜利线 {fmt(standing.deltaThreshold)}</strong><span>{standing.substantiveVictory?'已越过胜利线':`还差 ${fmt(need)} 达到胜利线`}</span></div><progress max={Math.max(standing.deltaThreshold,.01)} value={Math.max(0,standing.delta)} aria-label="胜利进度"/></div>
    <p className="g-note">局面得分 {fmt(standing.initial)} → {fmt(standing.utility)}（含信用与履约的小额加成）· 目标权重见右侧情报。</p></section>;
}
// The once-per-game briefing between role choice and round 1: the personal goal is already drawn, so it
// states who you are, what your score rides on, and the one thing opponents can never see.
function RoleIntro({snapshot,onEnter}:{snapshot:Snapshot;onEnter:()=>void}){
  const prefs=snapshot.preferenceCatalogue?.[snapshot.playerRole]??[];
  const other=prefs.find(p=>p.id!==snapshot.ownPreference.id);
  return <div className="g-overlay"><section role="dialog" aria-modal="true" aria-label="本局个人目标" className="g-dialog">
    <p className="g-eyebrow">开局个人目标 · 正式进入第一回合之前</p>
    <h2>你代表 {names[snapshot.playerRole]}</h2>
    <h3>本局你的个人目标：{snapshot.ownPreference.label}</h3>
    <p>{snapshot.ownPreference.blurb}</p>
    <WeightLine preference={snapshot.ownPreference} labels={snapshot.termLabels}/>
    <p className="g-note">个人目标只改变局面对你值多少，不改变你的合法行动。对手看不到你的实际目标，只知道「{snapshot.ownPreference.label}」{other?`或「${other.label}」`:''}两种可能，并从你的言行不断猜测。</p>
    <p><strong>胜利条件：</strong>第四回合末，胜利进度 ≥ {fmt(snapshot.ownStanding.deltaThreshold)} 且信用 ≥1 为实质胜利；再有一份全员履约安排为外交胜利。</p>
    <p className="g-note">拿不准怎么表态、怎么谈？右侧「幕僚」面板随时可问：他只分析你可见的信息，建议不代替决定。</p>
    <div className="g-buttons"><button className="primary" onClick={onEnter}>进入第一回合</button></div>
  </section></div>;
}
function resultVerdict(result:Standing){
  if(result.diplomaticVictory)return '外交胜利';
  if(result.substantiveVictory)return '实质胜利 · 无外交履约';
  if(result.credit<1&&result.delta>=result.deltaThreshold)return '数值过线 · 信用不足';
  if(result.delta<result.deltaThreshold)return `未过胜利线 · 差 ${fmt(result.deltaThreshold-result.delta)}`;
  return '未获胜';
}
function publicChanceText(report:RoundReport){
  const u3=report.effects.find(effect=>effect.rule==='U3_RANDOM');
  if(u3)return u3.description;
  const caught=report.actions.AS==='S4'||report.effects.some(effect=>['S4','S4_FINAL','U4_CAUGHT'].includes(effect.rule));
  if(caught)return '灰色交易被查获，信用与延迟处罚已进入公开结算。';
  return '公开战报没有披露其他随机结论；未公开措施仅保留合计影响。';
}
function actionRoundsFromReports(reports:RoundReport[]):RoundActionData[]{
  let researchUses=0;
  return reports.map(report=>{
    const cn:ActionId[]=['C2','C3'];
    if(report.round<4&&researchUses<3)cn.push('C1');
    if(report.roundStart.P>=1)cn.push('C4');
    cn.push('PASS');
    const legal={
      US:['U1','U2','U3','U4','PASS'] as ActionId[],
      NL:(report.roundStart.A<4?['N1','N2','N3','PASS']:['N1','N3','PASS']) as ActionId[],
      CN:cn,
      AS:['S1','S2','S4','PASS'] as ActionId[],
    };
    if(report.actions.CN==='C1')researchUses++;
    return {round:report.round,actions:report.actions,start:report.roundStart,legal,sources:report.sources,chance:publicChanceText(report)};
  });
}
function endingStory(snapshot:Snapshot){
  const state=snapshot.state,results=snapshot.results??({} as Record<Role,Standing>);
  const title=state.T>=4?'高壁垒、高协调，但商业空间收缩':state.A>=3.5?'协调上升，产业代价显现':'管制与商业仍未形成稳定平衡';
  const tech=state.T>=4?'技术获取难度处于高位':state.T<=2?'技术获取空间有所恢复':'技术获取难度处在中间区间';
  const alliance=state.A>=4?'美荷政策协调接近锁定':state.A<=2?'美荷政策协调明显减弱':'美荷协调保持在有限合作区间';
  const commercial=state.E<=2.5?'整体商业收益被压到低位':state.E>=4?'整体商业收益得到明显修复':'整体商业收益仍有承压';
  const winners=roles.filter(role=>results[role]?.diplomaticVictory);
  const substantive=roles.filter(role=>results[role]?.substantiveVictory&&!results[role]?.diplomaticVictory);
  const blocked=roles.filter(role=>results[role]?.delta>=results[role]?.deltaThreshold&&results[role]!.credit<1);
  const winnerLine=winners.length?`${winners.map(role=>names[role]).join('、')}取得外交胜利`:'没有角色取得外交胜利';
  const substantiveLine=substantive.length?`${substantive.map(role=>names[role]).join('、')}达成实质胜利但缺少全员履约安排`:'没有角色停留在“实质胜利、无外交履约”的状态';
  const creditLine=blocked.length?`${blocked.map(role=>names[role]).join('、')}虽达到数值门槛，却因信用不足失去胜利资格`:'没有角色因信用不足被挡在胜利线之外';
  return {
    title,
    paragraphs:[
      `四轮结束时，${tech}，${alliance}，${commercial}。T ${fmt(state.T)}、A ${fmt(state.A)}、E ${fmt(state.E)}、S ${fmt(state.S)}，美国国内产业压力为 ${fmt(state.P)}。这组状态显示，政策目标与产业成本没有同时被消除。`,
      `从胜负结算看，${winnerLine}；${substantiveLine}；${creditLine}。协议是否被兑现、信用是否保留，最终与指标变化共同决定了各方的位置。`,
      '这不是任何一方的彻底胜利，而是管制能力、盟友协调、商业损失与履约信用共同形成的阶段性结果。局势中的所有数值仍是游戏假设，不作为现实政策预测。',
    ],
  };
}
function Results({snapshot,ending,endingLoading}:{snapshot:Snapshot;ending?:EndingNarrative|null;endingLoading?:boolean}){
  const mine=snapshot.results?.[snapshot.playerRole];
  const orderedRoles=[snapshot.playerRole,...roles.filter(role=>role!==snapshot.playerRole)];
  const actionRounds=actionRoundsFromReports(snapshot.reportHistory);
  const narrative=ending??({...endingStory(snapshot),source:'template' as const});
  return <>
    <section className="pv-top-summary" aria-label="结局摘要">
      <p className="g-eyebrow">结局摘要 · {endingLoading?'AI 正在生成':narrative.source==='llm'?'AI 生成':'自动整理'}</p>
      <h2>{narrative.title}</h2>
      <p>{narrative.paragraphs[0]}</p>
      {narrative.paragraphs.length>1&&<details><summary>阅读完整结局</summary>{narrative.paragraphs.slice(1).map(text=><p key={text}>{text}</p>)}</details>}
    </section>
    <section className="pv-result-hero">
      <h2>{mine?.diplomaticVictory?'你达成了外交胜利！':mine?.substantiveVictory?'你达成了实质胜利！':'四回合结束，所有目标揭晓'}</h2>
      <p>{names[snapshot.playerRole]} · {snapshot.ownPreference.label}</p>
      {mine&&<div><span>胜利进度 {sgn(mine.delta)} / {fmt(mine.deltaThreshold)}</span><span>信用 {mine.credit}/2</span><span>全员履约 {mine.fulfilledDeals}</span></div>}
    </section>
    <section className="pv-comparison">
      <div className="pv-section-heading"><div><h3>四方最终状态</h3></div><small>可多人同时获胜</small></div>
      <div className="g-tablewrap"><table className="pv-comparison-table"><thead><tr><th>角色</th><th>目标</th><th>结果</th><th>ΔU / 门槛</th><th>信用</th><th>全员履约</th></tr></thead><tbody>
        {orderedRoles.map(role=>{const result=snapshot.results?.[role],pref=snapshot.revealedPreferences?.[role]??result?.preference;if(!result||!pref)return null;return <tr key={role} className={role===snapshot.playerRole?'is-player':''}><th>{names[role]}{role===snapshot.playerRole?' · 你':''}</th><td data-label="目标">{pref.label}</td><td data-label="结果">{resultVerdict(result)}</td><td data-label="ΔU / 门槛">{sgn(result.delta)} / {fmt(result.deltaThreshold)}</td><td data-label="信用">{result.credit}/2</td><td data-label="全员履约">{result.fulfilledDeals}</td></tr>})}
      </tbody></table></div>
    </section>
    <RoundReview snapshot={snapshot}/>
    {actionRounds.length>0&&<SubgameReview rounds={actionRounds}/>}
  </>;
}
class ResultBoundary extends Component<{snapshot:Snapshot;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true}}
  render(){
    if(this.state.failed)return <section className="pv-result-fallback" role="alert">
      <p className="g-eyebrow">最终结果</p>
      <h2>结局页部分内容加载失败</h2>
      <p>胜负已经结算。先显示可确认的最终状态；刷新页面可重新加载完整复盘。</p>
      <ResultFallbackTable snapshot={this.props.snapshot}/>
      <button type="button" onClick={()=>location.reload()}>重新加载</button>
    </section>;
    return this.props.children;
  }
}
function ResultFallbackTable({snapshot}:{snapshot:Snapshot}){
  const orderedRoles=[snapshot.playerRole,...roles.filter(role=>role!==snapshot.playerRole)];
  return <div className="g-tablewrap"><table className="pv-comparison-table"><thead><tr><th>角色</th><th>结果</th><th>ΔU / 门槛</th><th>信用</th></tr></thead><tbody>
    {orderedRoles.map(role=>{const result=snapshot.results?.[role];if(!result)return null;return <tr key={role} className={role===snapshot.playerRole?'is-player':''}><th>{names[role]}{role===snapshot.playerRole?' · 你':''}</th><td>{resultVerdict(result)}</td><td>{sgn(result.delta)} / {fmt(result.deltaThreshold)}</td><td>{result.credit}/2</td></tr>})}
  </tbody></table></div>;
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
// The same four advice fields carry different meaning per phase, so the headings say what the
// secretary was actually asked about this time.
const aideTitles:Record<Phase,[string,string,string]>={
  announcement:['桌上信号','各方口径 · 推测','值得留意的措施'],
  negotiation:['对方要求','可能动机 · 推测','相关措施'],
  signing:['条款要点','缔约动机 · 推测','条款相关措施'],
  actions:['桌上诉求与承诺','各方动向 · 推测','候选措施'],
  report:['本轮要点','各方动向 · 推测','相关措施'],
  finished:['桌上信号','各方动向 · 推测','相关措施']};
function SecretaryPanel({advice,busy,phase,onAsk}:{advice:SecretaryAdvice|null;busy:boolean;phase:Phase;onAsk:()=>unknown}){
  const [requests,motives,relevant]=aideTitles[phase]??aideTitles.negotiation;
  return <div className="g-aide"><p className="g-note">只分析你可见的信息，建议不代替决定，也不会阻止下一步。</p>
    {busy?<p role="status">幕僚正在分析当前{phaseName[phase]}局面…你可以继续操作。</p>:advice?<><h3>{requests}</h3>{advice.otherRequests.map((s,i)=><p key={i}>{s}</p>)}<h3>{motives}</h3>{advice.possibleMotives.map((s,i)=><p key={i}>推测：{s.text}</p>)}<p>{relevant}：{advice.relevantActions.map(cardName).join('、')}</p>{advice.risks.map((s,i)=><p key={i}>{s}</p>)}</>:<p>{phase==='negotiation'?'磋商信息齐备后自动提供一次建议；也可主动询问。':`随时可请幕僚就当前${phaseName[phase]}局面做一次分析。`}</p>}
    <button disabled={busy} onClick={onAsk}>{phase==='negotiation'?'请幕僚建议':'请幕僚分析'}</button></div>;
}
function Beliefs({snapshot}:{snapshot:Snapshot}){
  const ownPrefs=snapshot.preferenceCatalogue?.[snapshot.playerRole];
  if(!ownPrefs?.[0]||!ownPrefs?.[1])return null;
  const others=roles.filter(r=>r!==snapshot.playerRole&&(snapshot.preferenceCatalogue[r]?.[0]&&snapshot.preferenceCatalogue[r]?.[1])),own=snapshot.ownImage??.5;
  // The bar reads "A 60% · B 40%" but never says which colour is which — left/right labels fix that.
  // The signal line tells the player what they are actually being read on this turn.
  const signalByPhase:Record<Phase,string>={announcement:'公开宣示',negotiation:'磋商发言',signing:'签署确认',actions:'公开措施',report:'本轮结算',finished:'全局表现'};
  const signalSource=signalByPhase[snapshot.phase]??'公开行动';
  // If the leading type is true, what is that opponent more likely to do? Pure UI hint, no engine change.
  const typeTip:Record<string,string>={
    US_SEC:'倾向极限出口管制，会强压 ASML、要求盟友同步',
    US_ALLY:'追求美荷一致行动，重视盟友配合与一致行动，少走单边',
    CN_TECH:'会把国产替代当主线，持续累积自主能力，不在意短期技术获取困难',
    CN_TRADE:'倾向维持获取渠道与商业往来，争取 ASML/日方配合，避免被彻底排除',
    NL_ALLY:'愿意配合美方同步管制，对限制出口接受度高',
    NL_TRADE:'倾向保留许可自主、推动放松管制，对商业收益最敏感',
    AS_CN:'倾向扩大对华供给，对美方施压更敏感',
    AS_GLOBAL:'倾向接受管制换合规确定性，转非中国市场增长'};
  const leadHint=(id?:string)=>id?typeTip[id]||'':'';
  return <section className="g-beliefs">
    <div className="g-ownpref"><h3>我的个人目标 · {snapshot.ownPreference.label}</h3><p>{snapshot.ownPreference.blurb}</p><WeightLine preference={snapshot.ownPreference} labels={snapshot.termLabels}/><p className="g-note">胜利条件：第四回合末，胜利进度 ≥ {fmt(snapshot.ownStanding.deltaThreshold)} 且信用 ≥1 为实质胜利；再有一份全员履约安排为外交胜利。</p><p className="g-note">成就徽章（仅纪念，不计分）将在游戏结束后揭晓。</p></div>
    <p className="g-note">桌上对手会按你的<strong>公开行动</strong>倒推你更像哪一类目标；当前阶段决定他们读你的主要信号源是<strong>{signalSource}</strong>。公开措施与履约/违约是强信号，私聊只影响收件人。</p><div className="g-beliefgrid">{others.map(r=>{const p=snapshot.beliefs?.[r]??.5,prefs=snapshot.preferenceCatalogue[r];const lead=prefs[0].label,conf=pct(p);const leadId=p>=0.5?prefs[0].id:prefs[1].id;const hint=leadHint(leadId);return <div key={r} className="g-belief"><div className="g-beliefhead"><strong>{names[r]}</strong><small>{lead} {conf}%</small></div><div className="g-belieflabels"><span>{prefs[0].label}</span><span>{prefs[1].label}</span></div><div className="g-beliefbar" role="img" aria-label={`你对${names[r]}的判断：${prefs[0].label} ${conf}%，${prefs[1].label} ${100-conf}%`}><span style={{width:`${conf}%`}}/><span style={{width:`${100-conf}%`}}/></div><p className="g-note">你估他更像「{conf>=70?prefs[0].label:conf>=30?prefs[0].label:prefs[1].label}」{conf>=70?'（基本确定）':conf>=30?'（偏这类）':'（两边都像）'}{hint&&<br/>}{hint&&(`若判断属实：${hint}。`)}{prefs[0].blurb}／{prefs[1].blurb}</p></div>})}</div><p className="g-ownimage">你的公开形象：仅按公开信息，其他方认为你 {pct(own)}% 是「{ownPrefs[0].label}」、{pct(100-pct(own))}% 是「{ownPrefs[1].label}」。你发出的私聊与未公开措施不会计入。</p></section>;
}
function confirmationLabel(deal:Deal,role:Role){
  if(deal.accepted?.includes(role))return role===deal.proposer?'发起方已确认':'已确认';
  if(deal.status==='rejected')return '未确认 · 安排作废';
  if(deal.status==='expired')return '未确认 · 安排过期';
  if(deal.status==='conflict')return '未确认 · 安排冲突';
  return '待确认';
}
function DealView({deal,viewer,canRespond,respond}:{deal:Deal;viewer:Role;canRespond:boolean;respond:(accept:boolean)=>unknown;contacts?:Role[]}){
  const invited=!!deal.commitments?.[viewer]&&!deal.accepted?.includes(viewer)&&deal.status==='pending';
  return <article className="g-deal">
    <h3>{names[deal.proposer]} 发起 · {statuses[deal.status]}</h3>
    <p>参与方：{deal.participants.map(role=>names[role]).join('、')}</p>
    {deal.commitments?<>
      {deal.text&&<p>{deal.text}</p>}
      {Object.entries(deal.commitments).map(([participant,action])=><p key={participant}>
        {names[participant as Role]} → <strong>{cardName(action!)}</strong> · {confirmationLabel(deal,participant as Role)}
        {deal.fulfillment?.[participant as Role]!==undefined?(deal.fulfillment[participant as Role]?' · 履约':' · 违约'):''}
      </p>)}
    </>:<p>条款仅参与方可见。</p>}
    {!!deal.conflicts?.length&&<div className="g-conflict">
      {deal.conflicts.map((conflict,index)=><p key={index}><strong>{names[conflict.role]}</strong>本轮就{issueLabel(conflict.issue)}公开表态为{toneLabel(conflict.tone)}（{levelLabel(conflict.level)}），而此条款与之相悖 · 兑现存疑，其他代表会据此降低接受意愿。</p>)}
    </div>}
    {!!deal.backing?.length&&<div className="g-backing">
      {deal.backing.map((item,index)=><p key={index} className={item.kind==='refuse'?'g-claim-refuse':''}>{names[item.party]} → {cardName(item.action)}：{item.kind==='refuse'?'他在磋商中明确拒绝过这一条 · 属于强塞':item.kind==='offer'?'他在磋商中说过愿意 · 有口头铺垫':item.kind==='consider'?'他在磋商中说过可以谈 · 有口头铺垫':item.kind==='request'?'你在磋商中要求过这一条 · 有铺垫':item.kind==='mention'?'磋商中提到过 · 未表态':item.contact?'磋商中谈过，但未就这一条表态':'本轮没谈过这一条 · 缺乏铺垫'}</p>)}
    </div>}
    {invited&&<div className="g-buttons">
      <button disabled={!canRespond} onClick={()=>respond(false)}>拒绝安排</button>
      <button className="primary" disabled={!canRespond} onClick={()=>respond(true)}>确认并签署</button>
    </div>}
  </article>;
}
function previewRange(preview:ActionPreview) {
  const values=preview.branches.map(branch=>branch.deltaU??0);
  if(!values.length)return {min:0,max:0};
  return {min:Math.min(...values),max:Math.max(...values)};
}
function previewRangeText(preview:ActionPreview) {
  const {min,max}=previewRange(preview);
  return min===max?sgn(max):`${sgn(min)} 至 ${sgn(max)}`;
}
function metricDeltaPills(branch:PreviewBranch, ids:Metric[], showState=false) {
  return <div className="g-changes">{ids.filter(id=>branch.delta[id]!==0).map(id=>{
    const metric=metrics.find(item=>item.id===id)!;
    const delta=branch.delta[id];
    return <span key={id}>
      {metric.name} <b>{sgn(delta)}</b>
      {showState?`（${fmt(branch.state[id])}/${metric.max}）`:''}
      {branch.state[id]===metric.max?' · 已达上限':branch.state[id]===0?' · 已达下限':''}
    </span>;
  })}</div>;
}
function Preview({preview,snapshot,headingRef,changeAction}:{preview:ActionPreview|undefined;snapshot:Snapshot;headingRef:RefObject<HTMLHeadingElement|null>;changeAction:()=>void}){
  if(!preview)return <section className="g-preview" aria-label="措施后果预览">
    <div className="g-preview-heading"><h3 ref={headingRef} tabIndex={-1}>这个措施会带来什么</h3><button onClick={changeAction}>换个措施</button></div>
    <p>服务端暂未提供数值预览。可以展开措施规则，但不要把未知的其他方选择当成确定结果。</p>
  </section>;

  const branches=preview.branches;
  const commonIds=metrics.map(metric=>metric.id).filter(id=>{
    const first=branches[0]?.delta[id]??0;
    return first!==0&&branches.every(branch=>(branch.delta[id]??0)===first);
  });
  const variableIds=metrics.map(metric=>metric.id).filter(id=>!commonIds.includes(id));
  const commonBranch=branches[0];
  const range=previewRangeText(preview);
  const allSubstantive=branches.length>0&&branches.every(branch=>branch.substantive);
  const anySubstantive=branches.some(branch=>branch.substantive);
  const verdict=allSubstantive?'所有情形均可越过胜利线':anySubstantive?'部分情形可越过胜利线':'尚未越过胜利线';
  const comparisons=snapshot.actionPreviews??[];
  const hasBranchSpecials=branches.some(branch=>branch.delayed.length>0||!!branch.creditDelta||!!branch.fulfilledDelta);

  return <section className="g-preview" aria-label="措施后果预览">
    <div className="g-preview-heading">
      <div><p className="g-eyebrow">措施评估 · {preview.actionId}</p><h3 ref={headingRef} tabIndex={-1}>这个措施会带来什么</h3></div>
      <button onClick={changeAction}>换个措施</button>
    </div>
    <div className="g-preview-title"><strong>{cardName(preview.actionId)}</strong>{preview.riskIsEstimate&&<span>估算概率</span>}</div>
    <p className="g-preview-summary">{preview.summary}</p>

    <div className="g-preview-verdict">
      <div><span>胜利进度</span><strong>{range}</strong></div>
      <div><span>结果判断</span><strong>{verdict}</strong></div>
      <small>胜利线 {fmt(snapshot.ownStanding.deltaThreshold)} · 以当前可见行动为基础估算</small>
    </div>

    {commonIds.length>0&&<section className="g-preview-outcome">
      <h4>{branches.length===1?'预计变化':'无论哪种情形都会发生'}</h4>
      {commonBranch&&metricDeltaPills(commonBranch,commonIds,true)}
    </section>}

    {branches.length>1?<section className="g-preview-outcome">
      <h4>不同情形</h4>
      <div className="g-preview-branches">
        {branches.map((branch,index)=><article key={index}>
          <div className="g-preview-branch-head">
            <strong>{branch.label}</strong>
            {branch.probability!==undefined&&<span>{Math.round(branch.probability*100)}%</span>}
          </div>
          {metricDeltaPills(branch,variableIds)}
          {variableIds.every(id=>branch.delta[id]===0)&&<p className="g-branch-empty">无额外变化</p>}
          <p className={`g-branch-result ${branch.substantive?'is-positive':''}`}>胜利进度 <b>{sgn(branch.deltaU??0)}</b> · {branch.substantive?'越过胜利线':'尚未越过'}</p>
          {branch.delayed.map((item,itemIndex)=><p className="g-branch-extra" key={itemIndex}>{item.when}：{metricTitle(item.metric)} {sgn(item.amount)}</p>)}
          {!!branch.creditDelta&&<p className="g-branch-extra">信用 {sgn(branch.creditDelta)} → {branch.credit}/2</p>}
          {!!branch.fulfilledDelta&&<p className="g-branch-extra">全员履约安排 +{branch.fulfilledDelta}</p>}
        </article>)}
      </div>
    </section>:commonBranch&&<section className="g-preview-outcome">
      <h4>对个人目标的影响</h4>
      <p className={`g-branch-result ${commonBranch.substantive?'is-positive':''}`}>胜利进度 <b>{sgn(commonBranch.deltaU??0)}</b> · {commonBranch.substantive?'越过胜利线':`距离胜利线还差 ${fmt(Math.max(0,snapshot.ownStanding.deltaThreshold-(commonBranch.deltaU??0)))}`}</p>
      {commonBranch.delayed.map((item,index)=><p className="g-branch-extra" key={index}>{item.when}：{metricTitle(item.metric)} {sgn(item.amount)}</p>)}
      {!!commonBranch.creditDelta&&<p className="g-branch-extra">信用 {sgn(commonBranch.creditDelta)} → {commonBranch.credit}/2</p>}
      {!!commonBranch.fulfilledDelta&&<p className="g-branch-extra">全员履约安排 +{commonBranch.fulfilledDelta}</p>}
    </section>}

    {preview.riskIsEstimate&&<p className="g-preview-risk">概率会随其他方后续选择变化，这里是估算。</p>}

    <details className="g-preview-details">
      <summary>查看这个预估是怎么算的</summary>
      {preview.assumptions.map((assumption,index)=><p key={index}>{assumption}</p>)}
      {hasBranchSpecials&&<p>延迟效果、信用变化和安排履约已经计入对应情形的胜利进度。</p>}
      <div className="g-preview-scorelist">
        {branches.map((branch,index)=><p key={index}><span>{branch.label}</span><span>局面得分 {fmt(branch.utility??0)}</span><span>胜利进度 {sgn(branch.deltaU??0)}</span></p>)}
      </div>
    </details>

    {comparisons.length>1&&<details className="g-preview-compare">
      <summary>对比本轮可选措施</summary>
      <div className="g-preview-compare-list">
        {comparisons.map(item=><div key={item.actionId} className={item.actionId===preview.actionId?'is-current':''}>
          <strong>{cardName(item.actionId)}</strong>
          <span>胜利进度 {previewRangeText(item)}</span>
          <small>{item.summary}</small>
        </div>)}
      </div>
    </details>}
  </section>;
}
function Report({report,brief}:{report:RoundReport;brief?:RoundBrief|null}){return <section className="g-report"><h3>第 {report.round} 回合 · 已公开结果</h3>{brief&&<div className="g-brief"><p className="g-eyebrow">本轮综述 · {brief.source==='llm'?'模型撰写':'模板稿'}</p><p className="g-brief-lead">{brief.summary}</p><p>{brief.moves}</p><p className="g-watch">{brief.watch}</p>{!!brief.backing?.length&&<p className="g-note">磋商与安排核对：{brief.backing.map(b=>`${b.party}的${b.measure}（${b.kind}）`).join('；')}。</p>}<p className="g-note">综述不含数字，数字以下方对账表为准。</p></div>}{report.focusIssue&&<p className="g-focus">本轮焦点议题：<strong>{issueLabel(report.focusIssue)}</strong>{report.focusRole?`（由${names[report.focusRole]}设定）`:''}——该议题上的安排相悖会对所有人公开。</p>}<div className="g-tablewrap"><table><thead><tr><th>指标</th><th>轮初</th><th>合计影响</th><th>调整</th><th>结算后</th></tr></thead><tbody>{metrics.map(m=>{const adjustment=report.adjustment?.[m.id]??report.state[m.id]-report.roundStart[m.id]-report.delta[m.id];return <tr key={m.id}><th>{m.name}</th><td>{fmt(report.roundStart[m.id])}</td><td>{fmt(report.delta[m.id])}</td><td>{fmt(adjustment)}</td><td>{fmt(report.state[m.id])}{report.state[m.id]===m.max?'（上限）':report.state[m.id]===0?'（下限）':''}</td></tr>})}</tbody></table></div><p className="g-note">轮初 + 合计影响 + 调整 = 结算后。达到边界时，继续同方向的增量会被截断。</p>{roles.map(r=><p key={r}>{names[r]}：<strong>{cardName(report.actions[r])}</strong>{report.sources[r]==='fallback'?' · 模型失败 · 确定性策略兜底':report.sources[r]==='timeout'?' · 玩家超时保持现状':''}</p>)}<details><summary>展开对账原因与履约</summary>{report.effects.map((e,i)=><p key={i}>{e.rule==='UNDISCLOSED'?'未公开方影响':e.description}：{Object.entries(e.delta).map(([k,v])=>`${metricTitle(k)} ${v!>=0?'+':''}${fmt(v!)}`).join('，')||'0'}</p>)}{report.deals.map(d=><DealView key={d.id} deal={d} viewer="US" canRespond={false} respond={()=>{}}/>)}{!!report.beliefShifts?.length&&<><h3>各方现在怎么猜你</h3><p className="g-note">别人根据你的公开行动和履约记录，更新对你目标的猜测：公开措施与履约/违约影响最大，一句话的分量来自它与随后措施的关联；私聊与未公开措施不影响。</p>{report.beliefShifts.map((s,i)=><p key={i}>{s.reason} → 对{names[s.target]}的公开判断 {Math.round(s.from*100)}% → {Math.round(s.to*100)}%</p>)}</>}{!!report.statementChecks?.length&&<><h3>说的和做的核对</h3><p className="g-note">只核对同一议题：在其他议题上行动、或做出不具姿态的动作时不予核对（显示为未核对）。「看法」级别维持现状不算背离，「预告」与「红线」级别则算背离。</p>{report.statementChecks.map((c,i)=><p key={i}>{names[c.role]}：就{issueLabel(c.issue)}发表{toneLabel(c.tone)}（{levelLabel(c.level)}）{c.target?` · 点名${names[c.target]}`:''} → 实际{c.actual==='hidden'?'（未公开）':cardName(c.actual)}{c.consistent===undefined?' · 未核对':c.consistent?' · 一致 ✓':' · 背离，可信度下降'}（可信度 {Math.round(c.cred*100)}%）</p>)}</>}</details></section>}
