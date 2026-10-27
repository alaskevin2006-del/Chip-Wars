import type { Action, AgentObservation, PlayerRole, TurnRecord } from '../engine/types';

export interface StartOptions { useLLM: boolean; seed?: number }
export interface GameSnapshot {
  observation: AgentObservation;
  records: TurnRecord[];
  finished: boolean;
  mode: 'rule' | 'llm' | 'mock';
  notice?: string;
}
/** Adapter owns state. UI only selects actions and renders returned observations. */
export interface GameAdapter {
  start(role: PlayerRole, options: StartOptions): GameSnapshot;
  play(actions: Action[]): Promise<GameSnapshot>;
}
export const actionKey = (action: Action) => `${action.id}:${action.target ?? ''}:${action.level ?? ''}`;
export const roleNames = {
  CN_GOV: '中国政府', US_GOV: '美国政府', NL_GOV: '荷兰政府', JP_GOV: '日本政府', KR_GOV: '韩国政府',
  US_AI: '美国 AI 设计企业', CN_DESIGN: '中国 AI 设计企业', CN_FAB: '中国晶圆制造企业', TSMC: '台积电',
};
