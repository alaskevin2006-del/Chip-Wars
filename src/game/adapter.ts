import { AGENT_IDS,createGame,DEFAULT_CONFIG,getObservation,validateDecision,projectPhase,resolveTurn } from '../engine';
import type { Action,AgentDecision,AgentId,AgentObservation,Decisions,GameState,PlayerRole } from '../engine';
import { decideRule } from '../agents/rule';
import type { GameAdapter,GameSnapshot,StartOptions } from '../ui/adapter';

type ModelResult = {decision:AgentDecision|null;fallback:boolean;reason?:string};
interface AdapterOptions { llmDecider?:(observation:AgentObservation)=>Promise<ModelResult> }

/** Sole game-state owner; model sees the opponent's pre-submission observation only. */
export function createEngineAdapter(options:AdapterOptions = {}):GameAdapter {
  let state:GameState|undefined;
  let useLLM=false;
  let busy=false;
  let generation=0;
  let notice:string|undefined;
  const snapshot=():GameSnapshot=>{
    if (!state) throw new Error('请先选择阵营并开始对局。');
    const observation=getObservation(state,state.playerRole);
    const records=state.history.map(record=>({...record,
      decisions:Object.fromEntries(Object.entries(record.decisions).map(([role,decision])=>[role,{actions:decision!.actions,source:decision!.source,...(role===state!.playerRole?{rationale:decision!.rationale}:{})}])),
      events:record.events.map(event=>({...event,deltas:event.deltas.filter(delta=>!delta.path.startsWith('finance.firm_cash.')&&!delta.path.startsWith('private.'))})),
    }));
    return structuredClone({observation:{...observation,phase:state.finished?'S5_REPORT':'S0_BRIEFING'},records,finished:state.finished,mode:useLLM?'llm':'rule',notice});
  };
  return {
    start(role:PlayerRole,settings:StartOptions):GameSnapshot {
      generation++;
      state=createGame(DEFAULT_CONFIG,settings.seed??2027,role);
      useLLM=settings.useLLM;
      busy=false;
      notice=undefined;
      return snapshot();
    },
    async play(actions:Action[]):Promise<GameSnapshot> {
      if (!state) throw new Error('请先开始对局。');
      if (busy) throw new Error('本轮正在结算，请稍候。');
      if (state.finished) throw new Error('六轮对局已结束，请重新开局。');
      const base=state;
      const currentGeneration=generation;
      const playerDecision:AgentDecision={actions:structuredClone(actions),source:'player',rationale:'玩家提交的政策组合'};
      const validation=validateDecision(base,base.playerRole,playerDecision);
      if (!validation.valid) throw new Error(validation.errors.join('；'));
      busy=true;
      let nextNotice:string|undefined;
      try {
        const opponent:PlayerRole=base.playerRole==='CN_GOV'?'US_GOV':'CN_GOV';
        const opponentObservation=getObservation(base,opponent);
        let opponentDecision=decideRule(opponentObservation);
        if (useLLM) {
          try {
            const result=options.llmDecider?await options.llmDecider(opponentObservation):{decision:null,fallback:true};
            if (result.decision&&!result.fallback&&validateDecision(base,opponent,result.decision).valid) {
              opponentDecision={...result.decision,source:'llm'};
            } else {
              opponentDecision={...opponentDecision,source:'fallback'};
              nextNotice='模型暂不可用或动作未通过校验，本轮已由规则对手接管。';
            }
          } catch {
            opponentDecision={...opponentDecision,source:'fallback'};
            nextNotice='模型连接失败，本轮已由规则对手接管。';
          }
        }
        if (generation!==currentGeneration) throw new Error('对局已重新开始，已丢弃旧对局的模型回复。');
        const decisions:Decisions={[base.playerRole]:playerDecision,[opponent]:opponentDecision};
        const thirdState=projectPhase(base,decisions,'S2_THIRD_GOV',base.config);
        for (const role of ['NL_GOV','JP_GOV','KR_GOV'] as AgentId[]) decisions[role]=decideRule(getObservation(thirdState,role));
        const firmState=projectPhase(base,decisions,'S3_FIRMS',base.config);
        for (const role of AGENT_IDS.filter(role=>!role.endsWith('_GOV'))) decisions[role]=decideRule(getObservation(firmState,role));
        const result=resolveTurn(base,decisions,{seed:(base.seed+Math.imul(base.turn,0x9e3779b9))>>>0},base.config);
        state=result.nextState;
        notice=nextNotice;
        return snapshot();
      } finally {
        if (generation===currentGeneration) busy=false;
      }
    },
  };
}
