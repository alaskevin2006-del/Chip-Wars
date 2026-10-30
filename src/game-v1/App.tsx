import { useEffect, useRef, useState } from 'react';
import { Avatar, Robot } from '../diplomacy/Illustrations';
import { api, ApiError, type Auth } from './api';
import { avatarRoles, cards, cardName, metrics, names, roles, effectiveT, metricLabel } from './catalogue';
import type { ActionId, Commitments, Deal, Phase, Role, RoundReport, SecretaryAdvice, Session, Snapshot } from './types';
import './styles.css';

const phases: Phase[] = ['negotiation','signing','actions','report'];
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
  const current = useRef<Session|null>(null);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const snapshot = session?.snapshot;
  const riskInfo = snapshot as (Snapshot & {monitoring?:boolean;ownGreyRisk?:number;pendingPenalties?:{dueRound:number;amount:number}[]})|undefined;

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
      current.current=null;setSession(null);save(null);setDraft('');setCommitments({});setDealText('');setAdvice(null);setSelectedAction(null);
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
    const auth=current.current;if(!auth||inFlight.current)return;
    const generation=epoch.current;const original=draft;const round=auth.snapshot.round;
    inFlight.current=true;setBusy(kind);setError('');
    try{
      if(kind==='polish'){
        const value=await api.polish(auth,original,tone);
        if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round) {
          if(!value.candidate.trim()||count(value.candidate)>100)throw new Error('润色结果无效，请修改原文后重试');
          setDraft(existing=>existing===original?value.candidate:existing);
        }
      }else{
        const value=await api.secretary(auth);
        if(mounted.current&&epoch.current===generation&&current.current?.snapshot.round===round)setAdvice(value.advice);
      }
    }catch(err){if(mounted.current&&epoch.current===generation)setError(`AI 请求失败：${messageOf(err)}`)}
    finally{if(mounted.current&&epoch.current===generation){inFlight.current=false;setBusy('')}}
  }

  const displayedActions = snapshot ? [...cards[snapshot.playerRole],{id:'PASS' as const,role:snapshot.playerRole,name:'维持现状',description:'保持现状，指标变化为 0。'}] : [];
  const ownReady=!!snapshot?.readyRoles.includes(snapshot.playerRole);
  const negotiating=snapshot?.phase==='negotiation'&&!ownReady;
  const ownPublic=snapshot?.roles.find(role=>role.id===snapshot.playerRole);
  const ownDeal=snapshot?.deals.find(deal=>deal.round===snapshot.round&&deal.status==='effective'&&deal.commitments?.[snapshot.playerRole]);
  const promised=ownDeal?.commitments?.[snapshot!.playerRole];
  const report=snapshot?.reportHistory.at(-1);
  const historyReport=snapshot?.reportHistory.find(item=>item.round===reportRound) ?? report;
  function legalCommitments(role:Role) {
    return cards[role].filter(card=>card.id!=='S4'&&(card.id!=='C1'||(snapshot!.round<4&&(snapshot!.researchUses??0)<3))&&(card.id!=='C4'||snapshot!.roundStart.P>=1)&&(card.id!=='N2'||snapshot!.roundStart.A<4));
  }
  const validProposal=!!snapshot && Object.keys(commitments).length>=2 && !!commitments[snapshot.playerRole] && Object.entries(commitments).every(([role,id])=>legalCommitments(role as Role).some(card=>card.id===id));

  return <div className="v1-app">
    <header className="v1-header"><div><p className="v1-eyebrow">CHIP DIPLOMACY · V1.6 四方策略桌</p><h1>芯片外交<span>把承诺，变成共同的结果。</span></h1></div><div className="v1-live"><i/>{health?.enabled?`DeepSeek · ${health.model}`:'连接真实 AI'}{session&&<button className="v1-quiet" onClick={reset} disabled={busy==='reset'}>结束对局</button>}</div></header>
    {error&&<div className="v1-error" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}>×</button></div>}
    {!snapshot ? <main className="v1-welcome">
      <section className="v1-intro"><p className="v1-eyebrow">FOUR ROLES. FOUR ROUNDS.</p><h2>你的下一步，<br/>也是别人的筹码。</h2><p>选择一方，和三位 AI 代表交涉。达成协议、秘密行动，四回合后揭晓每个人真正的目标。</p><div className="v1-start-metrics">{metrics.map(metric=><div key={metric.id}><b>{metric.id}</b><strong>{metric.name}</strong><small>{metric.explanation}</small></div>)}</div><p className="v1-note">实质胜利 = 全部目标条件 + 信用 ≥1。外交胜利还需至少 1 份全员履约协议；美国另需国内产业压力 ≤1。每方开局信用为 1，数值均为游戏假设。</p></section>
      <section className="v1-panel v1-choose"><h2>你代表哪一方？</h2><div className="v1-role-choices">{roles.map(role=><button key={role} className={playerRole===role?'selected':''} aria-pressed={playerRole===role} onClick={()=>setPlayerRole(role)} disabled={!!busy||restoring}><Avatar role={avatarRoles[role]}/><strong>{names[role]}</strong><small>{role}</small></button>)}</div><label className="v1-sr" htmlFor="v1-role">你的角色</label><select className="v1-sr" id="v1-role" value={playerRole} onChange={event=>setPlayerRole(event.target.value as Role)}>{roles.map(role=><option key={role} value={role}>{names[role]}</option>)}</select><button className="v1-primary v1-start" disabled={!health?.enabled||!!busy||restoring} onClick={start}>{restoring?'恢复对局中…':busy==='start'?'正在创建对局…':'开始四回合博弈'}</button><p className="v1-note" role="status">{healthError||(!health?'正在检查服务端模型配置…':!health.enabled?'模型不可用：服务端尚未配置 DeepSeek，暂不能开始。':'真实 DeepSeek 参与 · 私人目标随机抽取 · 不需要输入密钥')}</p><details><summary>玩法与信息边界</summary><p>谈判 → 签约 → 秘密行动 → 公开结算。每回合最多 2 条、每条 100 字；每方可发起 1 份协议。承诺可以违背，但将损失信用。只看到自己的私人目标、亲历私聊和本人签约条款。目标终局揭晓，私聊与协议条款仍保密。</p><p>荷兰只能审批适用规则允许的设备；ASML 无权自行发放许可。技术难度是综合游戏刻度。ASML 行动默认未公开，仅灰色交付被查获时公开。</p></details></section>
    </main> : <>
      <section className="v1-topline"><div className="v1-round"><strong>第 {snapshot.round} <small>/ 4 回合</small></strong><span>{snapshot.phase==='finished'?'四方目标已揭晓':phaseName[snapshot.phase]}</span></div><ol className="v1-phases">{phases.map((phase,index)=><li key={phase} className={snapshot.phase===phase?'active':snapshot.phase==='finished'||phases.indexOf(snapshot.phase)>index?'done':''}><b>{index+1}</b>{phaseName[phase]}</li>)}</ol><div className="v1-status" role="status">{snapshot.aiStatus?.busy?`${snapshot.aiStatus.role?names[snapshot.aiStatus.role]:'AI'} 正在${snapshot.aiStatus.task==='actions'?'决策':'处理本阶段'}…`:snapshot.phase==='finished'?'对局结束':'服务器自动推进'}{snapshot.deadlineAt&&snapshot.phase!=='finished'&&<small>本阶段截止 {new Date(snapshot.deadlineAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</small>}</div></section>
      <section className="v1-metrics" aria-label="全局指标">{metrics.map(metric=><div key={metric.id}><div><b>{metric.id}</b><span>{metric.name}</span><strong>{snapshot.state[metric.id]}<small>/{metric.max}</small></strong></div><div className="v1-meter"><i style={{width:`${snapshot.state[metric.id]/metric.max*100}%`}}/></div><p>{metric.explanation}</p></div>)}</section>
      <p className="v1-risk-strip">ASML 重点监控：{riskInfo?.monitoring?'已触发（永久增加 20 个百分点查获风险）':'未触发'}{snapshot.playerRole==='AS'&&typeof riskInfo?.ownGreyRisk==='number'&&<> · 你的基础查获风险 {(riskInfo.ownGreyRisk*100).toFixed(0)}%（实际受本轮政策及协调变化影响）</>}{!!riskInfo?.pendingPenalties?.length&&<> · 已公开延迟处罚：{riskInfo.pendingPenalties.map(item=>`第 ${item.dueRound} 回合 T +${item.amount}`).join('；')}</>}</p><div className="v1-board">
        <aside className="v1-left">
          <section className="v1-panel v1-goal"><p className="v1-eyebrow">仅你可见 · {names[snapshot.playerRole]}</p><h2>{snapshot.ownGoal.label}</h2><p>{snapshot.ownGoal.description}</p><div className="v1-thresholds">{snapshot.ownGoal.conditions.map(condition=><span key={metricLabel(condition.metric)}>{metricLabel(condition.metric)} {condition.operator==='gte'?'≥':'≤'} {condition.value}<small>当前 {condition.metric==='effectiveT'?effectiveT(snapshot.state).toFixed(1):snapshot.state[condition.metric]}</small></span>)}</div><p className="v1-note">假设性的私人游戏目标，以第 4 回合末判断。</p><ul className="v1-win"><li>外交胜利需履约协议 ≥1 <b>{ownPublic?.fulfilledDeals??0}</b></li><li>实质胜利需信用 ≥1 <b>{ownPublic?.credit??1}/2</b></li></ul>{snapshot.playerRole==='US'&&<p className="v1-note">外交胜利还需美国国内产业压力 ≤1，当前 {snapshot.state.P}。有效 T = max(0, T − 0.5 × max(0, S −2))，当前 {effectiveT(snapshot.state).toFixed(1)}。</p>}{!!snapshot.pendingResearch?.length&&<p className="v1-note">待生效研发：{snapshot.pendingResearch.map(item=>`第 ${item.dueRound} 回合 S +${item.amount}`).join('；')}</p>}</section>
          <section className="v1-panel v1-public"><h2>谈判桌上的四方</h2>{snapshot.roles.map(role=><div className={`v1-person ${role.id===snapshot.playerRole?'is-player':''}`} key={role.id}><Avatar role={avatarRoles[role.id]}/><div><strong>{role.name}{role.id===snapshot.playerRole&&<em>你</em>}</strong><p>信用 {role.credit}/2 · 履约协议 {role.fulfilledDeals}</p><small>{role.description}</small><details><summary>{snapshot.phase==='finished'?'查看揭晓目标':'可能目标（实际保密）'}</summary><p>{snapshot.revealedGoals?.[role.id]?`${snapshot.revealedGoals[role.id].label}：${snapshot.revealedGoals[role.id].description}`:(snapshot.goalCatalogue[role.id]??[]).map(goal=>`${goal.label}（50%）：${goal.description}`).join('；')}</p></details></div></div>)}</section>
        </aside>
        <main className="v1-center v1-panel">
          <div className="v1-panel-heading"><h2>{phaseName[snapshot.phase]}<small>第 {snapshot.round} 回合</small></h2>{snapshot.phase!=='finished'&&<span className="v1-tag">{snapshot.phase==='actions'?`${snapshot.submittedRoles.length}/4 已提交`:`${snapshot.readyRoles.length}/4 已就绪`}</span>}</div>
          <div className="v1-center-scroll">
            {snapshot.phase!=='negotiation'&&snapshot.messages.length>0&&<details className="v1-message-archive"><summary>查看谈判消息（{snapshot.messages.length}）</summary>{snapshot.messages.map(message=><article key={message.id}><p><strong>{names[message.from]}</strong> · R{message.round} · {message.to?`私聊 → ${names[message.to]}`:'公开'}</p><p>{message.content}</p></article>)}</details>}
            {snapshot.phase==='negotiation'&&<>
              <p className="v1-note">每方最多 2 条消息。声明不改变指标，正式协议才记录行动承诺。</p>
              <div className="v1-messages" aria-label="谈判记录">{snapshot.messages.length?snapshot.messages.map(message=><article key={message.id} className={message.from===snapshot.playerRole?'own':''}><header><strong>{names[message.from]}</strong><span>R{message.round} · {message.to?`私聊 → ${names[message.to]}`:'公开'}</span></header><p>{message.content}</p></article>):<div className="v1-empty">桌上还没有声明。提出你希望交换的行动吧。</div>}</div>
            </>}
            {(snapshot.phase==='negotiation'||snapshot.phase==='signing')&&<div className="v1-deals"><h3>本轮正式提案</h3>{snapshot.deals.filter(deal=>deal.round===snapshot.round).map(deal=><DealView key={deal.id} deal={deal} viewer={snapshot.playerRole} canRespond={snapshot.phase==='signing'&&!ownReady&&!busy} respond={accept=>write('respond',{dealId:deal.id,accept})}/>)}{!snapshot.deals.some(deal=>deal.round===snapshot.round)&&<p className="v1-note">本轮尚无正式提案。全员履约协议是外交胜利的额外条件；未签约仍可能达成实质胜利。</p>}</div>}
            {snapshot.phase==='actions'&&<><p className="v1-note">四方同时秘密选择。只显示你自己的已选行动；所有人提交后，实际行动统一公开。</p>{promised&&<div className="v1-promise">本轮已签约承诺：<strong>{cardName(promised)}</strong>。可以选择其他行动；违约信用 −1，且本协议不计全员履约。</div>}<div className="v1-action-list">{displayedActions.map(card=><button key={card.id} className={(snapshot.ownAction??selectedAction)===card.id?'selected':''} disabled={!!snapshot.ownAction||!!busy||!snapshot.legalActions.some(legal=>legal.id===card.id)} aria-pressed={(snapshot.ownAction??selectedAction)===card.id} onClick={()=>setSelectedAction(card.id)}><div><strong>{card.name}</strong><p>{card.description}</p>{!snapshot.legalActions.some(legal=>legal.id===card.id)&&<small>当前不可选：请查看回合开始条件。</small>}</div></button>)}</div>{snapshot.ownAction?<div className="v1-promise" role="status">你已秘密提交：{cardName(snapshot.ownAction)}。等待其他代表。</div>:<><p className="v1-note">{promised&&selectedAction&&promised!==selectedAction?'此行动与你的正式承诺不同，提交将导致违约。':'提交后本轮不可更改。未及时提交将由服务器使用 PASS，并标记为超时。'}</p><button className="v1-primary" disabled={!selectedAction||!!busy} onClick={()=>selectedAction&&write('action',{actionId:selectedAction})}>秘密提交行动</button></>}</>}
            {snapshot.phase==='report'&&<><p className="v1-note">先查看实际行动与联动效果。服务器约 20 秒后进入下一回合，也可立即继续。</p>{report&&<Report report={report}/>}<button className="v1-primary" disabled={!!busy} onClick={()=>write('next')}>进入第 {snapshot.round+1} 回合</button></>}
            {snapshot.phase==='finished'&&<><div className="v1-ending"><p className="v1-eyebrow">THE FINAL REVEAL</p><h2>{snapshot.results?.[snapshot.playerRole]?.diplomaticVictory?'你达成了外交胜利！':snapshot.results?.[snapshot.playerRole]?.substantiveVictory?'你达成了实质胜利！':'四回合结束，所有目标揭晓'}</h2><p>多人可以同时获胜，也可能无人获胜。实质胜利需全部目标达成且信用 ≥1；外交胜利另需全员履约协议，美国还需国内压力 ≤1。</p></div>{roles.map(role=>{const result=snapshot.results?.[role];return result&&<article className={`v1-result ${result.substantiveVictory?'won':''}`} key={role}><h3>{names[role]}<span>{result.diplomaticVictory?'外交胜利':result.substantiveVictory?'实质胜利':'未获胜'}</span></h3><strong>{result.goal.label}</strong><p>{result.goal.conditions.map((condition,i)=>`${metricLabel(condition.metric)} ${condition.operator==='gte'?'≥':'≤'} ${condition.value} ${result.conditionsMet[i]?'✓':'未达成'}`).join(' · ')}</p><small>实质胜利：{result.substantiveVictory?'达成':'未达成'} · 外交胜利：{result.diplomaticVictory?'达成':'未达成'}<br/>信用 {result.credit}/2 · 全员履约协议 {result.fulfilledDeals}{role==='US'&&<> · 国内产业压力 {snapshot.state.P}/2（外交胜利需 ≤1） · 有效 T {result.effectiveT.toFixed(1)}</>}</small></article>})}{report&&<Report report={report}/>}</>}
          </div>
          {(snapshot.phase==='negotiation'||snapshot.phase==='signing')&&<footer className="v1-ready"><span>{ownReady?'你已就绪，等待其余代表。':snapshot.phase==='signing'?'逐一处理邀请后结束签约。':'消息与提案准备好后，结束谈判。'}</span><button className="v1-primary" disabled={ownReady||!!busy} onClick={()=>write('ready')}>{ownReady?'已就绪':snapshot.phase==='negotiation'?'结束谈判 · 就绪':'结束签约 · 就绪'}</button></footer>}
        </main>
        <aside className="v1-right">
          {snapshot.phase==='negotiation'&&<section className="v1-panel v1-composer"><h2>你的声明<span>{snapshot.messageCount}/2</span></h2><label>发送给<select aria-label="消息收件人" value={target} disabled={!negotiating||!!busy} onChange={event=>setTarget(event.target.value as Role|'')}><option value="">公开 · 所有人</option>{roles.filter(role=>role!==snapshot.playerRole).map(role=><option key={role} value={role}>私聊 · {names[role]}</option>)}</select></label><label>润色语气<select aria-label="润色语气" value={tone} disabled={!negotiating||!!busy} onChange={event=>setTone(event.target.value as typeof tone)}><option value="neutral">中性</option><option value="firm">坚定</option><option value="friendly">友好</option></select></label><textarea aria-label="谈判消息" placeholder="写下关键词或一句话，让对方知道你想交换什么…" value={draft} onChange={event=>setDraft(event.target.value)} disabled={!negotiating||snapshot.messageCount>=2}/><div className="v1-compose-actions"><small className={count(draft)>100?'invalid':''}>{count(draft)}/100 字</small><button onClick={()=>assist('polish')} disabled={!negotiating||!!busy||!draft.trim()||count(draft)>100||snapshot.messageCount>=2}>AI 润色</button><button className="v1-primary" disabled={!negotiating||!!busy||!draft.trim()||count(draft)>100||snapshot.messageCount>=2} onClick={async()=>{if(await write('message',{content:draft,target:target||null}))setDraft('')}}>发送</button></div><p className="v1-note">润色仅填入可编辑候选，不会自动发送。</p><details className="v1-propose"><summary>＋ 发起正式协议（每轮 1 份）</summary><p className="v1-note">选 2–4 方，含你自己；每方承诺本轮一项合法行动（不含维持现状或灰色交付）。完整条款只向签约方显示。</p>{roles.map(role=><label key={role}>{names[role]}{role===snapshot.playerRole?'（必须）':''}<select aria-label={`${names[role]}协议承诺`} value={commitments[role]??''} disabled={!negotiating||!!busy||snapshot.proposalsMade>=1} onChange={event=>setCommitments(previous=>{const next={...previous};if(event.target.value)next[role]=event.target.value as ActionId;else delete next[role];return next})}><option value="">{role===snapshot.playerRole?'选择你的承诺':'不参加'}</option>{legalCommitments(role).map(card=><option key={card.id} value={card.id}>{card.name}</option>)}</select></label>)}<textarea aria-label="协议说明" value={dealText} placeholder="协议说明（可选，最多 300 字；不作为额外可执行条件）" onChange={event=>setDealText(event.target.value)} disabled={!negotiating||snapshot.proposalsMade>=1}/><button className="v1-primary" disabled={!negotiating||!!busy||!validProposal||count(dealText)>300||snapshot.proposalsMade>=1} onClick={async()=>{if(await write('proposal',{commitments,text:dealText})){setCommitments({});setDealText('')}}}>提交提案（已发起 {snapshot.proposalsMade}/1）</button></details></section>}
          <section className="v1-panel v1-secretary"><div className="v1-secretary-heading"><Robot active={busy==='secretary'}/><div><h2>随席秘书</h2><p>只分析你可见的信息</p></div><button disabled={!!busy} onClick={()=>assist('secretary')}>{busy==='secretary'?'分析中…':'请秘书建议'}</button></div>{advice?<div className="v1-advice"><h3>对方要求</h3>{advice.otherRequests.map((text,i)=><p key={i}>{text}</p>)}<h3>可能动机 · 推测</h3>{advice.possibleMotives.map((item,i)=><p key={i}>推测：{item.text}</p>)}<h3>相关行动卡</h3><p>{advice.relevantActions.map(id=>cardName(id)).join('、')||'暂无'}</p><h3>对你的目标的风险</h3>{advice.risks.map((text,i)=><p key={i}>{text}</p>)}</div>:<p className="v1-note">按需询问对方要求、可能动机与目标风险。对方真实私人目标不可读取。</p>}</section>
          <section className="v1-panel v1-history"><h2>公开战报档案<span>{snapshot.reportHistory.length}/4</span></h2>{snapshot.reportHistory.length?<><select aria-label="历史回合" value={historyReport?.round??''} onChange={event=>setReportRound(Number(event.target.value))}>{snapshot.reportHistory.map(item=><option value={item.round} key={item.round}>第 {item.round} 回合</option>)}</select>{historyReport&&<Report report={historyReport} compact/>}</>:<p className="v1-note">结算后保留所有回合的实际行动与指标变化。</p>}</section>
        </aside>
      </div>
      {snapshot.notices.length>0&&<details className="v1-notices" open><summary>服务与 AI 提示（{snapshot.notices.length}）</summary>{snapshot.notices.map((notice,i)=><p key={i}>R{notice.round}{notice.role?` · ${names[notice.role]}`:''}：{notice.message}</p>)}</details>}
    </>}
    <footer className="v1-disclaimer">虚构策略游戏 · 所有数值均为游戏假设 [G] · 不构成现实政策预测</footer>
  </div>;
}

const dealStatus: Record<Deal['status'],string>={pending:'等待签约',effective:'已生效',rejected:'已拒绝',expired:'已过期',conflict:'签约冲突',fulfilled:'全员履约',breached:'存在违约'};
function DealView({deal,viewer,canRespond,respond}:{deal:Deal;viewer:Role;canRespond:boolean;respond:(accept:boolean)=>unknown}) {
 const invited=!!deal.commitments?.[viewer]&&!deal.accepted?.includes(viewer)&&deal.status==='pending';
 return <article className="v1-deal"><header><strong>{names[deal.proposer]} 发起</strong><span>{dealStatus[deal.status]}</span></header><p className="v1-note">参与方：{deal.participants.map(role=>names[role]).join('、')}</p>{deal.commitments?<>{deal.text&&<p>{deal.text}</p>}<ul>{Object.entries(deal.commitments).map(([role,id])=><li key={role}>{names[role as Role]} → <b>{cardName(id!)}</b><small>{deal.accepted?.includes(role as Role)?'已同意':'待同意'}{deal.fulfillment?.[role as Role]!==undefined?(deal.fulfillment[role as Role]?' · 履约':' · 违约'):''}</small></li>)}</ul></>:<p className="v1-note">条款仅签约方可见。</p>}{invited&&<div className="v1-deal-response"><button disabled={!canRespond} onClick={()=>respond(false)}>拒绝</button><button className="v1-primary" disabled={!canRespond} onClick={()=>respond(true)}>接受协议</button></div>}</article>;
}
function Report({report,compact=false}:{report:RoundReport;compact?:boolean}) {
 return <div className={`v1-report ${compact?'compact':''}`}><h3>第 {report.round} 回合 · 已公开结果</h3><div className="v1-report-metrics">{metrics.map(metric=><div key={metric.id}><b>{metric.id}</b> {report.roundStart[metric.id]} → <strong>{report.state[metric.id]}</strong><small>合计 {report.delta[metric.id]>=0?'+':''}{report.delta[metric.id]}</small></div>)}</div><p className="v1-note">合计基础、联动与风险效果后，统一取一位小数并截断；国内压力为 0–2 整数。</p><ul className="v1-actual">{roles.map(role=><li key={role}><strong>{names[role]}</strong><span>{cardName(report.actions[role])}{report.sources[role]==='timeout'&&<em>超时维持现状</em>}{report.sources[role]==='fallback'&&<em>模型失败 · 确定性策略兜底</em>}</span></li>)}</ul><details open={!compact}><summary>联动条件与效果</summary>{report.effects.map((effect,i)=><p key={i}>{effect.description} <small>{Object.entries(effect.delta).map(([key,value])=>`${key} ${value!>=0?'+':''}${value}`).join('，')}</small></p>)}{!report.effects.length&&<p>本轮无额外效果。</p>}<h3>协议履约结果</h3>{report.deals.length?report.deals.map(deal=><DealView key={deal.id} deal={deal} viewer="US" canRespond={false} respond={()=>{}}/>):<p className="v1-note">本轮无生效协议。</p>}<p className="v1-note">{roles.map(role=>`${names[role]}：信用 ${report.credit[role]}，履约协议 ${report.fulfilledDeals[role]}`).join('；')}</p></details></div>;
}
