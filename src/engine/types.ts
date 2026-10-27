/** Frozen shared contract. All numeric coefficients are game assumptions [G]. */
export const AGENT_IDS = ['US_GOV','CN_GOV','NL_GOV','JP_GOV','KR_GOV','US_AI','CN_DESIGN','CN_FAB','TSMC'] as const;
export type AgentId = typeof AGENT_IDS[number];
export type GovernmentId = Extract<AgentId, `${string}_GOV`>;
export type FirmId = Exclude<AgentId, GovernmentId>;
export type PlayerRole = 'CN_GOV' | 'US_GOV';
export type Phase = 'S0_BRIEFING' | 'S1_MAJOR_GOV' | 'S2_THIRD_GOV' | 'S3_FIRMS' | 'S4_RESOLVE' | 'S5_REPORT';
export const ACTION_IDS = ['US_CHIP_LICENSE','US_TOOL_LICENSE','US_DIPLOMACY','US_SUPPORT','CN_MATERIAL_LICENSE','CN_SUBSIDY','CN_INDUSTRY_COORD','CN_OFFER','NL_DUV_LICENSE','NL_SUPPORT','NL_COORD','JP_TOOL_LICENSE','JP_SUPPORT','KR_STORAGE_SUPPORT','KR_FAB_DIPLOMACY','US_AI_MARKET','US_AI_RD','US_AI_LOBBY','CN_DESIGN_RD','CN_DESIGN_COORD','CN_FAB_INVEST','CN_FAB_ORDER','TSMC_ALLOCATE','TSMC_CAPEX','HOLD'] as const;
export type ActionId = typeof ACTION_IDS[number];
export interface Action { id: ActionId; target?: string; level?: number }
export interface LegalAction extends Action {
  actor: AgentId; label: string; ap_cost: number; money_cost: number;
  preconditions: string[]; effective_at: number; duration: number;
  explanation: string; direction: string; risk: string;
}
export interface AgentDecision { actions: Action[]; rationale?: string; source?: 'rule'|'llm'|'player'|'fallback' }
export type Decisions = Partial<Record<AgentId, AgentDecision>>;
export interface ValidationResult { valid: boolean; errors: string[]; apUsed: number; moneyUsed: number }
export type Mechanism = 'ACTION' | 'M1_LEGAL_TRADE' | 'M2_TOOLS_FAB' | 'M3_RD_PIPELINE' | 'M4_MATERIALS' | 'M5_GOV_FIRM' | 'M6_SUPPLY_ALLOCATION' | 'PHASE';
export interface StateDelta { path: string; before: number; after: number }
export interface Event {
  id: string; turn: number; phase: Phase; actor?: AgentId;
  mechanism: Mechanism; title: string; description: string;
  actions: Action[]; deltas: StateDelta[];
}
export interface Project { id: string; owner: AgentId; target: string; invest: number; due_turn: number; expected_range: [number,number] }
export interface Offer { id: string; from: PlayerRole; to: PlayerRole; turn: number; status: 'pending'|'accepted'|'rejected' }
export interface MaterialState { inventory: number; licensed_supply: number; non_cn_alt_capacity: number; affected_sector_demand: number }
export interface Policy {
  us_chip: number; us_tool: number; nl_duv: number; jp_tool: number; cn_ga: number; cn_ge: number;
  tw_compliance_mask: Record<string, boolean>; us_fab_license_scope: number;
}
export interface Technology {
  cn_design: number; cn_process: number; cn_yield: number; cn_packaging: number;
  cn_tools_litho: number; cn_tools_other: number; cn_local_tool_adaptation: number;
  cn_adaptation: number; us_ai_frontier: number;
}
export interface Capacity {
  tsmc_total: number; tsmc_flexible_share: number; tsmc_us_ai_allocation: number;
  global_hbm: number; cn_hbm_access: number; kr_china_fab_operability: number;
}
export interface Finance {
  government_budgets: Record<GovernmentId,number>; firm_cash: Record<FirmId,number>;
  firm_profit: Record<FirmId,number>; industry_profit: Record<'NL'|'JP'|'KR',number>;
  cn_material_export_revenue: number;
}
export interface Politics { alignment: Record<'US_NL'|'US_JP'|'US_KR',number>; domestic_pressure: Record<GovernmentId,number>; offers: Offer[] }
export interface Preference { security: number; industry: number; fiscal: number; diplomacy: number }
export interface PrivateInfo { weights: Record<AgentId,Preference>; strategy_type: Record<AgentId,string>; private_estimates: Record<AgentId,Record<string,number>> }
export interface WorldState { policy: Policy; technology: Technology; capacity: Capacity; materials: Record<'ga'|'ge',MaterialState>; finance: Finance; politics: Politics }
export interface GameConfig {
  version: '3.0'; maxTurns: number; assumptionLabel: '[G]';
  initial: WorldState; ap: Record<AgentId,number>;
  costs: Record<ActionId,number>; delays: Record<ActionId,number>;
  parameters: Record<string,number>; preferences: Record<AgentId,Preference>;
}
export interface GameState extends WorldState {
  config: GameConfig; turn: number; phase: Phase; playerRole: PlayerRole; finished: boolean;
  seed: number; rng_state: number; pending_projects: Project[]; history: TurnRecord[];
  external_shocks: {turn:number; label:string; value:number}[]; private: PrivateInfo;
}
export interface Score { dimensions: { technology:number; economy:number; diplomacy:number; fiscal:number }; total:number; label:string; explanation:string; longTermPotential:number }
export interface Indicators {
  cn_legal_ai_import:number; cn_domestic_ai_output:number; cn_usable_ai:number;
  us_ai_output:number; ga_sector_cost:number; ge_sector_cost:number; us_exporter_loss:number;
  nl_litho_profit:number; jp_tool_profit:number; kr_memory_profit:number;
  supply_chain_risk:number; dependency_index:number;
  bottlenecks: Record<'design'|'manufacturing'|'equipment'|'packaging'|'hbm',number>;
  player_score: Score;
}
export interface TurnRecord { turn:number; decisions:Decisions; events:Event[]; indicators:Indicators }
export interface PublicState extends Omit<WorldState,'finance'> {
  finance: Omit<Finance,'firm_cash'>; indicators:Indicators; pending_projects:Project[];
}
export interface AgentObservation {
  roleId:AgentId; turn:number; phase:Phase; publicState:PublicState;
  privateState: { weights:Preference; strategy_type:string; estimates:Record<string,number>; cash:number; ap:number };
  history:Event[]; legalActions:LegalAction[];
}
export interface RandomInputs { seed:number; research?:number[]; shock?:number }
export interface TurnResult { nextState:GameState; events:Event[]; indicators:Indicators }
