import { ArrowDownRight, ArrowUpRight, Cpu, Info, ShieldCheck } from 'lucide-react';
import type { Action, ActionId, AgentId, StateDelta } from '../engine/types';
import { roleNames } from './adapter';

export const number = (value: number) => Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '—';
export const shortRole = (role: AgentId) => roleNames[role];
export const policyNames = ['相对宽松', '逐项审核', '严格限制'];
const actionNames: Record<ActionId,string> = { HOLD:'维持现状', US_CHIP_LICENSE:'调整芯片出口许可', US_TOOL_LICENSE:'调整美源设备许可', US_DIPLOMACY:'盟友政策协调', US_SUPPORT:'本土产业支持', CN_MATERIAL_LICENSE:'调整材料出口许可', CN_SUBSIDY:'产业补贴', CN_INDUSTRY_COORD:'国产供应链协作', CN_OFFER:'缓和邀约', NL_DUV_LICENSE:'调整 DUV 许可', NL_SUPPORT:'光刻产业支持', NL_COORD:'监管与政策协调', JP_TOOL_LICENSE:'调整日本设备许可', JP_SUPPORT:'设备产业支持', KR_STORAGE_SUPPORT:'存储与 HBM 支持', KR_FAB_DIPLOMACY:'在华经营许可协调', US_AI_MARKET:'调整合法市场订单', US_AI_RD:'技术研发', US_AI_LOBBY:'产业政策游说', CN_DESIGN_RD:'设计能力研发', CN_DESIGN_COORD:'制造与封装协作', CN_FAB_INVEST:'制造能力投资', CN_FAB_ORDER:'合规设备采购与产能配置', TSMC_ALLOCATE:'分配灵活代工产能', TSMC_CAPEX:'先进产能投资' };
const targetNames: Record<string,string> = { ga:'镓', ge:'锗', design:'设计', fab:'制造', packaging:'封装', research:'研发', materials:'材料替代', rd:'研发', adaptation:'工艺适配', process:'工艺', yield:'良率', tools:'设备适配', domestic:'国产', china:'中国市场', other:'其他市场', overseas:'海外布局', advanced:'先进产能', US_AI:'美国 AI 企业', CN_DESIGN:'中国设计企业', CN_FAB:'中国制造企业', NL_GOV:'荷兰', JP_GOV:'日本', KR_GOV:'韩国' };
export const actionName = (action: Action) => `${actionNames[action.id]}${action.target ? ` · ${targetNames[action.target] ?? deltaName(action.target)}` : ''}${action.level === undefined ? '' : ` → ${policyNames[action.level] ?? action.level}`}`;
const fields: Record<string, string> = {
  cn_design: '中国设计能力', cn_process: '中国制造工艺', cn_yield: '制造良率', cn_packaging: '先进封装',
  cn_tools_litho: '现存光刻设备', cn_tools_other: '其他制造设备', cn_adaptation: '国产适配',
  cn_local_tool_adaptation: '国产设备适配', us_ai_frontier: '美国技术前沿', us_chip: '美国芯片许可', us_tool: '美源设备许可',
  nl_duv: '荷兰 DUV 许可', jp_tool: '日本设备许可', cn_ga: '镓出口许可', cn_ge: '锗出口许可',
  tsmc_total: '代工总产能', tsmc_us_ai_allocation: '美国企业灵活产能分配', global_hbm: '全球 HBM 供给',
  cn_hbm_access: '中国 HBM 可及供给', kr_china_fab_operability: '韩企在华经营', cn_material_export_revenue: '中国材料出口收入',
  inventory: '材料期末库存', licensed_supply: '材料合法供给', non_cn_alt_capacity: '境外替代产能',
  affected_sector_demand: '相关部门需求', US_NL: '美荷协调', US_JP: '美日协调', US_KR: '美韩协调',
  cn_legal_ai_import: '合法芯片进口', cn_domestic_ai_output: '国产有效交付', cn_usable_ai: '可用算力', us_ai_output: '美国 AI 交付',
};
export function deltaName(path: string) {
  const keys = path.split('.');
  const last = keys.at(-1)!;
  if (last in roleNames) {
    const account = path.includes('budget') ? '预算' : path.includes('pressure') ? '国内压力' : path.includes('profit') ? '利润' : '现金';
    return `${roleNames[last as AgentId]} · ${account}`;
  }
  return `${path.includes('.ga.') ? '镓 · ' : path.includes('.ge.') ? '锗 · ' : ''}${fields[last] ?? targetNames[last] ?? last.replaceAll('_', ' ')}`;
}
export function Delta({ delta }: { delta: StateDelta }) {
  const diff = delta.after - delta.before;
  return <div className="delta"><span>{deltaName(delta.path)}</span><span className="numeric">{number(delta.before)}<span className="delta-arrow">→</span>{number(delta.after)}</span><b className={diff >= 0 ? 'mint' : 'amber'}>{diff > 0 ? '+' : ''}{number(diff)}</b></div>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}><span className="brand-icon"><Cpu size={23}/></span><span><b>CHIP<span>WARS</span></b><small>芯片博弈 / STRATEGY LAB</small></span></div>;
}
export function Disclaimer({ full = false }: { full?: boolean }) {
  return <div className="disclaimer"><Info size={14}/><span>{full ? '架空近未来策略游戏。所有数值、利益权重与动态系数均为游戏设定 [G]；产业机制用于互动探索，不构成现实预测或政策建议。' : '虚构情景 · 所有数值为游戏指数 [G]'}</span></div>;
}
export function Metric({ label, value, unit = '指数', previous, subtitle, tone = '' }: { label: string; value: number; unit?: string; previous?: number; subtitle: string; tone?: string }) {
  const diff = previous === undefined ? undefined : value - previous;
  return <section className={`metric ${tone}`}><span className="eyebrow">{label}</span><div className="metric-value">{number(value)}<small>{unit}</small></div><div className="metric-foot">{diff === undefined ? <span>首轮基线 · 暂无趋势</span> : <span className={diff >= 0 ? 'mint' : 'amber'}>{diff >= 0 ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}{diff > 0 ? '+' : ''}{number(diff)} 较上轮</span>}<small>{subtitle}</small></div></section>;
}
export function ModeBadge({ mode }: { mode: 'rule' | 'llm' | 'mock' }) {
  return <span className={`mode-badge ${mode === 'mock' ? 'mock' : ''}`}><ShieldCheck size={13}/>{mode === 'llm' ? '智能对手 + 规则校验' : mode === 'mock' ? '界面预览' : '本地规则引擎'}</span>;
}
