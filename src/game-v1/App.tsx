import { useEffect, useRef, useState } from 'react';
import { Avatar, Robot } from '../diplomacy/Illustrations';
import { api, ApiError, type Auth } from './api';
import { avatarRoles, cards, cardName, metrics, names, roles, effectiveT } from './catalogue';
import type { ActionId, ActionPreview, Commitments, Deal, Phase, Role, RoundReport, SecretaryAdvice, Session, Snapshot } from './types';
import './styles.css';


const phaseName: Record<Phase,string> = {negotiation:'谈判',signing:'签约',actions:'秘密行动',report:'公开战报',finished:'最终结果'};
const storageKey = 'chip-diplomacy-v16-session';
const count = (value:string) => Array.from(value).length;
const messageOf = (error:unknown) => error instanceof Error ? error.message : '请求未成功，请重试';
function save(auth: Auth|null) { try { if (auth) sessionStorage.setItem(storageKey,JSON.stringify(auth)); else sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ } }
function restore(): Auth|null { try { const value=JSON.parse(sessionStorage.getItem(storageKey)||'null'); return value && typeof value.id==='string' && typeof value.token==='string' ? {id:value.id,token:value.token} : null; } catch { return null; } }

export default function App() {
  const [playerRole,setPlayerRole] = useState<Role>('US');
  const [health,setHealth] = useState<{enabled:boolean;model:string}|null>(null);
  const [healthError,setHealthError] = useState('');
  const [session,setSession] = useState<Session|null>(null);
  const [restoring,setRestoring] = useState(false);
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [draft,setDraft] = useState('');
  const [tone,setTone] = useState<'neutral'|'firm'|'friendly'>('neutral');
  const [target,setTarget] = useState<Role|''>('');
  const [commitments,setCommitments] = useState<Commitments>({});
  const [dealText,setDealText] = useState('');
  const [selectedAction,setSelectedAction] = useState<ActionId|null>(null);
  const [advice,setAdvice] = useState<SecretaryAdvice|null>(null);
  const [reportRound,setReportRound] = useState<number|null>(null);
  const [assistBusy,setAssistBusy]=useState(''); const assistFlight=useRef(false); const autoRounds=useRef(new Set<string>());
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
    api.health().then(value=>{if(mounted.current)setHealth(value.llm)}).catch(()=>{if(mounted.current)setHealthError('模型不可用：无法连接服务端。请检查服务后刷新。')});
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
  useEffect(()=>{setSelectedAction(null);setAdvice(null);setReportRound(null)},[snapshot?.round]);

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
      current.current=null;setSession(null);save(null);setDraft('');setCommitments({});setDealText('');setAdvice(null);setSelectedAction(null);assistFlight.current=false;setAssistBusy('');
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
        try{adopt(await api.read(auth),auth,generation);setError('局面已更新，请核对后再次提交。你的草稿已保留。')}
        catch(refreshError){if(mounted.current&&epoch.current===generation)setError(`同步失败：${messageOf(refreshError)}。草稿已保留。`)}
      }else setError(messageOf(err));
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
        if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round)setDraft(existing=>existing===original?value.candidate:existing);
      }else{
        const value=await api.secretary(auth);
        if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round&&current.current?.snapshot.phase===phase)setAdvice(value.advice);
      }
    }catch(err){if(mounted.current&&epoch.current===generation)setError(`AI 请求失败：${messageOf(err)}`)}
    finally{if(mounted.current&&epoch.current===generation){assistFlight.current=false;setAssistBusy('')}}
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
  const legalCommitments=(role:Role)=>cards[role].filter(c=>c.id!=='S4'&&(c.id!=='C1'||snapshot!.round<4&&(snapshot!.researchUses??0)<3)&&(c.id!=='C4'||snapshot!.roundStart.P>=1)&&(c.id!=='N2'||snapshot!.roundStart.A<4));
  const validProposal=!!snapshot&&Object.keys(commitments).length>=2&&!!commitments[snapshot.playerRole]&&Object.entries(commitments).every(([r,id])=>legalCommitments(r as Role).some(c=>c.id===id));
  const report=snapshot?.reportHistory.find(r=>r.round===reportRound)??snapshot?.reportHistory.at(-1);
  const finishTour=()=>{setTutorial(null);try{localStorage.setItem('chip-guided-tour','done')}catch{/* optional */}};
  const primaryLabel=!snapshot?'':snapshot.phase==='finished'?'重新选择角色':snapshot.phase==='report'?`进入第 ${snapshot.round+1} 回合`:snapshot.phase==='actions'?snapshot.ownAction?'已提交，等待其余代表':'秘密提交行动':ownReady?'已就绪':snapshot.phase==='negotiation'?'结束谈判 · 就绪':'结束签约 · 就绪';
  const primaryDisabled=!!busy||!!snapshot&&(snapshot.phase==='actions'?(!!snapshot.ownAction||!selectedAction):['negotiation','signing'].includes(snapshot.phase)?ownReady:false);
  const instructions:Record<Phase,[string,string]>={negotiation:['先谈一笔对你有用的交换','先查看行动速查，再公开发言或私聊。可以发起正式协议，也可以不发言直接进入签约。'],signing:['决定接受哪些邀请','核对你要承诺的行动是否帮助目标；条款只对参与方可见。可以拒绝或跳过未处理邀请。'],actions:['选一张帮助目标的行动卡','选中后先看条件化后果预览，再秘密提交。其他代表的真实选择未知；提交后不能更改。'],report:['看看行动改变了什么','核对目标差距、公开行动、未公开方的合计影响和取位截断。可以立即继续下一轮。'],finished:['查看你达成了什么','先看自己的目标与信用，再展开所有角色的结局。']};
  return <div className="guided-app">
    <header className="g-header"><div><p className="g-eyebrow">CHIP DIPLOMACY · V1.6</p><h1>芯片外交</h1></div><div><small>DeepSeek · {health?.model||'连接中'}</small>{session&&<button onClick={reset} disabled={busy==='reset'}>结束对局</button>}</div></header>
    {error&&<div className="g-error" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}>×</button></div>}
    {!snapshot?<main className="g-welcome"><h2>代表一方，争取自己的目标。</h2><p>四方、四回合。先达成自己的私人目标，并守住信用；谈判能帮你争取合作。</p><div className="g-rolechoices">{roles.map(r=><button key={r} aria-pressed={playerRole===r} onClick={()=>setPlayerRole(r)}><Avatar role={avatarRoles[r]}/><strong>{names[r]} {r}</strong></button>)}</div><button className="primary" disabled={!health?.enabled||!!busy||restoring} onClick={start}>{restoring?'恢复对局中…':busy==='start'?'正在创建对局…':'开始四回合博弈'}</button><p role="status">{healthError||(!health?.enabled?'模型不可用：服务端尚未配置 DeepSeek，暂不能开始。':'真实 DeepSeek 参与 · 私人目标随机抽取 · 不需要输入密钥')}</p><details><summary>想多了解一点？</summary><p>达成全部目标条件且信用 ≥1，为实质胜利。额外有至少一份全员履约协议，可获得外交胜利；美国还需国内产业压力 ≤1。游戏数值不代表现实政策预测。</p></details></main>:<>
      <section className="g-goal" aria-label="我的目标和差距"><div className="g-goalhead"><div><p className="g-eyebrow">你代表 {names[snapshot.playerRole]} · 第 {snapshot.round}/4 回合</p><h2>我的目标：{snapshot.ownGoal.label}</h2><p>第四回合末达成下列目标，并守住信用。</p></div><strong className="g-credit">信用 {own?.credit??1}/2</strong></div><div className="g-goalprogress">{snapshot.ownGoal.conditions.map(c=>{const value=c.metric==='effectiveT'?effectiveT(snapshot.state):snapshot.state[c.metric];const gap=Math.max(0,c.operator==='gte'?c.value-value:value-c.value);return <div key={c.metric}><div><strong>{metricTitle(c.metric)} {fmt(value)}</strong><span>目标 {c.operator==='gte'?'≥':'≤'} {c.value} · {gap<.001?'已达标':`还差 ${fmt(gap)}`}</span></div><progress max={c.operator==='gte'?Math.max(c.value,.1):Math.max(5-c.value,.1)} value={c.operator==='gte'?Math.min(value,c.value):Math.max(0,5-value)}/></div>})}</div><details><summary>更进一步：外交胜利</summary><p>实质胜利需全部目标条件和信用 ≥1。外交胜利另需至少 1 份全员履约协议；你已参与 {own?.fulfilledDeals??0} 份。{snapshot.playerRole==='US'&&`美国还需国内产业压力 ≤1，目前 ${snapshot.state.P}。有效 T 是自主技术缓冲后的实际目标值。`}</p></details></section>
      <main className="g-task"><header><p className="g-eyebrow">{phaseName[snapshot.phase]} · 当前唯一任务</p><h2>{instructions[snapshot.phase][0]}</h2><p>{instructions[snapshot.phase][1]}</p>{snapshot.aiStatus?.busy&&<small role="status">{snapshot.aiStatus.role?names[snapshot.aiStatus.role]:'代表'}正在处理本阶段；你可以继续准备。</small>}</header>
        {snapshot.phase==='negotiation'&&<><details className="g-reference"><summary>先看中文行动速查 · 我能交换什么？</summary>{roles.map(r=><div key={r}><h3>{names[r]}</h3>{cards[r].map(c=><button key={c.id} onClick={()=>setReference(c.id)}>{c.name}</button>)}</div>)}</details><section aria-label="谈判记录" className="g-messages">{snapshot.messages.length?snapshot.messages.map(m=><article key={m.id}><small>{names[m.from]} · 第 {m.round} 回合 · {m.to?`私聊 → ${names[m.to]}`:'公开'}</small><p><ActionText text={m.content} open={setReference}/></p></article>):<p>桌上还没有声明。可以先提出你想交换的行动。</p>}</section><section className="g-compose"><h3>你的声明 <small>{snapshot.messageCount}/2</small></h3><div className="g-formrow"><label>发送给<select aria-label="消息收件人" value={target} disabled={!negotiating} onChange={e=>setTarget(e.target.value as Role|'')}><option value="">公开 · 所有人</option>{roles.filter(r=>r!==snapshot.playerRole).map(r=><option key={r} value={r}>私聊 · {names[r]}</option>)}</select></label><label>润色语气<select aria-label="润色语气" value={tone} onChange={e=>setTone(e.target.value as typeof tone)}><option value="neutral">中性</option><option value="firm">坚定</option><option value="friendly">友好</option></select></label></div><textarea aria-label="谈判消息" placeholder="写一句话：你希望对方做什么，愿意交换什么？" value={draft} disabled={!negotiating||snapshot.messageCount>=2} onChange={e=>setDraft(e.target.value)}/><div className="g-buttons"><small>{count(draft)}/100 字</small><button onClick={()=>assist('polish')} disabled={!negotiating||!!assistBusy||!draft.trim()||count(draft)>100}>AI 润色</button><button className="primary" disabled={!negotiating||!!busy||!draft.trim()||count(draft)>100||snapshot.messageCount>=2} onClick={async()=>{if(await write('message',{content:draft,target:target||null}))setDraft('')}}>发送</button></div><p className="g-note">润色只填入可编辑候选，不会自动发送。</p><details><summary>＋ 发起正式协议（每轮 1 份）</summary><p>选择你和至少一方的本轮合法行动承诺。口头承诺不算正式协议，灰色交付不能签约。</p>{roles.map(r=><label key={r}>{names[r]}<select aria-label={`${names[r]}协议承诺`} value={commitments[r]??''} disabled={!negotiating||snapshot.proposalsMade>=1} onChange={e=>setCommitments(old=>{const next={...old};if(e.target.value)next[r]=e.target.value as ActionId;else delete next[r];return next})}><option value="">{r===snapshot.playerRole?'选择你的承诺':'不参加'}</option>{legalCommitments(r).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>)}<textarea aria-label="协议说明" value={dealText} onChange={e=>setDealText(e.target.value)} placeholder="说明（可选，最多300字，不生成额外政策效果）"/><button disabled={!negotiating||!!busy||!validProposal||count(dealText)>300||snapshot.proposalsMade>=1} onClick={()=>write('proposal',{commitments,text:dealText})}>提交提案（已发起 {snapshot.proposalsMade}/1）</button></details></section></>}
        {['negotiation','signing'].includes(snapshot.phase)&&<section><h3>{snapshot.phase==='signing'?'本轮邀请与协议':'本轮正式提案'}</h3>{snapshot.deals.filter(d=>d.round===snapshot.round).map(d=><DealView key={d.id} deal={d} viewer={snapshot.playerRole} canRespond={snapshot.phase==='signing'&&!ownReady&&!busy} respond={accept=>write('respond',{dealId:d.id,accept})}/>)}{!snapshot.deals.some(d=>d.round===snapshot.round)&&<p>本轮尚无正式提案。你可以跳过签约，仍能争取实质胜利。</p>}</section>}
        {snapshot.phase==='actions'&&<><p className="g-promise">{promised?`你的生效协议承诺：${cardName(promised)}。可以违约，但信用将减少。`:'本轮没有生效承诺，按目标自由选择。'}</p><div className="g-actions">{snapshot.legalActions.map(c=><button key={c.id} className={selectedAction===c.id||snapshot.ownAction===c.id?'selected':''} aria-pressed={selectedAction===c.id||snapshot.ownAction===c.id} disabled={!!snapshot.ownAction||!!busy} onClick={()=>setSelectedAction(c.id)}><strong>{c.name}</strong><span>{purpose[c.id]}</span></button>)}</div>{selectedAction&&<Preview preview={snapshot.actionPreviews?.find(p=>p.actionId===selectedAction)} snapshot={snapshot}/>}<details><summary>展开查看计算规则</summary>{snapshot.legalActions.filter(c=>!selectedAction||c.id===selectedAction).map(c=><p key={c.id}>{c.name}：{c.description}</p>)}</details>{snapshot.playerRole==='AS'&&snapshot.ownGreyRisk!==undefined&&<p>你的基础查获风险 {Math.round(snapshot.ownGreyRisk*100)}%；实际受本轮政策及协调变化影响，不等于已知对方选择后的查获概率。</p>}{promised&&selectedAction&&promised!==selectedAction&&<p className="g-warning">此行动与你的正式承诺不同，提交将导致违约。</p>}{snapshot.ownAction&&<p role="status">你已秘密提交：{cardName(snapshot.ownAction)}。等待其他代表。</p>}</>}
        {snapshot.phase==='report'&&report&&<Report report={report}/>}
        {snapshot.phase==='finished'&&<><h2>{snapshot.results?.[snapshot.playerRole]?.diplomaticVictory?'你达成了外交胜利！':snapshot.results?.[snapshot.playerRole]?.substantiveVictory?'你达成了实质胜利！':'四回合结束，所有目标揭晓'}</h2>{roles.map(r=>{const result=snapshot.results?.[r];return result&&<article key={r} className="g-result"><h3>{names[r]} · {result.diplomaticVictory?'外交胜利':result.substantiveVictory?'实质胜利':'未获胜'}</h3><strong>{result.goal.label}</strong><p>{result.goal.conditions.map((c,i)=>`${metricTitle(c.metric)} ${c.operator==='gte'?'≥':'≤'}${c.value} ${result.conditionsMet[i]?'✓':'未达成'}`).join('；')}</p><p>实质胜利：{result.substantiveVictory?'达成':'未达成'} · 外交胜利：{result.diplomaticVictory?'达成':'未达成'}</p><small>信用 {result.credit}/2 · 全员履约协议 {result.fulfilledDeals}{r==='US'&&` · 国内压力 ${snapshot.state.P}（外交需≤1） · 有效 T ${fmt(result.effectiveT)}`}</small></article>})}</>}
      </main>
      {snapshot.phase!=='finished'&&<details className="g-secretary" open><summary><Robot active={assistBusy==='secretary'}/>随席秘书 · 辅助建议</summary><p className="g-note">只分析你可见的信息，建议不代替决定，也不会阻止下一步。</p>{assistBusy==='secretary'?<p role="status">秘书正在整理当前要求…你可以继续操作。</p>:advice?<><h3>对方要求</h3>{advice.otherRequests.map((s,i)=><p key={i}>{s}</p>)}<h3>可能动机 · 推测</h3>{advice.possibleMotives.map((s,i)=><p key={i}>推测：{s.text}</p>)}<p>相关行动：{advice.relevantActions.map(cardName).join('、')}</p>{advice.risks.map((s,i)=><p key={i}>{s}</p>)}</>:<p>谈判信息齐备后自动提供一次建议；也可主动询问。</p>}<button disabled={!!assistBusy} onClick={()=>assist('secretary')}>请秘书建议</button></details>}
      <details className="g-situation"><summary>局势详情 · 指标、角色、规则与历史</summary><div className="g-metrics">{metrics.map(m=><div key={m.id}><strong>{m.name} {fmt(snapshot.state[m.id])}/{m.max}</strong><p>{m.explanation}</p>{(snapshot.state[m.id]===0||snapshot.state[m.id]===m.max)&&<p className="g-warning">{snapshot.state[m.id]===0?'已达下限':'已达上限'}：继续同方向变化会被截断。</p>}</div>)}</div><p>ASML重点监控：{snapshot.monitoring?'已触发':'未触发'}。{snapshot.pendingResearch?.map(x=>`第${x.dueRound}轮自主能力 +${x.amount}。`)}{snapshot.pendingPenalties?.map(x=>`第${x.dueRound}轮技术难度 +${x.amount}。`)}</p>{snapshot.roles.map(r=><details key={r.id}><summary>{r.name} · 信用 {r.credit}/2 · 履约 {r.fulfilledDeals}</summary><p>{r.description}</p>{snapshot.goalCatalogue[r.id].map(g=><p key={g.id}>{g.label}（50%）：{g.conditions.map(c=>`${metricTitle(c.metric)} ${c.operator==='gte'?'≥':'≤'}${c.value}`).join('；')}</p>)}</details>)}<details><summary>有效 T 与胜利规则</summary><p>有效 T=max(0,T−0.5×max(0,S−2))。先达成目标和信用，再争取全员履约协议及美国压力条件。其他目标看公开 T。</p></details><h3>公开战报档案</h3>{snapshot.reportHistory.length?<><select aria-label="历史回合" value={report?.round??''} onChange={e=>setReportRound(Number(e.target.value))}>{snapshot.reportHistory.map(r=><option key={r.round} value={r.round}>第 {r.round} 回合</option>)}</select>{report&&<Report report={report}/>}</>:<p>结算后保留各轮战报。</p>}</details>
      {!!snapshot.notices.length&&<details className="g-notices"><summary>模型与服务提示（{snapshot.notices.length}）</summary>{snapshot.notices.map((n,i)=><p key={i}>第{n.round}轮 · {n.role?names[n.role]:''}：{n.message}</p>)}</details>}
      <footer className="g-next"><div><strong>下一步</strong><p>{ownReady?'你已就绪，等待其余代表。':snapshot.phase==='actions'?'未提交前可更换选择；也可选择维持现状。':snapshot.phase==='negotiation'?'可以不发言、不提案，直接进入签约。':snapshot.phase==='signing'?'可以跳过未接受的邀请；未全员接受的协议将失效。':snapshot.phase==='report'?'可以立即进入下一回合。':'查看结果后可重新开局。'}</p></div><button className="primary" disabled={primaryDisabled} onClick={()=>snapshot.phase==='finished'?reset():snapshot.phase==='actions'?selectedAction&&write('action',{actionId:selectedAction}):write(snapshot.phase==='report'?'next':'ready')}>{primaryLabel}</button></footer>
    </>}
    {snapshot&&tutorial!==null&&<div className="g-overlay"><section role="dialog" aria-modal="true" aria-label="一分钟上手" className="g-dialog"><p className="g-eyebrow">一分钟上手 · {tutorial+1}/3</p><h2>{['先看你的目标','每个阶段只做一件事','先看后果，再决定'][tutorial]}</h2><p>{['你代表的角色和目标差距始终在顶部。第四回合末达成目标并守住信用，是第一件事。','谈判可以交换行动，签约决定承诺，秘密行动才会改数值；底部按钮告诉你下一步。','行动选中后会显示条件化后果。别人的选择未知，预览不保证最终结果；公式和历史在局势详情。'][tutorial]}</p><div className="g-buttons"><button onClick={finishTour}>跳过引导</button><button className="primary" onClick={()=>tutorial===2?finishTour():setTutorial(tutorial+1)}>{tutorial===2?'开始我的回合':'下一步提示'}</button></div></section></div>}
    {reference&&<div className="g-overlay"><section role="dialog" aria-modal="true" aria-label="行动说明" className="g-dialog"><h2>{cardName(reference)}</h2><p>{purpose[reference]}</p><p>{Object.values(cards).flat().find(c=>c.id===reference)?.description}</p><small>这是公开的行动规则，不代表对方已经选择。</small><button onClick={()=>setReference(null)}>关闭行动说明</button></section></div>}
    <p className="g-disclaimer">虚构策略游戏 · 所有数值为游戏假设 [G]</p>
  </div>;
}

