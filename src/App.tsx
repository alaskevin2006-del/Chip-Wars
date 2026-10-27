import { useState } from 'react';
import { Activity, ArrowUpRight, CircleHelp, FileText, Flag, Globe2, LayoutDashboard, LoaderCircle, RotateCcw, X } from 'lucide-react';
import type { LegalAction, PlayerRole, Action } from './engine/types';
import { type GameAdapter, type GameSnapshot, roleNames } from './ui/adapter';
import { createMockAdapter } from './ui/mock';
import { Brand, Disclaimer, ModeBadge } from './ui/common';
import { StartScreen } from './ui/StartScreen';
import { GameScreen, toggleAction } from './ui/GameScreen';
import { ReportScreen } from './ui/ReportScreen';
import { EndingScreen } from './ui/EndingScreen';
import './ui/styles.css';

const defaultAdapter = createMockAdapter();
export default function App({ adapter = defaultAdapter }: { adapter?: GameAdapter }) {
  const [screen, setScreen] = useState<'start'|'game'|'report'|'ending'>('start');
  const [role,setRole] = useState<PlayerRole>('CN_GOV');
  const [useLLM,setLLM] = useState(false);
  const [snapshot,setSnapshot] = useState<GameSnapshot|null>(null);
  const [selected,setSelected] = useState<LegalAction[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [help,setHelp] = useState(false);
  function start() { try { setSnapshot(adapter.start(role,{useLLM,seed:2027})); setSelected([]); setError(''); setScreen('game'); } catch { setError('开局失败，请重试。'); } }
  async function submit(actions: Action[]) {
    if (busy) return;
    setBusy(true); setError('');
    try { const next = await adapter.play(actions); setSnapshot(next); setSelected([]); setScreen('report'); window.scrollTo?.({top:0,behavior:'instant'}); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '本轮未能完成，请重试。当前决策仍然保留。'); }
    finally { setBusy(false); }
  }
  function navigate(next: typeof screen) { setScreen(next); window.scrollTo?.({top:0,behavior:'instant'}); }
  if (screen === 'start' || !snapshot) return <><StartScreen role={role} onRole={setRole} useLLM={useLLM} onLLM={setLLM} onStart={start}/>{error && <div className="start-error" role="alert">{error}</div>}</>;
  return <div className="app-shell"><aside className="sidebar"><Brand/><div className="sidebar-section-label">模拟控制台 <span>SIMULATION</span></div><nav><button className={screen==='game'?'active':''} onClick={()=>navigate(snapshot.finished?'ending':'game')} disabled={busy}><LayoutDashboard size={17}/>决策中心<small>01</small></button><button className={screen==='report'?'active':''} onClick={()=>navigate('report')} disabled={busy||!snapshot.records.length}><FileText size={17}/>回合战报<small>{String(snapshot.records.length).padStart(2,'0')}</small></button><button className={screen==='ending'?'active':''} onClick={()=>navigate('ending')} disabled={!snapshot.finished||busy}><Flag size={17}/>最终绩效<small>06</small></button></nav><div className="sidebar-divider"/><div className="sidebar-scenario"><span className="eyebrow">ACTIVE SCENARIO</span><Globe2 size={72} strokeWidth={.65}/><strong>技术封锁与<br/>供应链重构</strong><span>2027 / 虚构近未来</span><div><i/> 标准情景 · 六轮对局</div></div><div className="sidebar-bottom"><button onClick={()=>setHelp(true)}><CircleHelp size={16}/>规则与边界<ArrowUpRight size={14}/></button><button disabled={busy} onClick={()=>{setScreen('start');setSnapshot(null);setError('');}}><RotateCcw size={16}/>重新开局</button><span>ENGINE V3.0 / [G] ASSUMPTIONS</span></div></aside><div className="app-main"><header className="topbar"><div><Activity size={15}/><span>CHIP WARS</span><span className="topbar-separator">/</span><small>策略模拟实验室</small></div><div><ModeBadge mode={snapshot.mode}/><span className="topbar-role">{roleNames[snapshot.observation.roleId]}</span></div></header><main className={`main-content ${screen==='game'?'game-content':''}`}>{snapshot.notice && <div className="notice" role="status"><CircleHelp size={14}/>{snapshot.notice}</div>}{error&&<div className="error-notice" role="alert">{error}<button aria-label="关闭错误提示" onClick={()=>setError('')}><X size={15}/></button></div>}{screen==='game'&&<GameScreen snapshot={snapshot} selected={selected} busy={busy} onSelect={action=>setSelected(current=>toggleAction(action,current))} onSubmit={submit}/>} {screen==='report'&&<ReportScreen snapshot={snapshot} onContinue={()=>navigate(snapshot.finished?'ending':'game')}/>} {screen==='ending'&&<EndingScreen snapshot={snapshot} onRestart={()=>{setScreen('start');setSnapshot(null);}} onReport={()=>navigate('report')}/>}<footer className="app-footer"><Disclaimer/><span>CHIP WARS · {String(snapshot.observation.turn).padStart(2,'0')} / 06</span></footer></main></div>{busy&&<div className="busy-indicator" role="status"><LoaderCircle className="spinner" size={16}/>封闭提交 → 第三方政府 → 企业 → 规则结算</div>}{help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="help-modal panel" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={event=>event.stopPropagation()}><button className="modal-close" aria-label="关闭规则说明" onClick={()=>setHelp(false)}><X size={20}/></button><span className="eyebrow">RULES & BOUNDARIES</span><h2 id="help-title">在约束中做选择。</h2><p>你控制一个政府，每轮最多 2 AP。政府与企业独立决策，补贴是资金转移，研发需要企业投资并延迟生效。</p><p>九个参与方，六轮政策周期。许可只影响合法新增供给，不能凭空抹去设备存量。设计、工艺、良率、封装和 HBM 分开约束交付。</p><p>镓与锗影响各自真实相关的下游部门。外交与游说影响判断，不能强制别国改变政策。缓和邀约首版暂未开放。</p><p>模型仅可选择合法动作；模型不可用时，游戏自动采用规则决策。所有数值后果由规则引擎计算。</p><Disclaimer full/><button className="primary" onClick={()=>setHelp(false)}>返回决策室</button></section></div>}</div>;
}
