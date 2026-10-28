import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, FileText, Globe2, Info, LockKeyhole, MessageCircle, Pause, Play, RotateCcw, Sparkles, SquareArrowOutUpRight, Users, X } from 'lucide-react';
import { api, ApiError, type Session } from './api';
import type { ActionKind, DiplomacyAction, Role, Snapshot } from './types';
import { Avatar, colors, Council, Flag, goals, names, roleIds, WorldMap } from './Illustrations';
import './styles.css';
const labels:Record<ActionKind,string>={statement:'公开声明',message:'私下沟通',proposal:'提出条件',accept:'接受提案',reject:'拒绝提案',revise:'修订提案',decision:'最终决策'};
const proposalLabels={pending:'待回应',accepted:'模拟内部达成',rejected:'已拒绝',superseded:'已被修订'};
const sourceLabels={demo:'示例脚本',llm:'实时模型',player:'玩家行动'};
function PlayerComposer({snapshot,busy,onSubmit}:{snapshot:Snapshot;busy:boolean;onSubmit:(action:DiplomacyAction)=>void}) {
  const role=snapshot.player!;
  const last=snapshot.round===snapshot.rounds;
  const [kind,setKind]=useState<ActionKind>(last?'decision':'statement');
  const [target,setTarget]=useState<Role>(role==='USA'?'China':'USA');
  const [content,setContent]=useState(''); const [reason,setReason]=useState('');
  const [proposalId,setProposal]=useState(''); const [isPublic,setPublic]=useState(true);
  const available=snapshot.proposals.filter(p=>p.status==='pending'&&(kind==='revise'?p.agent===role:p.target===role));
  const proposal=available.find(p=>p.id===proposalId);
  const responds=['accept','reject','revise'].includes(kind);
  const canSubmit=content.trim().length>0&&(!responds||!!proposal)&&!busy;
  function change(next:ActionKind){setKind(next);setProposal('');setPublic(next!=='message');if(next==='proposal'&&role==='ASML')setTarget('Netherlands');}
  function submit(){
    if(!canSubmit)return;
    const directed=['message','proposal'].includes(kind);
    onSubmit({agent:role,action:kind,target:responds?(kind==='revise'?proposal!.target:proposal!.agent):directed?target:null,content:content.trim(),reason:reason.trim(),proposal_id:responds?proposal!.id:null,is_public:responds?proposal!.is_public:kind==='message'?false:kind==='proposal'?isPublic:true,...(['proposal','revise'].includes(kind)?{scope:kind==='revise'?proposal!.scope:role==='ASML'?'commercial' as const:'diplomatic' as const}:{})});
  }
  return <section className="cd-composer" aria-label="玩家外交行动"><div className="cd-composer-heading"><span><Flag role={role}/>现在由你代表{names[role]}发言</span><small>第 {snapshot.round} 轮{last?' · 最终决策':''}</small></div><p>{last?'请基于可见历史形成你方最终决定。':role==='ASML'?'你可表达商业诉求；出口许可仍由政府决定。':'你的行动会进入后续角色可见的谈判记录。'}</p><div className="cd-form-row"><label>行动类型<select value={kind} onChange={e=>change(e.target.value as ActionKind)}>{(last?['decision']:['statement','message','proposal','accept','reject','revise'] as ActionKind[]).map(k=><option key={k} value={k}>{labels[k as ActionKind]}</option>)}</select></label>{['message','proposal'].includes(kind)&&<label>接收方<select value={target} onChange={e=>setTarget(e.target.value as Role)}>{roleIds.filter(r=>r!==role&&(kind!=='proposal'||(role==='ASML'?r==='Netherlands':r!=='ASML'))).map(r=><option key={r} value={r}>{names[r]}</option>)}</select></label>}{responds&&<label>有效提案<select aria-label="选择提案" value={proposalId} onChange={e=>setProposal(e.target.value)}><option value="">选择待处理提案</option>{available.map(p=><option key={p.id} value={p.id}>{p.id} · {p.content.slice(0,32)}</option>)}</select></label>}</div>{responds&&!available.length&&<p className="cd-inline-note">当前没有你有权处理的待回应提案，请选择其他行动。</p>}<label className="cd-text-label" htmlFor="player-content">外交文本</label><textarea id="player-content" value={content} onChange={e=>setContent(e.target.value)} placeholder={last?'本轮谈判后，我方决定……':'表达你的立场、条件或回应……'} maxLength={2000} rows={3}/><input aria-label="简短公开理由" value={reason} onChange={e=>setReason(e.target.value)} placeholder="简短公开理由（可选）" maxLength={300}/><div className="cd-composer-footer">{kind==='proposal'?<label className="cd-checkbox"><input type="checkbox" checked={isPublic} onChange={e=>setPublic(e.target.checked)}/>公开此提案</label>:<span>{kind==='message'?<><LockKeyhole size={13}/>仅你与接收方可见</>:<>内容作为{responds&&proposal&&!proposal.is_public?'私有':'公开'}模拟记录保存</>}</span>}<button className="cd-btn cd-primary" disabled={!canSubmit} onClick={submit}>提交本轮行动<ArrowRight size={15}/></button></div></section>;
}
export default function App(){
  const [mode,setMode]=useState<'demo'|'live'>('demo');const [rounds,setRounds]=useState(3);const [player,setPlayer]=useState<Role|null>(null);
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);const [busy,setBusy]=useState(false);const [controlling,setControlling]=useState(false);const [error,setError]=useState('');
  const [health,setHealth]=useState<{enabled:boolean;model:string}|null>(null);const [showSources,setSources]=useState(false);const [filter,setFilter]=useState<'all'|'public'|'private'>('all');
  const session=useRef<Session|null>(null);const generation=useRef(0);const pending=useRef(false);const controlPending=useRef(false);const end=useRef<HTMLDivElement>(null);
  useEffect(()=>{let active=true;api.health().then(h=>{if(active)setHealth(h.llm)}).catch(()=>{if(active)setHealth(null)});return()=>{active=false}},[]);
  async function start(){if(pending.current||session.current)return;pending.current=true;setBusy(true);setError('');const gen=++generation.current;try{const created=await api.create(mode,rounds,player);if(generation.current!==gen){void api.remove(created).catch(()=>{});return}session.current=created;setSnapshot(created.snapshot);}catch(e){if(generation.current===gen)setError(e instanceof Error?e.message:'无法开始，请确认后端已启动。')}finally{if(generation.current===gen){pending.current=false;setBusy(false)}}}
  async function step(action?:DiplomacyAction){
    const s=session.current;
    if(!s||!snapshot||pending.current||controlPending.current)return;
    const gen=generation.current,version=snapshot.version;
    pending.current=true;setBusy(true);setError('');
    try{
      const next=await api.step(s,version,action);
      if(generation.current===gen)setSnapshot(next);
    }catch(e){
      if(generation.current!==gen)return;
      // A lost HTTP response can hide a committed turn. Read authority before any retry.
      if(!(e instanceof ApiError&&e.status===422)){
        try{
          const current=await api.read(s);
          if(generation.current!==gen)return;
          setSnapshot(current);
          if(current.version!==version||current.status!==snapshot.status)return;
        }catch{/* Keep the retry control available if the reconciliation request also fails. */}
      }
      if(generation.current===gen)setError(e instanceof ApiError&&e.status===409?'另一项行动仍在处理。状态已同步，请稍后重试。':e instanceof Error?e.message:'行动未完成，请重试。');
    }finally{
      if(generation.current===gen){pending.current=false;setBusy(false)}
    }
  }
  useEffect(()=>{if(!snapshot||busy||controlling||error||snapshot.status!=='running'||snapshot.actor===snapshot.player)return;const timer=setTimeout(()=>void step(),650);return()=>clearTimeout(timer)},[snapshot,busy,controlling,error]);
  async function control(command:'pause'|'resume'){
    const s=session.current;if(!s||controlPending.current)return;
    controlPending.current=true;setControlling(true);
    // Invalidate the old step before sending pause. Its late response cannot overwrite pause/resume.
    const gen=++generation.current;
    pending.current=false;setBusy(false);setError('');
    try{
      const next=await api.control(s,command);
      if(generation.current===gen)setSnapshot(next);
    }catch(e){
      if(generation.current!==gen)return;
      try{const current=await api.read(s);if(generation.current===gen)setSnapshot(current);}catch{}
      if(generation.current===gen)setError(e instanceof Error?e.message:'控制请求未完成。');
    }finally{if(generation.current===gen){controlPending.current=false;setControlling(false)}}
  }
  async function retry(){
    const s=session.current;
    if(!s){setError('');return}
    if(pending.current||controlPending.current)return;
    const gen=generation.current;pending.current=true;setBusy(true);
    try{const current=await api.read(s);if(generation.current===gen){setSnapshot(current);setError('');}}
    catch(e){if(generation.current===gen)setError(e instanceof Error?e.message:'暂时无法同步，请稍后重试。')}
    finally{if(generation.current===gen){pending.current=false;setBusy(false)}}
  }
  function reset(){const previous=session.current;++generation.current;session.current=null;pending.current=false;controlPending.current=false;setSnapshot(null);setBusy(false);setControlling(false);setError('');if(previous)void api.remove(previous).catch(()=>{});}
  const current=snapshot?.actor??null;const waiting=!!snapshot&&snapshot.actor===snapshot.player&&snapshot.status!=='paused'&&snapshot.status!=='completed';
  const messages=(snapshot?.messages??[]).filter(m=>filter==='all'||(filter==='public'?m.is_public:!m.is_public));
  const activeStatus=waiting?'awaiting_player':snapshot?.status??'ready';
  return <div className="cd-app"><header className="cd-header"><a className="cd-brand" href="#"><span className="cd-brand-icon"><Globe2 size={23}/></span><span>CHIP DIPLOMACY<small>THE ART OF NEGOTIATION</small></span></a><nav><a href="#council">外交会议室</a><a href="#dialogue">互动记录</a><button onClick={()=>setSources(true)}>情景与来源<SquareArrowOutUpRight size={12}/></button></nav><span className="cd-header-tag"><span/>多智能体外交实验</span></header><main className="cd-main"><section className="cd-intro"><div><div className="cd-eyebrow"><span/> FOUR VOICES. ONE TABLE.</div><h1>技术有边界，<br className="cd-mobile-break"/>对话有可能<span>。</span></h1><p>中美半导体外交博弈模拟<span className="cd-intro-sep">/</span>Chip Diplomacy</p></div><div className="cd-intro-aside"><span>SCENARIO 01</span><strong>先进半导体设备出口管制争端</strong><p>让四个拥有独立目标与信息的角色，<br/>在谈判中寻找各自的下一步。</p></div></section>
    <div className="cd-fiction-note"><Info size={15}/><span>假设性情景 · 非现实预测。历史背景、模拟设定与模型生成内容分别标注，任何协议仅在模拟内部成立。</span></div>
    <section className="cd-config" aria-label="模拟设置"><div className="cd-config-label"><span className="cd-section-number">01</span><div><strong>设定你的谈判</strong><small>一个问题，四种立场。</small></div></div><label>运行方式<select aria-label="运行方式" value={mode} disabled={!!snapshot||busy} onChange={e=>setMode(e.target.value as typeof mode)}><option value="demo">演示模式 · 示例脚本</option><option value="live">实时推演 · DeepSeek</option></select></label><label>谈判轮数<select aria-label="谈判轮数" value={rounds} disabled={!!snapshot||busy} onChange={e=>setRounds(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} 轮{n===3?' · 推荐':''}</option>)}</select></label><label>你的角色<select aria-label="你的角色" value={player??'observer'} disabled={!!snapshot||busy} onChange={e=>setPlayer(e.target.value==='observer'?null:e.target.value as Role)}><option value="observer">旁观者 · 四方自主互动</option>{roleIds.map(r=><option key={r} value={r}>{names[r]}</option>)}</select></label><div className="cd-config-actions">{!snapshot?<button className="cd-btn cd-primary" onClick={()=>void start()} disabled={busy||mode==='live'&&!health?.enabled}><Play size={15}/>{busy?'准备中…':'开始模拟'}</button>:<><button className="cd-btn cd-secondary" onClick={()=>void control(snapshot.status==='paused'?'resume':'pause')} disabled={controlling||snapshot.status==='completed'}>{snapshot.status==='paused'?<Play size={14}/>:<Pause size={14}/>} {snapshot.status==='paused'?'继续':'暂停'}</button><button className="cd-icon-btn" aria-label="重置模拟" onClick={reset}><RotateCcw size={17}/></button></>}</div></section>
    <div className="cd-runtime-note"><span className={`cd-mode-badge ${mode==='live'?'live':''}`}>{mode==='demo'?<FileText size={12}/>:<Sparkles size={12}/>} {mode==='demo'?'演示数据 · 非实时 LLM':'实时模型 · 服务端调用'}</span><span>{mode==='demo'?'示例脚本用于体验流程；实时模式由模型自主决策。':health?.enabled?`已配置 ${health.model}，调用结果以记录为准。`:'实时模型尚未配置或后端未连接，请使用演示模式。'}</span></div>
    {error&&<div role="alert" className="cd-error"><span>{error}</span><button disabled={busy||controlling} onClick={()=>void retry()}>{snapshot?'重试当前步骤':'关闭'}<X size={14}/></button></div>}
    <section className="cd-room" id="council"><div className="cd-panel-heading"><div><span className="cd-section-number">02</span><h2>外交会议室</h2><span className="cd-heading-caption">THE COUNCIL</span></div><span className={`cd-session-status ${busy?'active':''}`}><i/>{!snapshot?'等待开场':snapshot.status==='completed'?'本次推演结束':snapshot.status==='paused'?'已暂停':waiting?'等待你的行动':busy?'正在生成行动…':'准备下一位发言'}</span></div><WorldMap/><div className="cd-council-divider"><span>各方目标</span><i/><small>独立角色 · 独立信息 · 依次决策</small></div><Council actor={current} status={activeStatus}/><div className="cd-room-footer"><span><Users size={14}/>4 个参与方 <b>·</b> 3 个政府 / 1 家企业</span><span>{snapshot?`第 ${Math.min(snapshot.round,snapshot.rounds)} / ${snapshot.rounds} 轮`:'从尚未解决的争议开始'}<ArrowDown size={13}/></span></div></section>
    <div className="cd-lower-grid"><section className="cd-dialogue" id="dialogue"><div className="cd-panel-heading"><div><span className="cd-section-number">03</span><h2>外交互动记录</h2><span className="cd-heading-caption">THE CONVERSATION</span></div><span className="cd-record-count">{snapshot?.messages.length??0} 条可见记录</span></div><div className="cd-feed-tools"><div role="group" aria-label="记录筛选">{(['all','public','private'] as const).map((f,i)=><button key={f} className={filter===f?'selected':''} onClick={()=>setFilter(f)}>{['全部','公开记录','私有通信'][i]}</button>)}</div><span><LockKeyhole size={12}/>{snapshot?.player?'仅显示你有权查看的信息':'旁观者仅查看公开信息'}</span></div>{!snapshot?<div className="cd-empty"><MessageCircle size={32} strokeWidth={1}/><h3>每一次选择，都从一句话开始。</h3><p>选择运行方式与角色，开启第一轮外交互动。</p><span>公开声明 / 定向通信 / 谈判提案 / 最终决策</span></div>:<><div className="cd-feed" aria-live="polite">{messages.length===0&&<div className="cd-empty cd-empty-small"><MessageCircle size={25}/><p>{filter==='private'?'没有你有权查看的私有通信。':'秘书正在准备第一条外交记录。'}</p></div>}{messages.map((m,i)=><article className="cd-message" key={m.id} id={`message-${m.id}`}>{(i===0||messages[i-1].round!==m.round)&&<div className="cd-round-divider"><span>ROUND {String(m.round).padStart(2,'0')}</span><i/></div>}<div className="cd-message-body"><div className="cd-message-avatar" style={{background:`${colors[m.agent]}16`}}><Avatar role={m.agent}/></div><div className="cd-message-main"><div className="cd-message-meta"><strong>{names[m.agent]}</strong><span>{labels[m.action]}</span><small>{sourceLabels[m.source]}</small><em>{m.is_public?'公开':<><LockKeyhole size={11}/>私有</>}</em></div>{m.target&&<div className="cd-message-target">致 {names[m.target]}{m.proposal_id&&` · ${m.proposal_id}`}</div>}<p>{m.content}</p>{m.reason&&<details><summary>公开理由<ChevronDown size={12}/></summary><p>{m.reason}</p></details>}</div></div></article>)}{snapshot.errors.map((err,i)=><div className="cd-step-error" key={`${err.round}-${err.agent}-${i}`}><Info size={14}/><span>第 {err.round} 轮 · {names[err.agent]}：{err.message}。未记录成功决策。</span></div>)}<div ref={end}/></div>{waiting&&<PlayerComposer key={`${snapshot.round}-${snapshot.actor}`} snapshot={snapshot} busy={busy||controlling} onSubmit={a=>void step(a)}/>}<div className="cd-feed-footer"><span><span className={busy?'cd-live-dot':''}/>{snapshot.status==='completed'?'所有轮次已结束，请查看下方最终决策。':waiting?'秘书等待你的行动输入。':snapshot.status==='paused'?'推演已暂停，可继续或重新开始。':busy?'当前角色正在生成行动，秘书将验证权限与提案状态。':'按固定角色顺序推进，每次记录一个实际发生的行动。'}</span></div></>}</section>
    <aside className="cd-side"><section className="cd-proposals"><div className="cd-side-heading"><span>谈判桌上的提案</span><FileText size={17}/></div><p className="cd-side-subtitle">声明不等于共识。只有有效提案获得相应参与者同意，才标记为模拟内部达成。</p>{!snapshot?.proposals.length?<div className="cd-no-proposals"><span>—</span><p>尚无可见提案</p><small>谈判开始后在此跟踪进展</small></div>:snapshot.proposals.map(p=><article className="cd-proposal" key={p.id}><div><span className={`cd-proposal-state ${p.status}`}>{p.status==='accepted'&&<Check size={11}/>} {proposalLabels[p.status]}</span><small>{p.is_public?'公开':'私有'}</small></div><h3>{names[p.agent]}<ArrowRight size={12}/>{names[p.target]}</h3><p>{p.content}</p><span>{p.id} · 第 {p.round} 轮 · {p.scope==='commercial'?'商业提案':'外交提案'}</span></article>)}</section><div className="cd-secretary-note"><span>秘书的工作笔记</span><p>“每一方只能决定自己的行动。对话可以影响判断，但不能替另一方作出承诺。”</p><small>权限校验 · 提案追踪 · 信息隔离</small></div><button className="cd-source-link" onClick={()=>setSources(true)}>这场模拟基于什么？<SquareArrowOutUpRight size={14}/></button></aside></div>
    {snapshot&&<section className="cd-decisions" id="decisions"><div className="cd-panel-heading"><div><span className="cd-section-number">04</span><h2>各方最终决策</h2><span className="cd-heading-caption">WHERE WE STAND</span></div><span>{snapshot.status==='completed'?'推演结果 · 假设性情景':'最后一轮将形成最终决策'}</span></div><div className="cd-decision-grid">{roleIds.map(role=>{const d=snapshot.decisions[role];const agreements=snapshot.proposals.filter(p=>p.status==='accepted'&&(p.agent===role||p.target===role));return <article className="cd-decision" key={role} style={{'--role-color':colors[role]} as React.CSSProperties}><div><Flag role={role}/><strong>{names[role]}{role==='ASML'?' · 商业决定':''}</strong></div>{d?<><p>{d.content}</p><small>{sourceLabels[d.source]}</small>{d.reason&&<details><summary>决定原因</summary><p>{d.reason}</p></details>}<details><summary>相关历史依据 · {d.evidence.length} 条</summary>{d.evidence.map(id=>{const message=snapshot.messages.find(m=>m.id===id);return message?<a key={id} href={`#message-${id}`}>第 {message.round} 轮 · {labels[message.action]}：{message.content.slice(0,70)}</a>:null})}</details><span className="cd-agreement-note">{agreements.length?`涉及 ${agreements.length} 项可见的模拟内部协议`:'无可见的已达成协议'}</span></>:<p className="cd-pending-decision">{snapshot.status==='completed'?'未形成有效最终决策。请查看错误记录。':'等待最后一轮的独立决定。'}</p>}</article>})}</div>{snapshot.status==='completed'&&<div className="cd-ending-actions"><p>相同的开场，也可能走向不同的结局。</p><button className="cd-btn cd-primary" onClick={reset}><RotateCcw size={15}/>重新推演</button></div>}</section>}
    <footer className="cd-footer"><span>CHIP DIPLOMACY <b>·</b> 让多方立场，在同一张桌上相遇。</span><span>独立目标 / 有限信息 / 自主互动</span></footer>
  </main>{showSources&&<div className="cd-modal-backdrop" onClick={()=>setSources(false)}><section className="cd-modal" role="dialog" aria-modal="true" aria-labelledby="cd-sources-title" onClick={e=>e.stopPropagation()}><button className="cd-icon-btn" aria-label="关闭情景说明" onClick={()=>setSources(false)}><X size={20}/></button><div className="cd-eyebrow">SCENARIO & EVIDENCE</div><h2 id="cd-sources-title">情景与事实边界</h2><h3>{snapshot?.scenario.title??'先进半导体设备出口管制争端'}</h3><p>{snapshot?.scenario.description??'虚构后续谈判：美国希望荷兰扩大特定先进设备管制合作，中国希望避免限制扩大；荷兰协调安全与产业利益，ASML争取合法经营与政策透明。结果不预设。'}</p><h4>历史背景 [E]</h4>{snapshot?snapshot.scenario.facts.map((fact,i)=><p key={i}><strong>{fact.label}</strong> {fact.text}<br/><a href={fact.url} target="_blank" rel="noreferrer">查看一手来源<SquareArrowOutUpRight size={12}/></a></p>):<p>情景启动后展示荷兰政府、美国 BIS 与 ASML 的历史政策及企业声明来源。历史资料不等于对当前全部法律的描述。</p>}<h4>模拟设定 [G]</h4>{(snapshot?.scenario.assumptions??['四方目标、私有信息与后续谈判为模拟设定，不代表现实主体意图。','文本决定不自动成为现实政策。系统不模拟经济收益，不输出胜负评分。']).map((a,i)=><p key={i}>{a}</p>)}<h4>生成内容 [AI]</h4><p>实时模式由模型生成合法行动；失败将明确记录并跳过，不伪造成功。演示模式为固定示例脚本，不是实时模型推演。理由为可公开的简短说明，不展示私有推理链。</p><button className="cd-btn cd-primary" onClick={()=>setSources(false)}>返回谈判桌</button></section></div>}</div>;
}
