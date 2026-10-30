// All numeric effects and thresholds below are hypothetical game assumptions [G].
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const copy = value => structuredClone(value);
export const ROLE_IDS = freeze(['US', 'CN', 'NL', 'AS']);
const METRICS = ['A', 'B', 'H', 'R'];
const clamp = (n, max = 5) => Math.max(0, Math.min(max, n));
const record = value => Object.fromEntries(ROLE_IDS.map(role => [role, value]));
const fail = message => { throw new Error(message); };
const validRole = role => { if (!ROLE_IDS.includes(role)) fail('请选择有效角色。'); };
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const goal = (role, id, label, conditions) => ({ role, id, label,
  description: `${conditions.map(c => `${c.metric}${c.operator === 'gte' ? '≥' : '≤'}${c.value}`).join('，')}；全员履约协议至少1份且信用≥1。`, conditions });
const condition = (metric, operator, value) => ({ metric, operator, value });
export const GOAL_CATALOGUE = freeze({
  US: [goal('US', 'US_SEC', '安全优先', [condition('A', 'lte', 2), condition('B', 'gte', 4)]), goal('US', 'US_ALLY', '联盟优先', [condition('H', 'gte', 4), condition('A', 'lte', 3)])],
  CN: [goal('CN', 'CN_TECH', '自主突破', [condition('R', 'gte', 3), condition('A', 'gte', 3)]), goal('CN', 'CN_TRADE', '维持合作', [condition('A', 'gte', 4), condition('B', 'gte', 4)])],
  NL: [goal('NL', 'NL_ALLY', '协调优先', [condition('H', 'gte', 4), condition('B', 'gte', 3)]), goal('NL', 'NL_TRADE', '商业优先', [condition('A', 'gte', 4), condition('B', 'gte', 4)])],
  AS: [goal('AS', 'AS_CN', '对华业务', [condition('A', 'gte', 4), condition('B', 'gte', 4)]), goal('AS', 'AS_GLOBAL', '市场多元', [condition('B', 'gte', 5), condition('H', 'gte', 3)])],
});
const card = (role, id, name, description) => ({ role, id, name, description });
export const ACTIONS = freeze({
  US: [card('US', 'U1', '收紧美国技术管制', 'A−1，B−1。'), card('US', 'U2', '有限放宽管制', 'A+1，B+1。'), card('US', 'U3', '与荷兰开展产业合作', 'B+1，H+1；若荷兰同轮选N3，再由N3额外增加B+1、H+1。'), card('US', 'PASS', '维持现状', '无指标变化。')],
  CN: [card('CN', 'C1', '投资自主研发', '本轮R不变，下回合开始R+1；全局最多2次，第4回合不可选。'), card('CN', 'C2', '限制关键材料出口', 'B−2。'), card('CN', 'C3', '提供市场合作便利', 'B+1。'), card('CN', 'PASS', '维持现状', '无指标变化。')],
  NL: [card('NL', 'N1', '收紧荷兰设备许可', 'A−1，B−1，H+1。'), card('NL', 'N2', '批准本轮有限许可', 'H−1；仅当AS同轮选S1时，由S1产生A+1、B+2订单效果；不突破美国适用禁令。'), card('NL', 'N3', '提议美荷联合项目', '仅当US同轮选U3时，额外B+1、H+1，否则无效果。'), card('NL', 'PASS', '维持现状', '无指标变化。')],
  AS: [card('AS', 'S1', '准备并执行对华合规订单', 'NL同轮选N2时A+1、B+2；否则不交付，A不变，B−1为准备成本。ASML无权自行发放许可证。'), card('AS', 'S2', '拓展其他市场', 'B+1，A−1。'), card('AS', 'S3', '维护现有合规客户', '仅当回合开始时A≥3时B+1，否则无效果。'), card('AS', 'PASS', '维持现状', '无指标变化。')],
});
const ROLE_INFO = {
  US: ['美国政府', '关注技术安全、商业环境及美荷协调。'],
  CN: ['中国政府', '关注合法跨境合作与自主技术积累。'],
  NL: ['荷兰政府', '关注许可政策、美荷协调与商业机会。'],
  AS: ['ASML', '关注合规订单、现有客户及其他市场。'],
};

