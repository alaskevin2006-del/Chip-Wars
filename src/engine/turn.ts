import {AGENT_IDS,type AgentId,type Decisions,type GameConfig,type GameState,type Phase,type PlayerRole,type RandomInputs,type TurnResult} from './types';
import {applyPhases,event,settle} from './mechanics';
import {deriveIndicators,publicIndicators} from './economy';

export function createGame(config:GameConfig,seed:number,playerRole:PlayerRole):GameState {
  if(!Number.isFinite(seed)||!['US_GOV','CN_GOV'].includes(playerRole))throw new Error('无效的随机种子或玩家角色');
  if(config.version!=='3.0'||config.maxTurns!==6)throw new Error('V3.0 固定为六轮');
  for(const role of AGENT_IDS){const weights=config.preferences[role];if(Math.abs(Object.values(weights).reduce((a,b)=>a+b,0)-1)>0.000001)throw new Error(`${role} 偏好权重必须和为1`);}
  const cloned=structuredClone(config);
  return {...structuredClone(cloned.initial),config:cloned,turn:1,phase:'S0_BRIEFING',playerRole,finished:false,seed:seed>>>0,rng_state:seed>>>0,pending_projects:[],history:[],external_shocks:[],
    private:{weights:structuredClone(cloned.preferences),strategy_type:Object.fromEntries(AGENT_IDS.map(role=>[role,cloned.preferences[role].security>cloned.preferences[role].industry?'security':cloned.preferences[role].industry>.4?'industry':'balanced'])) as GameState['private']['strategy_type'],private_estimates:Object.fromEntries(AGENT_IDS.map((role,i)=>[role,{decision_seed:(seed+i*7919)>>>0,industry_signal:0}])) as unknown as GameState['private']['private_estimates']}};
}
function verifyBase(state:GameState,config:GameConfig,decisions:Decisions):void {
  if(state.finished)throw new Error('对局已经结束');
  if(!['S0_BRIEFING','S5_REPORT'].includes(state.phase))throw new Error('只能从原始回合状态结算，不能重复结算投影状态');
  if(JSON.stringify(state.config)!==JSON.stringify(config))throw new Error('配置必须与开局配置相同');
  for(const role of Object.keys(decisions))if(!AGENT_IDS.includes(role as AgentId))throw new Error(`未知角色：${role}`);
}
export function projectPhase(state:GameState,decisions:Decisions,phase:Phase,config:GameConfig):GameState {
  verifyBase(state,config,decisions);
  const count=phase==='S2_THIRD_GOV'?1:phase==='S3_FIRMS'?2:phase==='S4_RESOLVE'?3:0;
  const next=structuredClone(state);applyPhases(next,decisions,count,[]);next.phase=phase;return next;
}
export function resolveTurn(state:GameState,decisions:Decisions,random:RandomInputs,config:GameConfig):TurnResult {
  verifyBase(state,config,decisions);
  if(!random||!Number.isFinite(random.seed))throw new Error('必须提供显式随机输入');
  if(random.research?.some(x=>!Number.isFinite(x))||(random.shock!==undefined&&!Number.isFinite(random.shock)))throw new Error('随机输入必须是有限数值');
  const previousIndicators=deriveIndicators(state);
  const nextState=structuredClone(state),events:TurnResult['events']=[];
  applyPhases(nextState,decisions,3,events);
  const flows=settle(nextState,decisions,random,events);
  nextState.phase='S5_REPORT';
  const indicators=publicIndicators(nextState,flows);
  const indicatorCauses={cn_legal_ai_import:'M1_LEGAL_TRADE',cn_usable_ai:'M1_LEGAL_TRADE',cn_domestic_ai_output:'M2_TOOLS_FAB',ga_sector_cost:'M4_MATERIALS',ge_sector_cost:'M4_MATERIALS',us_ai_output:'M6_SUPPLY_ALLOCATION'} as const;
  for(const [key,mechanism]of Object.entries(indicatorCauses) as [keyof typeof indicatorCauses,typeof indicatorCauses[keyof typeof indicatorCauses]][]){
    if(previousIndicators[key]!==indicators[key])events.find(e=>e.mechanism===mechanism)!.deltas.push({path:`indicators.${key}`,before:previousIndicators[key],after:indicators[key]});
  }
  event(nextState,events,'PHASE','本轮结算完成',`已执行九角色决策和M1—M6。${indicators.player_score.label}；综合分 ${indicators.player_score.total}。[G]`);
  const fullDecisions:Decisions={};for(const role of AGENT_IDS)fullDecisions[role]=structuredClone(decisions[role]??{actions:[],source:'rule'});
  nextState.history.push({turn:state.turn,decisions:fullDecisions,events:structuredClone(events),indicators:structuredClone(indicators)});
  nextState.finished=state.turn>=config.maxTurns;
  nextState.turn=nextState.finished?config.maxTurns:state.turn+1;
  return {nextState,events,indicators};
}
