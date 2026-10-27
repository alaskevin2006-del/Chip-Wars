import {AGENT_IDS,type Action,type AgentDecision,type AgentId,type Decisions,type Event,type FirmId,type GameState,type GovernmentId,type Phase,type StateDelta} from './types';
import {actionKey,getLegalActions,validateDecision} from './actions';
import {calculateFlows,licenseFactor,type Flows} from './economy';
import {clamp,nextRandom,round} from './rng';

const worldKeys=['policy','technology','capacity','materials','finance','politics'] as const;
function numbers(value:unknown,prefix:string,out:Record<string,number>):void {
  if(typeof value==='number')out[prefix]=value;
  else if(value&&typeof value==='object'&&!Array.isArray(value)) for(const [k,v]of Object.entries(value))numbers(v,prefix?`${prefix}.${k}`:k,out);
}
export function differences(before:GameState,after:GameState):StateDelta[]{
  const a:Record<string,number>={},b:Record<string,number>={};for(const key of worldKeys){numbers(before[key],key,a);numbers(after[key],key,b);}
  return Object.entries(b).filter(([path,v])=>v!==a[path]).map(([path,after])=>({path,before:a[path]??0,after}));
}
export function event(s:GameState,events:Event[],mechanism:Event['mechanism'],title:string,description:string,before?:GameState,actor?:AgentId,actions:Action[]=[]):void {
  events.push({id:`t${s.turn}-e${events.length+1}`,turn:s.turn,phase:s.phase,actor,mechanism,title,description,actions:structuredClone(actions),deltas:before?differences(before,s):[]});
}
function queue(s:GameState,owner:AgentId,target:string,invest:number,delay:number):void {
  const p=s.config.parameters;
  const fixed=target==='ga_alt'||target==='ge_alt'?p.materials_alt_gain:target==='global_hbm'?p.hbm_gain:target.startsWith('tsmc_')?p.capex_gain:target.endsWith('_industry')?p.support_profit_gain:null;
  s.pending_projects.push({id:`t${s.turn}-${owner}-${target}-${s.pending_projects.length}`,owner,target,invest,due_turn:s.turn+delay,expected_range:fixed===null?[p.rd_min,p.rd_max]:[fixed,fixed]});
}
function applyAction(s:GameState,role:AgentId,a:Action):void {
  const p=s.config.parameters,cost=s.config.costs[a.id],delay=s.config.delays[a.id];
  if(role.endsWith('_GOV'))s.finance.government_budgets[role as GovernmentId]=round(s.finance.government_budgets[role as GovernmentId]-cost);
  else s.finance.firm_cash[role as FirmId]=round(s.finance.firm_cash[role as FirmId]-cost);
  switch(a.id){
    case 'US_CHIP_LICENSE':s.policy.us_chip=a.level!;break;
    case 'US_TOOL_LICENSE':s.policy.us_tool=a.level!;break;
    case 'NL_DUV_LICENSE':s.policy.nl_duv=a.level!;break;
    case 'JP_TOOL_LICENSE':s.policy.jp_tool=a.level!;break;
    case 'CN_MATERIAL_LICENSE':s.policy[a.target==='ga'?'cn_ga':'cn_ge']=a.level!;break;
    case 'US_DIPLOMACY':{const key=a.target==='NL_GOV'?'US_NL':a.target==='JP_GOV'?'US_JP':'US_KR';s.politics.alignment[key]=clamp(s.politics.alignment[key]+p.alignment_step);break;}
    case 'US_SUPPORT':if(a.target==='rd')s.finance.firm_cash.US_AI=round(s.finance.firm_cash.US_AI+cost);else{queue(s,role,'ga_alt',cost/2,delay);queue(s,role,'ge_alt',cost/2,delay);}break;
    case 'CN_SUBSIDY':{const target=a.target==='manufacturing'?'CN_FAB':'CN_DESIGN';s.finance.firm_cash[target]=round(s.finance.firm_cash[target]+cost);break;}
    case 'CN_INDUSTRY_COORD':s.technology.cn_adaptation=clamp(s.technology.cn_adaptation+p.coord_adaptation);break;
    case 'NL_COORD':s.politics.alignment.US_NL=clamp(s.politics.alignment.US_NL+(a.target==='alignment'?p.alignment_step:-p.autonomy_step));break;
    case 'NL_SUPPORT':queue(s,role,'nl_industry',cost,delay);break;
    case 'JP_SUPPORT':queue(s,role,'jp_industry',cost,delay);break;
    case 'KR_STORAGE_SUPPORT':queue(s,role,'global_hbm',cost,delay);break;
    case 'KR_FAB_DIPLOMACY':s.politics.alignment.US_KR=clamp(s.politics.alignment.US_KR+p.alignment_step);break;
    case 'US_AI_RD':queue(s,role,'us_ai_frontier',cost,delay);break;
    case 'US_AI_LOBBY':s.politics.domestic_pressure.US_GOV=clamp(s.politics.domestic_pressure.US_GOV+p.pressure_lobby);break;
    case 'CN_DESIGN_RD':queue(s,role,'cn_design',cost,delay);break;
    case 'CN_DESIGN_COORD':queue(s,role,a.target==='packaging'?'cn_packaging':'cn_adaptation',cost,delay);break;
    case 'CN_FAB_INVEST':queue(s,role,a.target==='process'?'cn_process':a.target==='yield'?'cn_yield':'cn_local_tool_adaptation',cost,delay);break;
    case 'CN_FAB_ORDER':
      if(a.target==='litho')s.technology.cn_tools_litho+=p.litho_delivery*licenseFactor(s,s.policy.nl_duv);
      if(a.target==='us_tools')s.technology.cn_tools_other+=p.us_tool_delivery*licenseFactor(s,s.policy.us_tool);
      if(a.target==='jp_tools')s.technology.cn_tools_other+=p.jp_tool_delivery*licenseFactor(s,s.policy.jp_tool);
      if(a.target==='allocation')s.technology.cn_adaptation=clamp(s.technology.cn_adaptation+p.coord_adaptation);break;
    case 'TSMC_ALLOCATE':s.capacity.tsmc_us_ai_allocation=clamp(s.capacity.tsmc_us_ai_allocation+(a.target==='US_AI'?p.allocation_step:-p.allocation_step),0,1);break;
    case 'TSMC_CAPEX':queue(s,role,a.target==='overseas'?'tsmc_overseas':'tsmc_total',cost,delay);break;
    case 'US_AI_MARKET':case 'HOLD':break;
    default:throw new Error(`未实现或隐藏的行动：${a.id}`);
  }
}
export const phases:AgentId[][]=[['US_GOV','CN_GOV'],['NL_GOV','JP_GOV','KR_GOV'],['US_AI','CN_DESIGN','CN_FAB','TSMC']];
export const phaseNames:Phase[]=['S1_MAJOR_GOV','S2_THIRD_GOV','S3_FIRMS'];
export function applyPhases(s:GameState,decisions:Decisions,count:number,events:Event[]):void {
  for(let stage=0;stage<count;stage++){
    s.phase=phaseNames[stage];const snapshot=structuredClone(s);
    for(const role of phases[stage]){const decision=decisions[role]??{actions:[]};const check=validateDecision(snapshot,role,decision);if(!check.valid)throw new Error(`${role}: ${check.errors.join('；')}`);}
    event(s,events,'PHASE',phaseNames[stage],stage===0?'中美政府决策封闭提交后统一公布':stage===1?'第三方政府依本国目标独立决策':'企业在公开许可下独立提交；日常经营自动履行');
    for(const role of phases[stage]){
      const decision:AgentDecision=decisions[role]??{actions:[]};
      for(const a of decision.actions){const before=structuredClone(s);const legal=getLegalActions(snapshot,role).find(x=>actionKey(x)===actionKey(a))!;applyAction(s,role,a);
        event(s,events,'ACTION',`${role} · ${legal.label}`,`${legal.explanation}。${legal.money_cost>0?`支付 ${legal.money_cost} 资金；`:''}${legal.direction}。[G]`,before,role,[a]);}
      if(!decision.actions.length)event(s,events,'ACTION',`${role} · 维持现状`,'未新增政策或投资；已有合同继续履行',undefined,role,[]);
    }
  }
}
export function settle(s:GameState,decisions:Decisions,random:{seed:number;research?:number[];shock?:number},events:Event[]):Flows {
  s.phase='S4_RESOLVE';const p=s.config.parameters;
  let rng=(random.seed+Math.imul(s.rng_state,1664525)+1013904223)>>>0,researchIndex=0;
  const due=s.pending_projects.filter(x=>x.due_turn<=s.turn);
  for(const project of due){
    const before=structuredClone(s),r=nextRandom(rng);rng=r.state;
    const sample=clamp(random.research?.[researchIndex++]??r.value,0,1);
    const complement=p.rd_complement_floor+p.rd_complement_weight*(project.owner.startsWith('CN')?Math.min(s.technology.cn_adaptation,s.technology.cn_process)/100:1);
    const gain=(project.expected_range[0]+sample*(project.expected_range[1]-project.expected_range[0]))*complement;
    if(project.target in s.technology){const k=project.target as keyof typeof s.technology;s.technology[k]=round(clamp(s.technology[k]+gain));}
    else if(project.target==='global_hbm'){s.capacity.global_hbm=round(s.capacity.global_hbm+p.hbm_gain);s.capacity.cn_hbm_access=round(s.capacity.cn_hbm_access+p.hbm_gain*p.cn_hbm_fraction);}
    else if(project.target==='tsmc_total'||project.target==='tsmc_overseas')s.capacity.tsmc_total=round(s.capacity.tsmc_total+p.capex_gain);
    else if(project.target==='ga_alt'||project.target==='ge_alt')s.materials[project.target==='ga_alt'?'ga':'ge'].non_cn_alt_capacity+=p.materials_alt_gain;
    else if(project.target==='nl_industry')s.finance.industry_profit.NL+=p.support_profit_gain;
    else if(project.target==='jp_industry')s.finance.industry_profit.JP+=p.support_profit_gain;
    event(s,events,'M3_RD_PIPELINE',`延迟项目兑现 · ${project.target}`,`${project.owner} 在此前支付 ${project.invest}，到期按配套条件与显式种子兑现；没有再次扣款。[G]`,before,project.owner);
  }
  s.pending_projects=s.pending_projects.filter(x=>x.due_turn>s.turn);
  event(s,events,'M3_RD_PIPELINE','研发与建设队列核对',`本轮到期 ${due.length} 项，仍待兑现 ${s.pending_projects.length} 项。所有新增项目已在行动时付现；政府拨款本身不直接提升技术。[G]`);
  const flows=calculateFlows(s,decisions);
  let before=structuredClone(s);
  const tradeProfit={US_AI:flows.us_ai_output*p.price_us_ai-p.us_fixed_cost,CN_DESIGN:flows.cn_domestic_ai_output*p.price_cn_design-p.design_fixed_cost,CN_FAB:flows.cn_domestic_ai_output*p.price_fab-p.fab_fixed_cost,TSMC:flows.tsmc_delivered*p.price_tsmc-p.tsmc_fixed_cost};
  for(const [role,raw]of Object.entries(tradeProfit) as [FirmId,number][]){const actual=round(Math.max(-s.finance.firm_cash[role],raw));s.finance.firm_profit[role]=actual;s.finance.firm_cash[role]=round(s.finance.firm_cash[role]+actual);}
  event(s,events,'M1_LEGAL_TRADE','合法芯片交付与企业损益',`美国许可等级 ${s.policy.us_chip} → 对华合法交付 ${flows.cn_legal_ai_import}；国产实际交付 ${flows.cn_domestic_ai_output}。利润进入现金账户一次；企业亏损以可用现金为限。[G]`,before);
  before=structuredClone(s);
  const maturedNL=due.some(x=>x.target==='nl_industry')?p.support_profit_gain:0,maturedJP=due.some(x=>x.target==='jp_industry')?p.support_profit_gain:0;
  s.finance.industry_profit.NL=round(p.nl_baseline_profit*licenseFactor(s,s.policy.nl_duv)+maturedNL);
  s.finance.industry_profit.JP=round(p.jp_baseline_profit*licenseFactor(s,s.policy.jp_tool)+maturedJP);
  s.technology.cn_tools_litho=round(s.technology.cn_tools_litho*p.equipment_retention);
  s.technology.cn_tools_other=round(s.technology.cn_tools_other*p.equipment_retention+s.technology.cn_local_tool_adaptation*p.local_tool_supply);
  event(s,events,'M2_TOOLS_FAB','设备存量与独立制造瓶颈',`新增采购分别受荷、美、日许可限制；存量仅按维护损耗变化。设计/制造/设备/封装/HBM交付上限分别为 ${Object.values(flows.bottlenecks).join(' / ')}，取最小值。[G]`,before);
  before=structuredClone(s);
  let revenue=0;
  for(const key of ['ga','ge'] as const){const m=s.materials[key],imports=flows[`${key}_imports`],consumed=flows[`${key}_consumed`];m.inventory=round(Math.max(0,m.inventory+imports+m.non_cn_alt_capacity-consumed));revenue+=imports*p[`${key}_export_price`];}
  s.finance.cn_material_export_revenue=round(revenue);
  event(s,events,'M4_MATERIALS','镓与锗：库存缓冲、定向成本',`镓用于化合物半导体相关部门，成本指数 ${flows.ga_sector_cost}；锗用于红外/光学相关部门，成本指数 ${flows.ge_sector_cost}。库存先缓冲，替代产能需付现建设；不直接扣除硅GPU产量。[G]`,before);
  before=structuredClone(s);
  const usOperability=clamp(s.policy.us_fab_license_scope-s.policy.us_tool+1,0,2);
  s.capacity.kr_china_fab_operability=clamp(s.capacity.kr_china_fab_operability+(usOperability-1)*p.kr_operability_step);
  s.finance.industry_profit.KR=round(Math.min(s.capacity.global_hbm,flows.us_ai_output+flows.cn_domestic_ai_output)*p.kr_hbm_margin+s.capacity.kr_china_fab_operability/100*p.kr_baseline_profit);
  const materialOpportunityLoss=Math.max(0,s.materials.ga.licensed_supply*p.ga_export_price+s.materials.ge.licensed_supply*p.ge_export_price-revenue);
  const pressures={US_GOV:flows.us_exporter_loss+(flows.ga_sector_cost+flows.ge_sector_cost-200)*p.material_pressure_factor,CN_GOV:Math.max(0,p.demand_cn-flows.cn_usable_ai)*p.pressure_cn_shortfall+materialOpportunityLoss*p.material_pressure_factor,NL_GOV:Math.max(0,p.nl_baseline_profit-s.finance.industry_profit.NL),JP_GOV:Math.max(0,p.jp_baseline_profit-s.finance.industry_profit.JP),KR_GOV:Math.max(0,p.kr_baseline_profit-s.finance.industry_profit.KR)};
  for(const [role,loss] of Object.entries(pressures) as [GovernmentId,number][])s.politics.domestic_pressure[role]=round(clamp(s.politics.domestic_pressure[role]*p.domestic_pressure_memory+loss*p.pressure_loss_factor));
  for(const role of AGENT_IDS.filter(x=>x.endsWith('_GOV')) as GovernmentId[])s.finance.government_budgets[role]=round(s.finance.government_budgets[role]+p.fiscal_replenishment);
  event(s,events,'M5_GOV_FIRM','企业损益 → 国内压力 → 下轮策略',`美国出口损失 ${flows.us_exporter_loss}、荷兰收益 ${s.finance.industry_profit.NL}、日本收益 ${s.finance.industry_profit.JP}、韩国存储收益 ${s.finance.industry_profit.KR} 进入各自政府压力；压力影响下一轮行动效用，不自动改写许可。政府按情景补充 ${p.fiscal_replenishment} 财政。[G]`,before);
  event(s,events,'M6_SUPPLY_ALLOCATION','有限代工与HBM配套清算',`台积电总产能 ${s.capacity.tsmc_total}，仅 ${(s.capacity.tsmc_flexible_share*100).toFixed(0)}% 可调整；承诺合同优先。合法交付 ${flows.tsmc_delivered}，美国AI交付 ${flows.us_ai_output}；国内封装和HBM分别设限。[G]`);
  const randomShock=nextRandom(rng);rng=randomShock.state;
  const shock=round((clamp(random.shock??randomShock.value,0,1)*2-1)*p.shock_amplitude);
  s.external_shocks.push({turn:s.turn,label:'架空产业景气信号 [G]',value:shock});
  // The small public signal changes expectations only; it does not create production or cash.
  for(const role of AGENT_IDS)s.private.private_estimates[role].industry_signal=shock;
  s.rng_state=rng;
  flows.nl_litho_profit=s.finance.industry_profit.NL;flows.jp_tool_profit=s.finance.industry_profit.JP;flows.kr_memory_profit=s.finance.industry_profit.KR;
  return flows;
}