export function createGame(draws) {
  if (!draws || ROLE_IDS.some(role => !has(draws, role) || ![0, 1].includes(draws[role])) || Object.keys(draws).some(role => !ROLE_IDS.includes(role))) fail('目标抽签输入无效。');
  const state = { A: 3, B: 3, H: 2, R: 1 };
  return { version: 0, round: 1, totalRounds: 4, phase: 'negotiation', state, roundStart: copy(state),
    goals: Object.fromEntries(ROLE_IDS.map(role => [role, copy(GOAL_CATALOGUE[role][draws[role]])])),
    pendingResearch: [], researchUses: 0, credit: record(1), fulfilledDeals: record(0),
    messages: [], deals: [], actions: {}, actionSources: {}, readyRoles: [], reportHistory: [] };
}

export function legalActions(game, role) {
  validRole(role);
  return copy(ACTIONS[role].filter(action => action.id !== 'C1' || (game.round < 4 && game.researchUses < 2)));
}
const isLegal = (game, role, actionId) => legalActions(game, role).some(action => action.id === actionId);
const requireStage = (game, phase, role) => {
  validRole(role);
  if (game.phase !== phase) fail('当前阶段不支持此操作。');
  if (game.readyRoles.includes(role)) fail('本阶段已确认完成。');
};
const length = value => typeof value === 'string' ? [...value].length : -1;
const currentDeals = game => game.deals.filter(deal => deal.round === game.round);
const signed = (game, role) => currentDeals(game).find(deal => deal.status === 'effective' && has(deal.commitments, role));

export function sendMessage(game, role, input, source = 'player') {
  requireStage(game, 'negotiation', role);
  if (!input || length(input.content) < 1 || length(input.content) > 100 || !input.content.trim()) fail('消息须为1至100字。');
  if (input.target !== null && (!ROLE_IDS.includes(input.target) || input.target === role)) fail('请选择其他角色或公开发送。');
  if (!['player', 'llm'].includes(source)) fail('消息来源无效。');
  if (game.messages.filter(message => message.round === game.round && message.from === role).length >= 2) fail('本回合最多发送2条消息。');
  const next = copy(game);
  next.messages.push({ id: `m${next.messages.length + 1}`, round: game.round, from: role, to: input.target, content: input.content, source });
  next.version++;
  return next;
}

export function proposeDeal(game, role, input) {
  requireStage(game, 'negotiation', role);
  const commitments = input?.commitments;
  if (!commitments || typeof commitments !== 'object' || Array.isArray(commitments)) fail('协议须包含有效行动承诺。');
  const participants = Object.keys(commitments);
  if (participants.length < 2 || participants.length > 4 || !participants.includes(role) || participants.some(p => !ROLE_IDS.includes(p))) fail('协议须由包含发起者的2至4方参加。');
  if (participants.some(p => commitments[p] === 'PASS' || !isLegal(game, p, commitments[p]))) fail('协议须承诺本回合合法的非PASS行动。');
  if (length(input.text) < 0 || length(input.text) > 300) fail('协议说明不得超过300字。');
  if (currentDeals(game).some(deal => deal.proposer === role)) fail('本回合最多发起1份协议。');
  if (signed(game, role)) fail('本回合已签署生效协议。');
  const next = copy(game);
  next.deals.push({ id: `d${next.deals.length + 1}`, round: game.round, proposer: role, commitments: copy(commitments), text: input.text, accepted: [role], status: 'pending' });
  next.version++;
  return next;
}

export function respondDeal(game, role, input) {
  requireStage(game, 'signing', role);
  const index = game.deals.findIndex(deal => deal.id === input?.dealId && deal.round === game.round);
  const deal = game.deals[index];
  if (!deal || deal.status !== 'pending' || !has(deal.commitments, role) || deal.accepted.includes(role) || typeof input.accept !== 'boolean') fail('该协议当前无法回应。');
  const next = copy(game);
  const updated = next.deals[index];
  if (!input.accept) updated.status = 'rejected';
  else {
    updated.accepted.push(role);
    const participants = Object.keys(updated.commitments);
    if (participants.every(p => updated.accepted.includes(p))) updated.status = participants.some(p => signed(game, p)) ? 'conflict' : 'effective';
  }
  next.version++;
  return next;
}