const fmt=(n:number)=>Number(n.toFixed(2)).toString();
const metricTitle=(key:string)=>key==='effectiveT'?'有效 T':metrics.find(m=>m.id===key)?.name??key;
const purpose:Record<ActionId,string>={U1:'提高技术限制，但会损失商业收益。',U2:'降低技术限制、缓和压力，并改善商业环境。',U3:'争取荷兰合作，提高政策协调；需要对方配合。',U4:'付出少量商业成本，加强对灰色交付的查处。',C1:'牺牲当前收益，积累下一回合的自主技术。',C2:'让美国承受材料压力，但不会自动迫使其让步。',C3:'争取中荷商业合作，降低美荷协调。',C4:'放松已有材料限制，作为谈判让步并改善收益。',N1:'配合技术限制，提高协调但牺牲商业收益。',N2:'放宽有限许可；需要ASML合规订单配合。',N3:'配合美国争取协调，单独使用没有收益。',S1:'在荷兰许可配合下执行合规订单。',S2:'拓展非中国市场，改善收益但提高中国技术获取难度。',S4:'收益潜力高，但查获会损失收益、信用并带来后续处罚。',PASS:'保持现状，不产生本方行动效果。'};
function ActionText({text,open}:{text:string;open:(id:ActionId)=>void}){return <>{text.split(/\b([UCNS][1-4])\b/g).map((part,i)=>Object.values(cards).flat().some(c=>c.id===part)?<button className="g-inline" key={i} onClick={()=>open(part as ActionId)}>{cardName(part)}<small> {part}</small></button>:<span key={i}>{part.replace(/\b(US|CN|NL|AS|[TAESP])\b/g,key=>names[key as Role]??`${metricTitle(key)}（${key}）`)}</span>)}</>}
const statuses:Record<Deal['status'],string>={pending:'等待签约',effective:'已生效',rejected:'已拒绝',expired:'已过期',conflict:'签约冲突',fulfilled:'全员履约',breached:'存在违约'};
function DealView({deal,viewer,canRespond,respond}:{deal:Deal;viewer:Role;canRespond:boolean;respond:(accept:boolean)=>unknown}){const invited=!!deal.commitments?.[viewer]&&!deal.accepted?.includes(viewer)&&deal.status==='pending';return <article className="g-deal"><h3>{names[deal.proposer]} 发起 · {statuses[deal.status]}</h3><p>参与方：{deal.participants.map(r=>names[r]).join('、')}</p>{deal.commitments?<>{deal.text&&<p>{deal.text}</p>}{Object.entries(deal.commitments).map(([r,id])=><p key={r}>{names[r as Role]} → <strong>{cardName(id!)}</strong> · {deal.accepted?.includes(r as Role)?'已同意':'待同意'}{deal.fulfillment?.[r as Role]!==undefined?(deal.fulfillment[r as Role]?' · 履约':' · 违约'):''}</p>)}</>:<p>条款仅签约方可见。</p>}{invited&&<div className="g-buttons"><button disabled={!canRespond} onClick={()=>respond(false)}>拒绝</button><button disabled={!canRespond} onClick={()=>respond(true)}>接受协议</button></div>}</article>}
function Preview({preview,snapshot}:{preview:ActionPreview|undefined;snapshot:Snapshot}){return <section className="g-preview" aria-label="行动后果预览"><h3>本轮预计 · 条件化后果</h3>{preview?<><p>{preview.summary}</p>{preview.assumptions.map((s,i)=><p className="g-note" key={i}>{s}</p>)}{preview.branches.map((b,i)=><article key={i}><strong>{b.label}{b.probability!==undefined?`（${Math.round(b.probability*100)}%）`:''}</strong><div className="g-changes">{metrics.filter(m=>b.delta[m.id]!==0).map(m=><span key={m.id}>{m.name} {fmt(snapshot.roundStart[m.id])} → {fmt(b.state[m.id])}（{b.delta[m.id]>=0?'+':''}{fmt(b.delta[m.id])}）{b.state[m.id]===m.max?' · 达到上限':b.state[m.id]===0?' · 达到下限':''}</span>)}</div><p>按该情景的本轮结果，目标差距：{snapshot.ownGoal.conditions.map(c=>{const value=c.metric==='effectiveT'?effectiveT(b.state):b.state[c.metric];const gap=Math.max(0,c.operator==='gte'?c.value-value:value-c.value);return `${metricTitle(c.metric)} ${fmt(value)}（${gap<.001?'已达标':`还差 ${fmt(gap)}`}）`}).join('；')}</p>{b.delayed.map((d,j)=><p key={j}>{d.when}：{metricTitle(d.metric)} {d.amount>=0?'+':''}{d.amount}</p>)}{b.creditDelta!==undefined&&b.creditDelta!==0&&<p>信用变化 {b.creditDelta}</p>}</article>)}{preview.riskIsEstimate&&<p>概率是所述情景下的估计，实际受其他方秘密选择影响。</p>}</>:<p>服务端暂未提供数值预览。请先展开计算规则；不据未知选择假设最终结果。</p>}<p className="g-note">其他方本轮选择未知，最终结果以统一结算为准。</p></section>}
function Report({report}:{report:RoundReport}){return <section className="g-report"><h3>第 {report.round} 回合 · 已公开结果</h3><div className="g-tablewrap"><table><thead><tr><th>指标</th><th>轮初</th><th>合计影响</th><th>取位/截断</th><th>结算后</th></tr></thead><tbody>{metrics.map(m=>{const adjustment=report.adjustment?.[m.id]??report.state[m.id]-report.roundStart[m.id]-report.delta[m.id];return <tr key={m.id}><th>{m.name}</th><td>{fmt(report.roundStart[m.id])}</td><td>{fmt(report.delta[m.id])}</td><td>{fmt(adjustment)}</td><td>{fmt(report.state[m.id])}{report.state[m.id]===m.max?'（上限）':report.state[m.id]===0?'（下限）':''}</td></tr>})}</tbody></table></div><p className="g-note">轮初 + 合计影响 + 取位/截断 = 结算后。达到边界时，继续同方向的增量会被截断。</p>{roles.map(r=><p key={r}>{names[r]}：<strong>{cardName(report.actions[r])}</strong>{report.sources[r]==='fallback'?' · 模型失败 · 确定性策略兜底':report.sources[r]==='timeout'?' · 玩家超时保持现状':''}</p>)}<details><summary>展开对账原因与履约</summary>{report.effects.map((e,i)=><p key={i}>{e.rule==='UNDISCLOSED'?'未公开方影响':e.description}：{Object.entries(e.delta).map(([k,v])=>`${metricTitle(k)} ${v!>=0?'+':''}${fmt(v!)}`).join('，')||'0'}</p>)}{report.deals.map(d=><DealView key={d.id} deal={d} viewer="US" canRespond={false} respond={()=>{}}/>)}</details></section>}
