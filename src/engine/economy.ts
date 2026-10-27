import type {AgentId,Decisions,GameState,Indicators,Score} from './types';
import {clamp,round} from './rng';
export type Flows=Omit<Indicators,'player_score'> & { tsmc_delivered:number; other_market:number; ga_consumed:number; ge_consumed:number; ga_imports:number; ge_imports:number };
export function licenseFactor(s:GameState,level:number,type:'chip'|'tool'='tool'):number {
  return s.config.parameters[`${type}_${['open','review','strict'][level]}`]??0;
}
export function calculateFlows(s:GameState,decisions:Decisions={}):Flows {
  const p=s.config.parameters,t=s.technology,c=s.capacity;
  const adapt=p.adaptation_base+p.adaptation_weight*t.cn_adaptation/100;
  const bottlenecks={design:t.cn_design*p.design_output*adapt,manufacturing:t.cn_process*t.cn_yield/100*p.process_output,
    equipment:Math.min(t.cn_tools_litho*p.litho_output,t.cn_tools_other*p.other_tool_output),packaging:t.cn_packaging*p.packaging_output,
    hbm:Math.min(c.cn_hbm_access,c.global_hbm*p.cn_hbm_fraction)*p.hbm_output};
  const domestic=Math.max(0,Math.min(p.demand_cn,...Object.values(bottlenecks)));
  const committedUS=c.tsmc_total*(1-c.tsmc_flexible_share)*p.committed_us_share;
  const flexibleUS=c.tsmc_total*c.tsmc_flexible_share*c.tsmc_us_ai_allocation;
  const committedOther=c.tsmc_total*(1-c.tsmc_flexible_share)*(1-p.committed_us_share);
  const flexibleOther=c.tsmc_total*c.tsmc_flexible_share*(1-c.tsmc_us_ai_allocation);
  const legalUS=s.policy.tw_compliance_mask.US_AI?1:0,legalOther=s.policy.tw_compliance_mask.OTHER?1:0;
  const hbmAvailable=Math.max(0,c.global_hbm-domestic),committed=committedUS*legalUS+committedOther*legalOther;
  const committedRatio=Math.min(1,hbmAvailable/Math.max(1,committed));
  const remainingHbm=Math.max(0,hbmAvailable-committed*committedRatio);
  const flexibleRatio=Math.min(1,remainingHbm/Math.max(1,flexibleUS*legalUS+flexibleOther*legalOther));
  const usOutput=legalUS*(committedUS*committedRatio+flexibleUS*flexibleRatio);
  const otherAllocation=legalOther*(committedOther*committedRatio+flexibleOther*flexibleRatio);
  const market=decisions.US_AI?.actions.find(a=>a.id==='US_AI_MARKET')?.target;
  const cnOrder=market==='china'?p.market_cn_order:market==='other'?p.market_other_cn_order:p.order_cn;
  const legalCN=Math.max(0,Math.min(cnOrder*licenseFactor(s,s.policy.us_chip,'chip'),p.demand_cn-domestic,usOutput));
  const otherMarket=Math.min(p.order_other,Math.max(0,usOutput-legalCN));
  const material=(key:'ga'|'ge')=>{
    const m=s.materials[key],imports=m.licensed_supply*licenseFactor(s,s.policy[`cn_${key}`]);
    const consumed=Math.min(m.affected_sector_demand,m.inventory+imports+m.non_cn_alt_capacity);
    const shortage=Math.max(0,m.affected_sector_demand-consumed);
    return {imports,consumed,cost:100+100*shortage/Math.max(1,m.affected_sector_demand)*p.materials_cost_slope};
  };
  const ga=material('ga'),ge=material('ge');
  return {cn_legal_ai_import:round(legalCN),cn_domestic_ai_output:round(domestic),cn_usable_ai:round(Math.min(p.demand_cn,domestic+legalCN)),us_ai_output:round(legalCN+otherMarket),
    ga_sector_cost:round(ga.cost),ge_sector_cost:round(ge.cost),us_exporter_loss:round(Math.max(0,p.order_cn-legalCN)*p.price_us_ai),
    nl_litho_profit:s.finance.industry_profit.NL,jp_tool_profit:s.finance.industry_profit.JP,kr_memory_profit:s.finance.industry_profit.KR,
    supply_chain_risk:round(clamp(100*(1-(domestic+legalCN)/Math.max(1,p.demand_cn)))),dependency_index:round(100*legalCN/Math.max(1,domestic+legalCN)),
    bottlenecks:Object.fromEntries(Object.entries(bottlenecks).map(([k,v])=>[k,round(v)])) as Indicators['bottlenecks'],
    tsmc_delivered:round(Math.min(c.tsmc_total,c.global_hbm-domestic,legalCN+otherMarket+otherAllocation)),other_market:round(otherMarket),ga_consumed:ga.consumed,ge_consumed:ge.consumed,ga_imports:ga.imports,ge_imports:ge.imports};
}
export function computeScore(s:GameState,role:AgentId,flows=calculateFlows(s)):Score {
  const p=s.config.parameters,us=role.startsWith('US'),cn=role.startsWith('CN');
  let technology:number,economy:number,diplomacy:number,fiscal:number;
  if(!role.endsWith('_GOV')){
    const firm=role as keyof typeof s.finance.firm_cash;
    technology=firm==='US_AI'?s.technology.us_ai_frontier:firm==='CN_DESIGN'?s.technology.cn_design:firm==='CN_FAB'?(s.technology.cn_process+s.technology.cn_yield)/2:s.capacity.tsmc_total;
    economy=p.score_initial_economy+s.finance.firm_profit[firm]*p.score_profit_scale;
    diplomacy=100;fiscal=s.finance.firm_cash[firm]*p.score_cash_scale;
  }
  else if(cn){technology=100*flows.cn_usable_ai/Math.max(1,p.demand_cn);economy=p.score_initial_economy+(s.finance.firm_profit.CN_DESIGN+s.finance.firm_profit.CN_FAB)*p.score_profit_scale;
    diplomacy=100-(s.policy.cn_ga+s.policy.cn_ge)*p.score_material_diplomacy_penalty;fiscal=s.finance.government_budgets.CN_GOV*p.score_fiscal_scale;}
  else if(us){technology=(s.technology.us_ai_frontier+100-flows.cn_legal_ai_import)/2;economy=p.score_initial_economy+s.finance.firm_profit.US_AI*p.score_profit_scale;
    diplomacy=Object.values(s.politics.alignment).reduce((a,b)=>a+b,0)/3;fiscal=s.finance.government_budgets.US_GOV*p.score_fiscal_scale;}
  else {const country=role==='NL_GOV'?'NL':role==='JP_GOV'?'JP':'KR';technology=role==='TSMC'?s.capacity.tsmc_total:s.capacity.global_hbm;economy=p.score_initial_economy+(role==='TSMC'?s.finance.firm_profit.TSMC:s.finance.industry_profit[country])*p.score_profit_scale;
    diplomacy=role==='TSMC'?100:s.politics.alignment[`US_${country}`];fiscal=role==='TSMC'?s.finance.firm_cash.TSMC:s.finance.government_budgets[role as 'NL_GOV'];}
  const dimensions={technology:round(clamp(technology)),economy:round(clamp(economy)),diplomacy:round(clamp(diplomacy)),fiscal:round(clamp(fiscal))};
  const w=s.private.weights[role];
  const longTermPotential=round(Math.min(p.score_longterm_cap,s.pending_projects.filter(x=>cn?x.owner.startsWith('CN'):us?x.owner.startsWith('US'):x.owner===role).reduce((sum,x)=>sum+x.invest*p.project_discount/Math.max(1,x.due_turn-s.turn+1),0)));
  const total=round(clamp(dimensions.technology*w.security+dimensions.economy*w.industry+dimensions.diplomacy*w.diplomacy+dimensions.fiscal*w.fiscal-flows.supply_chain_risk*p.score_risk_penalty+longTermPotential));
  const label=dimensions.fiscal<p.score_fiscal_warning?'产业推进，财政承压':cn?(flows.cn_domestic_ai_output>flows.cn_legal_ai_import?'自主供给积累':'进口与国产协同'):(flows.us_exporter_loss>p.score_export_loss_warning?'技术遏制伴随商业损失':'安全与产业的有限平衡');
  return {dimensions,total,label,longTermPotential,explanation:`技术/算力、经济、外交、财政按本角色公开权重计分。未兑现项目仅计折现潜力 ${longTermPotential}，不计入实际交付。[G]`};
}
export function publicIndicators(s:GameState,flows=calculateFlows(s)):Indicators {
  const {tsmc_delivered:_,other_market:__,ga_consumed:___,ge_consumed:____,ga_imports:_____,ge_imports:______,...indicators}=flows;
  return {...indicators,player_score:computeScore(s,s.playerRole,flows)};
}
export function deriveIndicators(s:GameState):Indicators {
  const last=s.history.at(-1);
  if(s.phase==='S5_REPORT'&&last) return structuredClone(last.indicators);
  return publicIndicators(s);
}
export function scoreGame(s:GameState,role:AgentId):Score {
  if(role===s.playerRole&&s.phase==='S5_REPORT'&&s.history.length) return structuredClone(s.history.at(-1)!.indicators.player_score);
  return computeScore(s,role);
}