export function ready(game, role) {
  validRole(role);
  if (!['negotiation', 'signing'].includes(game.phase)) fail('当前阶段无需确认。');
  if (game.readyRoles.includes(role)) return game;
  const next = copy(game);
  next.readyRoles.push(role);
  if (next.readyRoles.length === 4) {
    next.readyRoles = [];
    next.phase = game.phase === 'negotiation' ? 'signing' : 'actions';
    if (next.phase === 'actions') next.deals.forEach(deal => { if (deal.round === game.round && deal.status === 'pending') deal.status = 'expired'; });
  }
  next.version++;
  return next;
}

export function submitAction(game, role, actionId, source = 'player') {
  validRole(role);
  if (!['player', 'llm', 'timeout'].includes(source)) fail('行动来源无效。');
  if (game.phase !== 'actions') fail('当前阶段不能提交行动。');
  if (!isLegal(game, role, actionId)) fail('请选择本回合合法行动。');
  if (has(game.actions, role)) {
    if (game.actions[role] === actionId) return game;
    fail('行动已秘密提交，不可更改。');
  }
  const next = copy(game);
  next.actions[role] = actionId;
  next.actionSources[role] = source;
  next.version++;
  return ROLE_IDS.every(p => has(next.actions, p)) ? settle(next) : next;
}

function settle(next) {
  const a = next.actions;
  const delta = { A: 0, B: 0, H: 0, R: 0 };
  const effects = [];
  const effect = (rule, description, change) => {
    effects.push({ rule, description, delta: change });
    for (const key of METRICS) delta[key] += change[key] ?? 0;
  };
  if (a.US === 'U1') effect('U1', '美国收紧管制。', { A: -1, B: -1 });
  if (a.US === 'U2') effect('U2', '美国有限放宽管制。', { A: 1, B: 1 });
  if (a.US === 'U3') effect('U3', '美荷产业合作。', { B: 1, H: 1 });
  if (a.CN === 'C1') {
    next.pendingResearch.push({ dueRound: next.round + 1, amount: 1 });
    next.researchUses++;
    effect('C1', '已登记研发；下回合开始R+1，本轮R不变。', {});
  }
  if (a.CN === 'C2') effect('C2', '中国限制关键材料出口。', { B: -2 });
  if (a.CN === 'C3') effect('C3', '中国提供市场合作便利。', { B: 1 });
  if (a.NL === 'N1') effect('N1', '荷兰收紧设备许可。', { A: -1, B: -1, H: 1 });
  if (a.NL === 'N2') effect('N2', '荷兰批准本轮有限许可。', { H: -1 });
  if (a.NL === 'N3') effect('U3+N3', a.US === 'U3' ? '美荷联合项目联动触发。' : '美国未选U3，联合项目未触发。', a.US === 'U3' ? { B: 1, H: 1 } : {});
  if (a.AS === 'S1') effect('N2+S1', a.NL === 'N2' ? '有限许可与合规订单联动触发。' : '缺少本轮有限许可，不交付，仅产生准备成本。', a.NL === 'N2' ? { A: 1, B: 2 } : { B: -1 });
  if (a.AS === 'S2') effect('S2', 'ASML拓展其他市场。', { B: 1, A: -1 });
  if (a.AS === 'S3') effect('S3', next.roundStart.A >= 3 ? '回合开始A≥3，维护现有合规客户。' : '回合开始A<3，维护客户无效果。', next.roundStart.A >= 3 ? { B: 1 } : {});
  next.state = Object.fromEntries(METRICS.map(key => [key, clamp(next.roundStart[key] + delta[key])]));
  for (const deal of currentDeals(next)) {
    if (deal.status !== 'effective') continue;
    const participants = Object.keys(deal.commitments);
    deal.fulfillment = Object.fromEntries(participants.map(role => [role, a[role] === deal.commitments[role]]));
    const kept = participants.every(role => deal.fulfillment[role]);
    for (const role of participants) {
      next.credit[role] = clamp(next.credit[role] + (deal.fulfillment[role] ? 1 : -1), 2);
      if (kept) next.fulfilledDeals[role]++;
    }
    deal.status = kept ? 'fulfilled' : 'breached';
  }
  next.reportHistory.push(copy({ round: next.round, roundStart: next.roundStart, actions: a, sources: next.actionSources,
    delta, state: next.state, effects, deals: currentDeals(next), credit: next.credit, fulfilledDeals: next.fulfilledDeals }));
  next.phase = next.round === 4 ? 'finished' : 'report';
  return next;
}

