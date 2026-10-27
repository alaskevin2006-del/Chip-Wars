import type { Action, AgentDecision, AgentObservation } from '../engine/types';

export interface LLMOptions { endpoint?:string; timeoutMs?:number; fetchImpl?:typeof fetch }
export interface LLMResult { decision:AgentDecision|null; fallback:boolean; reason?:string }
const key=(action:Action)=>`${action.id}|${action.target ?? ''}|${action.level ?? ''}`;
/** Optional adviser only: callers validate its decision through the authoritative engine. */
export async function decideLLM(observation:AgentObservation,options:LLMOptions={}):Promise<LLMResult> {
  const controller=new AbortController();
  const timeoutMs=Math.max(20,Math.min(options.timeoutMs ?? 9500,15000));
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},timeoutMs);});
  const request=async():Promise<LLMResult>=>{
    try {
      const response=await (options.fetchImpl ?? fetch)(options.endpoint ?? '/api/agent/decide',{
        method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',signal:controller.signal,
        body:JSON.stringify({observation,legalActions:observation.legalActions}),
      });
      if(!response.ok)return {decision:null,fallback:true,reason:response.status===429?'rate_limit':'server_unavailable'};
      const data=await response.json();
      if(data?.fallback===true)return {decision:null,fallback:true,reason:typeof data.reason==='string' && data.reason.length<=80 ? data.reason:'rule_fallback'};
      if(data?.fallback!==false || !data?.decision || !Array.isArray(data.decision.actions) || data.decision.actions.length>2)return {decision:null,fallback:true,reason:'invalid_response'};
      const actions:Action[]=[];const seen=new Set<string>();let ap=0;let cash=0;
      for(const action of data.decision.actions) {
        if(!action || typeof action.id!=='string' || Object.keys(action).some(field=>!['id','target','level'].includes(field)))return {decision:null,fallback:true,reason:'invalid_decision'};
        const legal=observation.legalActions.find(candidate=>key(candidate)===key(action));
        const template=action.id==='CN_MATERIAL_LICENSE'?`${action.id}:${action.target}`:action.id;
        if(!legal || seen.has(template))return {decision:null,fallback:true,reason:'invalid_decision'};
        seen.add(template);ap+=legal.ap_cost;cash+=legal.money_cost;actions.push(action);
      }
      if((seen.has('HOLD') && seen.size>1)||ap>observation.privateState.ap||cash>observation.privateState.cash)return {decision:null,fallback:true,reason:'invalid_decision'};
      const rationale=data.decision.rationale;
      if(rationale!==undefined && (typeof rationale!=='string'||rationale.length>800))return {decision:null,fallback:true,reason:'invalid_response'};
      return {decision:{actions,rationale,source:'llm'},fallback:false};
    }catch {return {decision:null,fallback:true,reason:controller.signal.aborted?'timeout':'network_error'};}
  };
  try{return await Promise.race([request(),timeout]);}
  catch{return {decision:null,fallback:true,reason:'timeout'};}
  finally{clearTimeout(timer);controller.abort();}
}
