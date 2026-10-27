import type {Action,ActionId,AgentDecision,AgentId,GameState,GovernmentId,LegalAction,ValidationResult} from './types';

export const actionKey=(a:Action):string=>`${a.id}:${a.target??''}:${a.level??''}`;
export function availableCash(s:GameState,role:AgentId):number {
  return role.endsWith('_GOV') ? s.finance.government_budgets[role as GovernmentId] : s.finance.firm_cash[role as keyof typeof s.finance.firm_cash];
}
export function getLegalActions(s:GameState,role:AgentId):LegalAction[] {
  if(s.finished) return [];
  const out:LegalAction[]=[];
  const add=(id:ActionId,label:string,target?:string,level?:number,explanation='依照当前许可与实际产业瓶颈结算',direction='改善本方产业收益',risk='可能增加财政或商业成本')=>{
    const delay=s.config.delays[id];
    const late=delay>0&&s.turn+delay>s.config.maxTurns;
    out.push({id,actor:role,label,target,level,ap_cost:id==='HOLD'?0:1,money_cost:s.config.costs[id],preconditions:['不越权','AP与资金充足','遵守适用许可'],effective_at:s.turn+delay,duration:id==='NL_SUPPORT'||id==='JP_SUPPORT'?1:delay>0?Math.max(1,s.config.maxTurns-s.turn-delay+1):1,explanation:explanation+(late?'；本局来不及兑现，仅计长期潜力':''),direction,risk:late?'仅计入折现长期潜力，不计当期产量':risk});
  };
  const license=(id:ActionId,key:keyof GameState['policy'],label:string,target?:string)=>{
    const old=s.policy[key] as number;
    for(const level of [old-1,old+1]) if(level>=0&&level<=2) add(id,`${level>old?'收紧':'放宽'}${label}`,target,level,'只改变下一步合法新增供给，不删除已有设备',level>old?'限制新增交付，增强管制姿态':'增加合法交易空间，缓和商业损失','安全目标与企业收益存在取舍');
  };
  switch(role){
    case 'US_GOV':
      license('US_CHIP_LICENSE','us_chip','芯片许可'); license('US_TOOL_LICENSE','us_tool','美源设备许可');
      for(const target of ['NL_GOV','JP_GOV','KR_GOV']) add('US_DIPLOMACY',`协调${{NL_GOV:'荷兰',JP_GOV:'日本',KR_GOV:'韩国'}[target]}`,target,undefined,'提高协调收益，不能替盟友改变许可','提升关系与协调收益');
      add('US_SUPPORT','支持本土研发','rd',undefined,'预算转入美国AI企业现金；企业自行投资','企业现金增加，技术不直接增加');
      add('US_SUPPORT','投资镓锗替代','materials',undefined,'支出进入独立镓、锗替代建设队列','延迟提高国外材料供给'); break;
    case 'CN_GOV':
      license('CN_MATERIAL_LICENSE','cn_ga','镓许可','ga');license('CN_MATERIAL_LICENSE','cn_ge','锗许可','ge');
      for(const target of ['design','manufacturing','packaging']) add('CN_SUBSIDY',`补贴${{design:'设计企业',manufacturing:'制造企业',packaging:'封装协作'}[target]}`,target,undefined,'政府预算等额转至企业现金，企业仍须自行投资','企业现金增加，技术不直接增加');
      add('CN_INDUSTRY_COORD','国产供应链协作',undefined,undefined,'降低制造适配摩擦，不增加设计能力','改善制造适配'); break;
    case 'NL_GOV':
      license('NL_DUV_LICENSE','nl_duv','DUV许可');add('NL_SUPPORT','支持光刻产业',undefined,undefined,'延迟改善一期光刻产业经营收益');
      for(const target of ['alignment','autonomy']) add('NL_COORD',target==='alignment'?'对美协调':'强调监管自主',target,undefined,'仅影响协调关系，不直接更改设备许可');break;
    case 'JP_GOV':
      license('JP_TOOL_LICENSE','jp_tool','日本设备许可');add('JP_SUPPORT','支持日本设备产业',undefined,undefined,'延迟改善一期日本设备行业收益，不豁免管制');break;
    case 'KR_GOV':
      add('KR_STORAGE_SUPPORT','支持HBM产业',undefined,undefined,'延迟增加HBM供应，与中国封装能力分开计算');add('KR_FAB_DIPLOMACY','争取在华工厂经营空间',undefined,undefined,'对美协调信号，无法改写美国许可证');break;
    case 'US_AI':
      add('US_AI_MARKET','扩大合法对华订单','china',undefined,'仍受美国芯片许可、第三方代工和全球HBM上限约束');add('US_AI_MARKET','转向其他市场','other');
      add('US_AI_RD','先进设计研发',undefined,undefined,'付现并延迟提升技术前沿，不产生制造产能');add('US_AI_LOBBY','向本国政府游说',undefined,undefined,'现金支出产生国内压力，不强制政府政策');break;
    case 'CN_DESIGN':
      add('CN_DESIGN_RD','国产芯片设计研发',undefined,undefined,'付现并延迟改善设计；不消除制造、封装或HBM瓶颈');
      add('CN_DESIGN_COORD','制造适配协作','adaptation');add('CN_DESIGN_COORD','先进封装协作','packaging',undefined,'付现并延迟改善封装，不制造HBM');break;
    case 'CN_FAB':
      for(const target of ['process','yield','tools']) add('CN_FAB_INVEST',`投资${{process:'工艺',yield:'良率',tools:'国产设备适配'}[target]}`,target);
      if(s.policy.nl_duv<2) add('CN_FAB_ORDER','采购合法DUV设备','litho');
      if(s.policy.us_tool<2) add('CN_FAB_ORDER','采购合法美源设备','us_tools');
      if(s.policy.jp_tool<2) add('CN_FAB_ORDER','采购合法日本设备','jp_tools');
      add('CN_FAB_ORDER','优化制造产能配置','allocation',undefined,'付现改善制造适配，不产生额外晶圆或HBM');break;
    case 'TSMC':
      for(const target of ['US_AI','OTHER']) if(s.policy.tw_compliance_mask[target]) add('TSMC_ALLOCATE',`灵活产能转向${target==='US_AI'?'美国AI客户':'其他合法客户'}`,target,undefined,'仅调整有限灵活产能，不改变承诺合同，不绕过适用合规');
      for(const target of ['advanced','overseas']) add('TSMC_CAPEX',target==='advanced'?'扩建先进产能':'投资海外布局',target,undefined,'付现延迟扩产，保持客户与适用合规限制');break;
  }
  add('HOLD','维持现状',undefined,undefined,'日常经营和已有合同仍正常结算','保留行动点和资金','产业瓶颈可能持续');
  return out.filter(a=>a.money_cost<=availableCash(s,role));
}
export function validateDecision(s:GameState,role:AgentId,d:AgentDecision):ValidationResult {
  const errors:string[]=[];let apUsed=0,moneyUsed=0;
  if(!d||!Array.isArray(d.actions))return {valid:false,errors:['行动必须为数组'],apUsed:0,moneyUsed:0};
  if(s.finished) errors.push('对局已结束');
  if(d.actions.length>0&&d.actions.some(a=>a.id==='HOLD')&&d.actions.length>1) errors.push('维持现状不能与其他行动并用');
  const legal=getLegalActions(s,role),seen=new Set<string>();
  for(const a of d.actions){
    if(!a||typeof a.id!=='string'){ errors.push('未知行动');continue; }
    const found=legal.find(l=>actionKey(l)===actionKey(a));
    if(!found){errors.push(`行动不合法或资金不足：${a.id}`);continue;}
    const duplicate=a.id==='CN_MATERIAL_LICENSE'?`${a.id}:${a.target}`:a.id;
    if(seen.has(duplicate))errors.push('同一模板或政策不能重复执行');seen.add(duplicate);
    apUsed+=found.ap_cost;moneyUsed+=found.money_cost;
  }
  if(apUsed>s.config.ap[role])errors.push('行动点不足');
  if(moneyUsed>availableCash(s,role))errors.push('总预算或现金不足');
  return {valid:errors.length===0,errors,apUsed,moneyUsed};
}
