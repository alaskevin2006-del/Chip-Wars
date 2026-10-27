import type {AgentId,AgentObservation,GameState} from './types';
import {availableCash,getLegalActions} from './actions';
import {deriveIndicators,scoreGame} from './economy';
export function getObservation(state:GameState,role:AgentId):AgentObservation {
  if(!(role in state.private.weights))throw new Error('未知角色');
  const {firm_cash:_,...finance}=state.finance;
  const indicators=deriveIndicators(state);indicators.player_score=scoreGame(state,role);
  const history=state.history.flatMap(t=>t.events).slice(-180).map(e=>({...e,deltas:e.deltas.filter(d=>!d.path.startsWith('finance.firm_cash.')||d.path===`finance.firm_cash.${role}`)}));
  return structuredClone({roleId:role,turn:state.turn,phase:state.phase,
    publicState:{policy:state.policy,technology:state.technology,capacity:state.capacity,materials:state.materials,finance,politics:state.politics,indicators,pending_projects:state.pending_projects},
    privateState:{weights:state.private.weights[role],strategy_type:state.private.strategy_type[role],estimates:state.private.private_estimates[role],cash:availableCash(state,role),ap:state.config.ap[role]},history,legalActions:getLegalActions(state,role)});
}
