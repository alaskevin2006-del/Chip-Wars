import type {Action,AgentDecision,AgentObservation,LegalAction} from '../engine/types';
import {DEFAULT_CONFIG} from '../engine/config';

/** Observation-only one-step marginal utility. Preferences differ by role; legal constraints are hard. */
function utility(o:AgentObservation,a:LegalAction):number {
  const s=o.publicState,w=o.privateState.weights,role=o.roleId,t=s.technology,pressure=s.politics.domestic_pressure;
  const p=DEFAULT_CONFIG.parameters;
  let security=0,industry=0,diplomacy=0,fiscal=-a.money_cost/p.rule_cost_divisor;
  const remaining=Math.max(0,(DEFAULT_CONFIG.maxTurns+1)-a.effective_at),investmentHorizon=remaining/p.rule_horizon_divisor;
  const sectorPressure=role.endsWith('_GOV')?pressure[role as keyof typeof pressure]:0;
  const tightening=(a.level??0)>(a.id==='US_CHIP_LICENSE'?s.policy.us_chip:a.id==='US_TOOL_LICENSE'?s.policy.us_tool:a.id==='NL_DUV_LICENSE'?s.policy.nl_duv:a.id==='JP_TOOL_LICENSE'?s.policy.jp_tool:a.target==='ga'?s.policy.cn_ga:s.policy.cn_ge);
  switch(a.id){
    case 'US_CHIP_LICENSE':security=tightening?p.rule_chip_security_gain:-p.rule_chip_security_relax;industry=tightening?-p.rule_chip_trade_loss-sectorPressure*p.rule_us_pressure_tight:p.rule_trade_recovery+sectorPressure*p.rule_us_pressure_relax;diplomacy=tightening?-p.rule_diplomatic_tight:p.rule_diplomatic_relax;break;
    case 'US_TOOL_LICENSE':security=tightening?p.rule_tool_security_gain:-p.rule_tool_security_relax;industry=tightening?-p.rule_tool_trade_loss-sectorPressure*p.rule_ally_pressure_tight:p.rule_diplomatic_relax+sectorPressure*p.rule_us_pressure_tight;break;
    case 'US_DIPLOMACY':security=p.rule_small_security;diplomacy=p.rule_coord_value-(s.politics.alignment[a.target==='NL_GOV'?'US_NL':a.target==='JP_GOV'?'US_JP':'US_KR']-p.rule_alignment_center)*p.rule_alignment_diminish;break;
    case 'US_SUPPORT':industry=a.target==='materials'?(s.indicators.ga_sector_cost+s.indicators.ge_sector_cost>p.rule_material_cost_trigger?p.rule_material_urgency:p.rule_material_normal)*investmentHorizon:p.rule_rd_support;security=a.target==='rd'?p.rule_medium_security:p.rule_diplomatic_relax;break;
    case 'CN_MATERIAL_LICENSE':security=tightening?p.rule_material_security:-p.rule_material_relax;industry=tightening?-p.rule_material_trade_loss-sectorPressure*p.rule_cn_pressure:p.rule_trade_recovery+sectorPressure*p.rule_cn_pressure;diplomacy=tightening?-p.rule_medium_security:p.rule_medium_security;break;
    case 'CN_SUBSIDY':{
      const target=a.target==='manufacturing'?'CN_FAB':'CN_DESIGN',profit=s.finance.firm_profit[target];
      industry=p.rule_subsidy_base+Math.max(0,p.rule_profit_target-profit)*p.rule_subsidy_urgency;security=p.rule_small_security;
      if(a.target==='packaging'&&s.indicators.bottlenecks.packaging<=Math.min(s.indicators.bottlenecks.manufacturing,s.indicators.bottlenecks.hbm))industry+=p.rule_medium_security;break;
    }
    case 'CN_INDUSTRY_COORD':industry=(100-t.cn_adaptation)*p.rule_coord_deficit;security=p.rule_small_security;break;
    case 'NL_DUV_LICENSE':case 'JP_TOOL_LICENSE':security=tightening?p.rule_tool_security_gain:-p.rule_tool_security_relax;industry=tightening?-p.rule_tool_security_relax-sectorPressure*p.rule_ally_pressure_tight:p.rule_trade_recovery+sectorPressure*p.rule_ally_pressure_relax;diplomacy=tightening?p.rule_medium_security:-p.rule_small_security;break;
    case 'NL_SUPPORT':case 'JP_SUPPORT':industry=(p.rule_material_normal+sectorPressure*p.rule_ally_support_pressure)*investmentHorizon;break;
    case 'NL_COORD':diplomacy=a.target==='alignment'?p.rule_rd_support:p.rule_small_security;industry=a.target==='autonomy'?p.rule_profit_target:0;break;
    case 'KR_STORAGE_SUPPORT':industry=(p.rule_coord_value+(s.capacity.global_hbm<p.rule_hbm_target?p.rule_profit_target:0))*investmentHorizon;security=p.rule_diplomatic_relax;break;
    case 'KR_FAB_DIPLOMACY':diplomacy=p.rule_material_normal;industry=(100-s.capacity.kr_china_fab_operability)*p.rule_cn_pressure;break;
    case 'US_AI_MARKET':industry=a.target==='china'?(s.policy.us_chip===0?p.rule_material_urgency:s.policy.us_chip===1?p.rule_subsidy_base:-p.rule_profit_target):s.policy.us_chip===2?p.rule_other_market_restrict:p.rule_other_market_open;break;
    case 'US_AI_RD':industry=(100-t.us_ai_frontier)*p.rule_frontier_deficit*investmentHorizon;security=p.rule_medium_security*investmentHorizon;break;
    case 'US_AI_LOBBY':industry=s.indicators.us_exporter_loss*p.rule_lobby_loss;diplomacy=p.rule_small_security;break;
    case 'CN_DESIGN_RD':industry=(100-t.cn_design)*p.rule_coord_deficit*investmentHorizon;security=p.rule_medium_security;break;
    case 'CN_DESIGN_COORD':industry=a.target==='packaging'?(t.cn_packaging<=Math.min(t.cn_process*t.cn_yield/100,s.capacity.cn_hbm_access)?p.rule_packaging_urgency:p.rule_profit_target)*investmentHorizon:(100-t.cn_adaptation)*p.rule_adaptation_deficit*investmentHorizon;break;
    case 'CN_FAB_INVEST':industry=(a.target==='yield'?(100-t.cn_yield)*p.rule_frontier_deficit:a.target==='process'?(100-t.cn_process)*p.rule_process_deficit:(100-t.cn_local_tool_adaptation)*p.rule_tools_deficit)*investmentHorizon;security=p.rule_small_security;break;
    case 'CN_FAB_ORDER':industry=a.target==='allocation'?(100-t.cn_adaptation)*p.rule_coord_deficit:a.target==='litho'?Math.max(p.rule_diplomatic_tight,p.rule_equipment_target-t.cn_tools_litho):Math.max(p.rule_diplomatic_tight,p.rule_equipment_target-t.cn_tools_other);break;
    case 'TSMC_ALLOCATE':industry=a.target==='US_AI'?s.capacity.tsmc_us_ai_allocation<p.rule_flex_target?p.rule_chip_security_gain:p.rule_diplomatic_relax:s.capacity.tsmc_us_ai_allocation>p.rule_flex_target?p.rule_coord_value:p.rule_small_security;diplomacy=p.rule_diplomatic_tight;break;
    case 'TSMC_CAPEX':industry=p.rule_capex_value*investmentHorizon;fiscal-=p.rule_diplomatic_relax;diplomacy=a.target==='overseas'?p.rule_diplomatic_relax:0;break;
    case 'HOLD':fiscal=p.rule_diplomatic_tight;break;
    default:return -p.rule_unknown_penalty;
  }
  if(a.money_cost>o.privateState.cash*p.rule_cash_caution_share)fiscal-=p.rule_cash_caution_penalty;
  let hash=(o.privateState.estimates.decision_seed??0)+o.turn;
  for(const char of `${a.id}:${a.target??''}:${a.level??''}`)hash=(Math.imul(hash,31)+char.charCodeAt(0))>>>0;
  return security*w.security+industry*w.industry+diplomacy*w.diplomacy+fiscal*w.fiscal+(hash%101)/1000;
}
export function decideRule(o:AgentObservation):AgentDecision {
  const ranked=o.legalActions.map(a=>({a,value:utility(o,a)})).sort((a,b)=>b.value-a.value);
  const actions:Action[]=[],seen=new Set<string>();let ap=0,money=0;
  for(const {a,value}of ranked){
    if(a.id==='HOLD'||value<=0)continue;
    const key=a.id==='CN_MATERIAL_LICENSE'?`${a.id}:${a.target}`:a.id;
    if(seen.has(key)||ap+a.ap_cost>o.privateState.ap||money+a.money_cost>o.privateState.cash)continue;
    actions.push({id:a.id,...(a.target!==undefined?{target:a.target}:{}),...(a.level!==undefined?{level:a.level}:{})});seen.add(key);ap+=a.ap_cost;money+=a.money_cost;
  }
  return {actions:actions.length?actions:[{id:'HOLD'}],source:'rule',rationale:`依据本方${o.privateState.strategy_type}偏好，对合法行动的预期安全、产业、外交与财政边际收益加权；参考已公布产业利润及国内压力。`};
}
