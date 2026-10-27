import type { AgentObservation, LegalAction, PlayerRole, Score, TurnRecord } from '../engine/types';
import type { GameAdapter, GameSnapshot } from './adapter';

const score: Score = { dimensions: { technology: 42, economy: 61, diplomacy: 53, fiscal: 72 }, total: 57, label: '供应链的选择', explanation: '样例结局，仅供独立界面预览；实际游戏评分由引擎生成。', longTermPotential: 0 };
function action(actor: PlayerRole, id: LegalAction['id'], label: string, target?: string, level?: number, cost = 0, delay = 0): LegalAction {
  return { actor, id, label, target, level, money_cost: cost, ap_cost: id === 'HOLD' ? 0 : 1, effective_at: 1 + delay, duration: 1, preconditions: ['符合现行许可边界'], explanation: id.includes('SUBSIDY') ? '财政资金转入企业账户，由企业独立安排后续研发与生产。' : id.includes('LICENSE') ? '调整一级许可边界，影响新增合法供给与相关产业收益。' : '支持产业能力与协作，通过后续市场和投资形成反馈。', direction: id.includes('SUBSIDY') ? '企业现金增加 · 财政预算减少' : id.includes('LICENSE') ? '改变合法贸易边界' : '产业韧性改善', risk: '产业损益可能带来国内压力；效果受其他环节限制。' };
}
export function mockObservation(role: PlayerRole, turn = 1): AgentObservation {
  const legalActions = role === 'CN_GOV' ? [
    action(role, 'CN_MATERIAL_LICENSE', '收紧镓出口许可', 'ga', 2), action(role, 'CN_MATERIAL_LICENSE', '放宽镓出口许可', 'ga', 0),
    action(role, 'CN_MATERIAL_LICENSE', '收紧锗出口许可', 'ge', 2),
    action(role, 'CN_SUBSIDY', '支持芯片设计', 'design', undefined, 15), action(role, 'CN_SUBSIDY', '支持晶圆制造', 'fab', undefined, 15),
    action(role, 'CN_SUBSIDY', '支持先进封装', 'packaging', undefined, 15), action(role, 'CN_INDUSTRY_COORD', '国产供应链协作', undefined, undefined, 8),
    action(role, 'HOLD', '维持现状'),
  ] : [
    action(role, 'US_CHIP_LICENSE', '收紧芯片出口许可', undefined, 2), action(role, 'US_CHIP_LICENSE', '放宽芯片出口许可', undefined, 0),
    action(role, 'US_TOOL_LICENSE', '收紧美源设备许可', undefined, 2), action(role, 'US_TOOL_LICENSE', '放宽美源设备许可', undefined, 0),
    action(role, 'US_DIPLOMACY', '与荷兰协调', 'NL_GOV', undefined, 4), action(role, 'US_DIPLOMACY', '与日本协调', 'JP_GOV', undefined, 4),
    action(role, 'US_SUPPORT', '支持本土研发', 'research', undefined, 15, 2), action(role, 'US_SUPPORT', '投资材料替代', 'materials', undefined, 15, 2), action(role, 'HOLD', '维持现状'),
  ];
  return {
    roleId: role, turn, phase: 'S0_BRIEFING',
    privateState: { weights: { security: .3, industry: .35, fiscal: .2, diplomacy: .15 }, strategy_type: 'balanced', estimates: {}, cash: 100, ap: 2 }, history: [], legalActions,
    publicState: {
      policy: { us_chip: 1, us_tool: 1, nl_duv: 1, jp_tool: 1, cn_ga: 1, cn_ge: 1, us_fab_license_scope: 1, tw_compliance_mask: { US_AI: true, CN_DESIGN: false } },
      technology: { cn_design: 48, cn_process: 42, cn_yield: 58, cn_packaging: 40, cn_tools_litho: 46, cn_tools_other: 51, cn_local_tool_adaptation: 30, cn_adaptation: 50, us_ai_frontier: 86 },
      capacity: { tsmc_total: 100, tsmc_flexible_share: .2, tsmc_us_ai_allocation: .6, global_hbm: 85, cn_hbm_access: 28, kr_china_fab_operability: 70 },
      materials: { ga: { inventory: 24, licensed_supply: 20, non_cn_alt_capacity: 8, affected_sector_demand: 30 }, ge: { inventory: 18, licensed_supply: 15, non_cn_alt_capacity: 6, affected_sector_demand: 24 } },
      finance: { government_budgets: { CN_GOV: 100, US_GOV: 110, NL_GOV: 60, JP_GOV: 65, KR_GOV: 70 }, firm_profit: { US_AI: 18, CN_DESIGN: 7, CN_FAB: 9, TSMC: 24 }, industry_profit: { NL: 12, JP: 10, KR: 16 }, cn_material_export_revenue: 12 },
      politics: { alignment: { US_NL: 60, US_JP: 68, US_KR: 56 }, domestic_pressure: { US_GOV: 24, CN_GOV: 31, NL_GOV: 28, JP_GOV: 22, KR_GOV: 35 }, offers: [] }, pending_projects: [],
      indicators: { cn_legal_ai_import: 16, cn_domestic_ai_output: 24, cn_usable_ai: 40, us_ai_output: 62, ga_sector_cost: 1.1, ge_sector_cost: 1.05, us_exporter_loss: 8, nl_litho_profit: 12, jp_tool_profit: 10, kr_memory_profit: 16, supply_chain_risk: 44, dependency_index: 40, bottlenecks: { design: 48, manufacturing: 32, equipment: 38, packaging: 29, hbm: 24 }, player_score: score },
    },
  };
}

/** Static fixture presentation only. Never simulates economics or imports engine state. */
export function createMockAdapter(): GameAdapter {
  let role: PlayerRole = 'CN_GOV';
  let records: TurnRecord[] = [];
  const snapshot = (): GameSnapshot => ({ observation: mockObservation(role, Math.min(records.length + 1, 6)), records, finished: records.length === 6, mode: 'mock', notice: '界面预览模式：样例指标保持不变。正式对局使用规则引擎结算。' });
  return {
    start(nextRole) { role = nextRole; records = []; return snapshot(); },
    async play(actions) {
      const observation = mockObservation(role, records.length + 1);
      records = [...records, { turn: records.length + 1, decisions: { [role]: { actions, source: 'player' } }, indicators: observation.publicState.indicators, events: [{ id: `mock-${records.length}`, turn: records.length + 1, phase: 'S5_REPORT', actor: role, mechanism: 'PHASE', title: '样例决策已记录', description: '这是界面预览数据，不进行经济结算。集成版本将展示引擎返回的真实因果与状态差值。', actions, deltas: [] }] }];
      return snapshot();
    },
  };
}
