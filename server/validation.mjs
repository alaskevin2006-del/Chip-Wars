/** Wire validation is deliberately independent of the economic engine. */
const AGENTS = ['US_GOV','CN_GOV','NL_GOV','JP_GOV','KR_GOV','US_AI','CN_DESIGN','CN_FAB','TSMC'];
const PHASES = ['S0_BRIEFING','S1_MAJOR_GOV','S2_THIRD_GOV','S3_FIRMS','S4_RESOLVE','S5_REPORT'];
const TEMPLATES = {
  US_GOV:['US_CHIP_LICENSE','US_TOOL_LICENSE','US_DIPLOMACY','US_SUPPORT'],
  CN_GOV:['CN_MATERIAL_LICENSE','CN_SUBSIDY','CN_INDUSTRY_COORD','CN_OFFER'],
  NL_GOV:['NL_DUV_LICENSE','NL_SUPPORT','NL_COORD'], JP_GOV:['JP_TOOL_LICENSE','JP_SUPPORT'],
  KR_GOV:['KR_STORAGE_SUPPORT','KR_FAB_DIPLOMACY'], US_AI:['US_AI_MARKET','US_AI_RD','US_AI_LOBBY'],
  CN_DESIGN:['CN_DESIGN_RD','CN_DESIGN_COORD'], CN_FAB:['CN_FAB_INVEST','CN_FAB_ORDER'], TSMC:['TSMC_ALLOCATE','TSMC_CAPEX'],
};
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const bounded = (value, max = 1000) => typeof value === 'string' && value.length <= max;
const only = (value, names) => Object.keys(value).every(key => names.includes(key));
const numericRecord = (value, names, nonnegative = false) => plain(value) && only(value,names)
  && names.every(key => finite(value[key]) && (!nonnegative || value[key] >= 0));
