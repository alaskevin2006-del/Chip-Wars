// Policy-preference types and one unified utility function. All numbers are game assumptions [G].
//
// Modelling note. A party's private type is its *preference*, never its menu of moves: every role
// faces the same action set whatever type it drew. What changes with the type is how an outcome is
// valued. So the payoff is one continuous function of the public state, and the eight old Boolean
// goal cards survive only as display badges — they no longer decide who wins.
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

// --- Public state and its normalisation. Everything below is on a 0..1 scale. ---
export const INITIAL_STATE = freeze({ T: 2, A: 2, E: 3, S: 1, P: 0 });
export const METRIC_MAX = freeze({ T: 5, A: 5, E: 5, S: 5, P: 2 });

// China's self-sufficiency blunts a restriction: what bites is the gap after domestic substitutes.
export function effectiveT(state) {
  return Math.max(0, Math.round(state.T * 100) - Math.max(0, Math.round(state.S * 100) - 200) / 2) / 100;
}
// Access uses the *effective* difficulty, so a self-sufficient China is already less exposed.
export function normalize(state) {
  const teff = effectiveT(state);
  return {
    Teff: Math.max(0, Math.min(1, teff / METRIC_MAX.T)),
    A: Math.max(0, Math.min(1, state.A / METRIC_MAX.A)),
    E: Math.max(0, Math.min(1, state.E / METRIC_MAX.E)),
    S: Math.max(0, Math.min(1, state.S / METRIC_MAX.S)),
    Access: Math.max(0, Math.min(1, (METRIC_MAX.T - teff) / METRIC_MAX.T)),
    LowA: Math.max(0, Math.min(1, 1 - state.A / METRIC_MAX.A)),
    LowP: Math.max(0, Math.min(1, 1 - state.P / METRIC_MAX.P)),
  };
}
export const TERM_LABELS = freeze({
  Teff: '技术封锁有效强度', A: '美荷政策协调度', E: '产业商业活跃度',
  S: '技术自主能力', Access: '先进技术可得性', LowA: '政策独立空间', LowP: '国内压力缓和',
});
export const TERM_IDS = freeze(Object.keys(TERM_LABELS));

// --- The eight preference types. Two per role, each drawn with probability 0.5, kept private. ---
// Weights sum to 1 within a type, so every score is comparable across types and across roles.
const preference = (role, id, label, blurb, weights) => {
  const sum = Object.values(weights).reduce((n, v) => n + v, 0);
  if (Object.keys(weights).some(k => !TERM_IDS.includes(k))) throw new Error(`偏好权重项无效：${id}`);
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`偏好权重须归一：${id}`);
  return { role, id, label, blurb, weights: freeze({ ...weights }),
    description: `${TERM_IDS.filter(k => weights[k]).map(k => `${TERM_LABELS[k]}${Math.round(weights[k] * 100)}%`).join('、')}。` };
};
export const PREFERENCE_CATALOGUE = freeze({
  US: [
    preference('US', 'US_SEC', '安全优先', '把封锁的真实强度放在第一位，宁可牺牲商业收益。',
      { Teff: 0.50, A: 0.20, E: 0.10, LowP: 0.20 }),
    preference('US', 'US_ALLY', '联盟优先', '把美荷协调当成资产，用一致行动换长期约束力。',
      { Teff: 0.30, A: 0.40, E: 0.10, LowP: 0.20 }),
  ],
  CN: [
    preference('CN', 'CN_TECH', '自主突破', '把自主能力当作根本解，可接受短期的获取困难。',
      { S: 0.50, Access: 0.30, E: 0.10, LowA: 0.10 }),
    preference('CN', 'CN_TRADE', '合作维持', '把可得性与商业往来当成主线，避免被彻底排除。',
      { S: 0.15, Access: 0.45, E: 0.30, LowA: 0.10 }),
  ],
  NL: [
    preference('NL', 'NL_ALLY', '协调优先', '把与美方的一致性当作安全来源，愿意让渡部分商业。',
      { A: 0.50, E: 0.30, Access: 0.20 }),
    preference('NL', 'NL_TRADE', '商业优先', '把产业收益放在首位，尽量保留许可自主。',
      { A: 0.15, E: 0.50, Access: 0.35 }),
  ],
  AS: [
    preference('AS', 'AS_CN', '对华深耕', '把中国市场的可持续准入当作增长来源。',
      { E: 0.35, Access: 0.45, A: 0.20 }),
    preference('AS', 'AS_GLOBAL', '全球多元', '把全球布局与合规确定性放在市场准入之前。',
      { E: 0.55, A: 0.35, Access: 0.10 }),
  ],
});
export const PREFERENCE_IDS = freeze(Object.fromEntries(Object.entries(PREFERENCE_CATALOGUE).map(([role, list]) => [role, list.map(p => p.id)])));
export const PREFERENCE_INDEX = freeze(Object.fromEntries(Object.values(PREFERENCE_CATALOGUE).flat().map(p => [p.id, p])));
export const preferenceById = id => PREFERENCE_INDEX[id] ?? null;
export const preferencesOf = role => PREFERENCE_CATALOGUE[role] ?? [];