export function resolveRound(game, round = game.round) {
  if (game.reportHistory.some(report => report.round === round)) return game;
  if (round !== game.round || game.phase !== 'actions') fail('当前回合无法结算。');
  if (Object.keys(game.actions).length !== 4 || ROLE_IDS.some(role => !isLegal(game, role, game.actions[role]) || !['player', 'llm', 'timeout'].includes(game.actionSources[role]))) fail('须由四方提交合法行动后才能结算。');
  const next = copy(game);
  next.version++;
  return settle(next);
}

export function advanceRound(game) {
  if (game.phase !== 'report' || game.round >= 4) fail('当前不能开始下一回合。');
  const next = copy(game);
  next.round++;
  const research = next.pendingResearch.filter(item => item.dueRound === next.round);
  next.state.R = clamp(next.state.R + research.reduce((sum, item) => sum + item.amount, 0));
  next.pendingResearch = next.pendingResearch.filter(item => item.dueRound > next.round);
  next.roundStart = copy(next.state);
  next.actions = {};
  next.actionSources = {};
  next.readyRoles = [];
  next.phase = 'negotiation';
  next.version++;
  return next;
}

export function getSnapshot(game, viewer) {
  validRole(viewer);
  const ownDeal = signed(game, viewer);
  const snapshot = {
    version: game.version, round: game.round, totalRounds: 4, phase: game.phase, state: game.state, roundStart: game.roundStart,
    playerRole: viewer, roles: ROLE_IDS.map(id => ({ id, name: ROLE_INFO[id][0], description: ROLE_INFO[id][1], credit: game.credit[id], fulfilledDeals: game.fulfilledDeals[id], possibleGoals: GOAL_CATALOGUE[id].map(({ id: goalId, label }) => ({ id: goalId, label })) })),
    goalCatalogue: GOAL_CATALOGUE, ownGoal: game.goals[viewer], legalActions: legalActions(game, viewer),
    messages: game.messages.filter(message => message.to === null || message.from === viewer || message.to === viewer),
    deals: game.deals, readyRoles: game.readyRoles, submittedRoles: ROLE_IDS.filter(role => has(game.actions, role)),
    messageCount: game.messages.filter(message => message.round === game.round && message.from === viewer).length,
    proposalsMade: currentDeals(game).filter(deal => deal.proposer === viewer).length,
    reportHistory: game.reportHistory, pendingResearch: game.pendingResearch, researchUses: game.researchUses,
  };
  if (has(game.actions, viewer)) snapshot.ownAction = game.actions[viewer];
  if (ownDeal) snapshot.signedDealId = ownDeal.id;
  if (game.phase === 'finished') {
    snapshot.revealedGoals = game.goals;
    snapshot.results = Object.fromEntries(ROLE_IDS.map(role => {
      const conditionsMet = game.goals[role].conditions.map(c => c.operator === 'gte' ? game.state[c.metric] >= c.value : game.state[c.metric] <= c.value);
      return [role, { goal: game.goals[role], conditionsMet, credit: game.credit[role], fulfilledDeals: game.fulfilledDeals[role], won: conditionsMet.every(Boolean) && game.credit[role] >= 1 && game.fulfilledDeals[role] >= 1 }];
    }));
  }
  return copy(snapshot);
}

export function getObservation(game, role) {
  // Construct from the same explicit projection used by HTTP; never spread private state.
  const snapshot = getSnapshot(game, role);
  return { ...snapshot, role: snapshot.roles.find(item => item.id === role), actionCatalogue: copy(ACTIONS), rules: {
    version: '1.0', assumption: '全部数值为假设性游戏规则，不构成现实政策预测。',
    metrics: { A: '合法跨境技术合作机会', B: '商业活力', H: '美荷协调', R: '中国自主技术' },
    settlement: '四方同时秘密行动；按roundStart计算所有增量，合计后一次截断至0～5。C1下回合生效，S3看回合开始的A。',
    agreements: '2至4方明确承诺本轮非PASS行动；全员接受时锁定，每方每轮最多1份生效协议。允许违约，实际行动仍生效；逐人信用±1并截断至0～2，全员履约才各加1份履约记录。',
    victory: '第4回合结束同时满足本人目标的两个数值条件、至少1份全员履约协议、信用≥1。',
    limits: '每方每轮最多2条1至100字消息、1份协议提案。协议自由文本不产生额外指标效果。',
  } };
}