const GOV = AGENTS.filter(role => role.endsWith('_GOV'));
const FIRMS = AGENTS.filter(role => !role.endsWith('_GOV'));
function publicShape(state) {
  const p=state.policy,t=state.technology,c=state.capacity,f=state.finance,politics=state.politics,i=state.indicators;
  if (!plain(p) || !only(p,['us_chip','us_tool','nl_duv','jp_tool','cn_ga','cn_ge','tw_compliance_mask','us_fab_license_scope'])
      || !['us_chip','us_tool','nl_duv','jp_tool','cn_ga','cn_ge'].every(key => Number.isInteger(p[key]) && p[key]>=0 && p[key]<=2)
      || !finite(p.us_fab_license_scope) || !plain(p.tw_compliance_mask) || !Object.values(p.tw_compliance_mask).every(value => typeof value==='boolean')
      || !numericRecord(t,['cn_design','cn_process','cn_yield','cn_packaging','cn_tools_litho','cn_tools_other','cn_local_tool_adaptation','cn_adaptation','us_ai_frontier'],true)
      || !numericRecord(c,['tsmc_total','tsmc_flexible_share','tsmc_us_ai_allocation','global_hbm','cn_hbm_access','kr_china_fab_operability'],true)
      || !plain(state.materials) || !only(state.materials,['ga','ge'])
      || !['ga','ge'].every(material => numericRecord(state.materials[material],['inventory','licensed_supply','non_cn_alt_capacity','affected_sector_demand'],true))
      || !plain(f) || !only(f,['government_budgets','firm_profit','industry_profit','cn_material_export_revenue'])
      || !numericRecord(f.government_budgets,GOV,true) || !numericRecord(f.firm_profit,FIRMS)
      || !numericRecord(f.industry_profit,['NL','JP','KR']) || !finite(f.cn_material_export_revenue)
      || !plain(politics) || !only(politics,['alignment','domestic_pressure','offers'])
      || !numericRecord(politics.alignment,['US_NL','US_JP','US_KR']) || !numericRecord(politics.domestic_pressure,GOV)
      || !Array.isArray(politics.offers) || politics.offers.length>24
      || !politics.offers.every(offer => plain(offer) && only(offer,['id','from','to','turn','status']) && bounded(offer.id,100)
        && ['CN_GOV','US_GOV'].includes(offer.from) && ['CN_GOV','US_GOV'].includes(offer.to) && Number.isInteger(offer.turn)
        && ['pending','accepted','rejected'].includes(offer.status))
      || !plain(i) || !only(i,['cn_legal_ai_import','cn_domestic_ai_output','cn_usable_ai','us_ai_output','ga_sector_cost','ge_sector_cost','us_exporter_loss','nl_litho_profit','jp_tool_profit','kr_memory_profit','supply_chain_risk','dependency_index','bottlenecks','player_score'])
      || !['cn_legal_ai_import','cn_domestic_ai_output','cn_usable_ai','us_ai_output','ga_sector_cost','ge_sector_cost','us_exporter_loss','nl_litho_profit','jp_tool_profit','kr_memory_profit','supply_chain_risk','dependency_index'].every(key=>finite(i[key]))
      || !numericRecord(i.bottlenecks,['design','manufacturing','equipment','packaging','hbm'],true)
      || !plain(i.player_score) || !only(i.player_score,['dimensions','total','label','explanation','longTermPotential'])
      || !numericRecord(i.player_score.dimensions,['technology','economy','diplomacy','fiscal']) || !finite(i.player_score.total)
      || !finite(i.player_score.longTermPotential) || !bounded(i.player_score.label,200) || !bounded(i.player_score.explanation,2000)
      || !Array.isArray(state.pending_projects) || state.pending_projects.length>64
      || !state.pending_projects.every(project => plain(project) && only(project,['id','owner','target','invest','due_turn','expected_range'])
        && bounded(project.id,100) && AGENTS.includes(project.owner) && bounded(project.target,100) && finite(project.invest) && project.invest>=0
        && Number.isInteger(project.due_turn) && Array.isArray(project.expected_range) && project.expected_range.length===2 && project.expected_range.every(finite))) return false;
  return true;
}
const noSecretFields = (value, depth = 0) => {
  if (depth > 12) return false;
  if (!value || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.length <= 256 && value.every(item => noSecretFields(item, depth + 1));
  const entries = Object.entries(value);
  return entries.length <= 128 && entries.every(([key, item]) =>
    !['__proto__','constructor','prototype','apiKey','api_key','DEEPSEEK_API_KEY','firm_cash','private','config','decisions'].includes(key)
    && noSecretFields(item, depth + 1));
};
export const actionKey = action => `${action.id}|${action.target ?? ''}|${action.level ?? ''}`;
const isAction = value => plain(value) && only(value, ['id','target','level']) && bounded(value.id, 40)
  && (value.target === undefined || bounded(value.target, 80))
  && (value.level === undefined || (Number.isInteger(value.level) && value.level >= 0 && value.level <= 2));

function legalShape(value, role, turn) {
  return plain(value) && only(value, ['id','target','level','actor','label','ap_cost','money_cost','preconditions','effective_at','duration','explanation','direction','risk'])
    && value.actor === role && (value.id === 'HOLD' || TEMPLATES[role].includes(value.id))
    && isAction({id:value.id,...(value.target === undefined ? {} : {target:value.target}),...(value.level === undefined ? {} : {level:value.level})})
    && finite(value.ap_cost) && value.ap_cost >= 0 && value.ap_cost <= 2
    && finite(value.money_cost) && value.money_cost >= 0 && value.money_cost <= 10000
    && (value.id !== 'HOLD' || (value.ap_cost === 0 && value.money_cost === 0))
    && bounded(value.label, 160) && bounded(value.explanation, 1000) && bounded(value.direction, 600) && bounded(value.risk, 600)
    && Array.isArray(value.preconditions) && value.preconditions.length <= 12 && value.preconditions.every(item => bounded(item, 300))
    && Number.isInteger(value.effective_at) && value.effective_at >= turn && value.effective_at <= turn + 12
    && Number.isInteger(value.duration) && value.duration >= 0 && value.duration <= 12;
}

/** Only the supplied role's observation is accepted; engine-owned state is never accepted. */
export function validateRequest(value) {
  if (!plain(value) || !only(value, ['observation','legalActions'])) return null;
  const obs = value.observation;
  if (!plain(obs) || !only(obs,['roleId','turn','phase','publicState','privateState','history','legalActions'])
      || !AGENTS.includes(obs.roleId) || !Number.isInteger(obs.turn) || obs.turn < 1 || obs.turn > 6
      || !PHASES.includes(obs.phase) || !plain(obs.publicState) || !plain(obs.privateState)
      || !Array.isArray(obs.history) || obs.history.length > 256 || !noSecretFields(obs.publicState)
      || !only(obs.publicState,['policy','technology','capacity','materials','finance','politics','indicators','pending_projects'])
      || !['policy','technology','capacity','materials','finance','politics','indicators','pending_projects'].every(key => key in obs.publicState)
      || !only(obs.privateState,['weights','strategy_type','estimates','cash','ap']) || !publicShape(obs.publicState)) return null;
  const own = obs.privateState;
  if (!plain(own.weights) || !only(own.weights,['security','industry','fiscal','diplomacy'])
      || !['security','industry','fiscal','diplomacy'].every(key => finite(own.weights[key]) && own.weights[key] >= 0 && own.weights[key] <= 1)
      || !bounded(own.strategy_type,80) || !plain(own.estimates) || Object.keys(own.estimates).length > 32
      || !Object.values(own.estimates).every(finite) || !finite(own.cash) || own.cash < 0
      || !Number.isInteger(own.ap) || own.ap < 0 || own.ap > (['US_GOV','CN_GOV'].includes(obs.roleId) ? 2 : 1)) return null;
  const legal = value.legalActions;
  if (!Array.isArray(legal) || legal.length === 0 || legal.length > 80 || !Array.isArray(obs.legalActions)
      || !legal.every(item => legalShape(item,obs.roleId,obs.turn))
      || JSON.stringify(legal) !== JSON.stringify(obs.legalActions)
      || new Set(legal.map(actionKey)).size !== legal.length || !noSecretFields(obs.history)) return null;
  // Keep the model context small and remove unneeded descriptions from old history.
  const history = obs.history.slice(-18).map(event => ({
    turn:event.turn, actor:event.actor, mechanism:event.mechanism,
    title:bounded(event.title,160) ? event.title : '',
    description:bounded(event.description,1200) ? event.description : '',
    deltas:Array.isArray(event.deltas) ? event.deltas.slice(0,12) : [],
  }));
  return { observation:{...obs,history}, legalActions:legal };
}

/** Choices, aggregate resources and duplicate policies are checked again server-side. */
export function validateModelDecision(value, request) {
  if (!plain(value) || !only(value,['actions','rationale','source']) || !Array.isArray(value.actions) || value.actions.length > 2
      || (value.rationale !== undefined && !bounded(value.rationale,800))) return null;
  const seen = new Set(); let ap = 0; let money = 0;
  for (const action of value.actions) {
    if (!isAction(action)) return null;
    const legal = request.legalActions.find(candidate => actionKey(candidate) === actionKey(action));
    if (!legal) return null;
    const key = action.id === 'CN_MATERIAL_LICENSE' ? `${action.id}:${action.target}` : action.id;
    if (seen.has(key)) return null;
    seen.add(key); ap += legal.ap_cost; money += legal.money_cost;
  }
  if ((seen.has('HOLD') && seen.size > 1) || ap > request.observation.privateState.ap || money > request.observation.privateState.cash) return null;
  return {actions:value.actions.map(({id,target,level}) => ({id,...(target === undefined ? {} : {target}),...(level === undefined ? {} : {level})})), rationale:value.rationale ?? '依据当前可见局势选择合法行动。', source:'llm'};
}