// --- The payoff. One function, used for decisions, previews, signing and the final verdict. ---
export const CREDIT_BONUS = 0.05;   // per point of credit above the starting value [G]
export const DEAL_BONUS = 0.05;     // per fully-kept arrangement [G]
export const START_CREDIT = 1;
// 实质胜利 = ΔU ≥ δ 且 credit ≥ 1；外交胜利 = 实质胜利 且 fulfilledDeals ≥ 1。
// δ is a single global constant: every type is judged on how much it improved its own position,
// so no type is handed an easier or harder target. Calibrated by ops/v16-calibrate.mjs [G].
export const DELTA_THRESHOLD = 0.10;
export const MIN_CREDIT_TO_WIN = 1;

export function score(prefId, state) {
  const pref = preferenceById(prefId);
  if (!pref) throw new Error(`偏好类型无效：${prefId}`);
  const terms = normalize(state);
  let total = 0;
  for (const [key, weight] of Object.entries(pref.weights)) total += weight * terms[key];
  return Math.round(total * 1e6) / 1e6;
}
export function utility(prefId, state, credit = START_CREDIT, fulfilledDeals = 0) {
  return Math.round((score(prefId, state) + CREDIT_BONUS * ((credit ?? START_CREDIT) - START_CREDIT) + DEAL_BONUS * (fulfilledDeals ?? 0)) * 1e6) / 1e6;
}
export const initialScore = prefId => score(prefId, INITIAL_STATE);
export const initialUtility = prefId => utility(prefId, INITIAL_STATE);
// Improvement over the status quo ante, not an absolute bar: a type that starts comfortable is not
// handed a free win, and one that starts exposed is not handed an impossible one.
export function deltaU(prefId, state, credit = START_CREDIT, fulfilledDeals = 0) {
  return Math.round((utility(prefId, state, credit, fulfilledDeals) - initialUtility(prefId)) * 1e6) / 1e6;
}
export function thresholdOf(prefId) { return initialUtility(prefId) + DELTA_THRESHOLD; }
export function evaluate(prefId, state, credit = START_CREDIT, fulfilledDeals = 0) {
  const u = utility(prefId, state, credit, fulfilledDeals);
  const delta = Math.round((u - initialUtility(prefId)) * 1e6) / 1e6;
  const substantive = delta >= DELTA_THRESHOLD - 1e-9 && (credit ?? START_CREDIT) >= MIN_CREDIT_TO_WIN;
  return { prefId, score: score(prefId, state), utility: u, delta, deltaThreshold: DELTA_THRESHOLD,
    substantiveVictory: substantive, diplomaticVictory: substantive && (fulfilledDeals ?? 0) >= 1 };
}

// --- Milestone badges. The old hard goal cards, demoted: they describe a position, they never decide. ---
const condition = (metric, operator, value) => ({ metric, operator, value });
const badge = (role, id, label, conditions) => ({
  role, id, label, conditions,
  description: `${conditions.map(c => `${c.metric === 'effectiveT' ? '有效T' : c.metric}${c.operator === 'gte' ? '≥' : '≤'}${c.value}`).join('，')}`,
});
export const MILESTONES = freeze({
  US: [badge('US', 'US_SEC', '安全优先', [condition('effectiveT', 'gte', 4)]),
       badge('US', 'US_ALLY', '联盟优先', [condition('A', 'gte', 4), condition('T', 'gte', 3)])],
  CN: [badge('CN', 'CN_TECH', '自主突破', [condition('S', 'gte', 3), condition('T', 'lte', 3)]),
       badge('CN', 'CN_TRADE', '合作维持', [condition('T', 'lte', 2), condition('E', 'gte', 4)])],
  NL: [badge('NL', 'NL_ALLY', '协调优先', [condition('A', 'gte', 4), condition('E', 'gte', 3)]),
       badge('NL', 'NL_TRADE', '商业优先', [condition('T', 'lte', 2), condition('A', 'lte', 3), condition('E', 'gte', 4)])],
  AS: [badge('AS', 'AS_CN', '对华深耕', [condition('T', 'lte', 2), condition('A', 'gte', 3), condition('E', 'gte', 4)]),
       badge('AS', 'AS_GLOBAL', '全球多元', [condition('E', 'gte', 5), condition('A', 'gte', 3)])],
});
// A badge pairs with the preference it was named after; it is a trophy, not a scoreboard.
export const milestoneOf = (prefId) => MILESTONES[preferenceById(prefId)?.role]?.find(b => b.id === prefId) ?? null;
export function milestoneState(state, badge) {
  const values = { ...state, effectiveT: effectiveT(state) };
  const met = badge.conditions.map(c => (c.operator === 'gte' ? values[c.metric] >= c.value : values[c.metric] <= c.value));
  return { badgeId: badge.id, conditionsMet: met, earned: met.every(Boolean) };
}
