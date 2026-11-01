// All numeric effects and thresholds below are hypothetical game assumptions [G].
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const copy = value => structuredClone(value);
import {
  PREFERENCE_CATALOGUE, PREFERENCE_IDS, MILESTONES, preferenceById, milestoneState,
  evaluate, utility, deltaU, effectiveT, initialUtility, DELTA_THRESHOLD, TERM_LABELS,
  normalize as normalizeTerms,
} from './preferences.mjs';
export { PREFERENCE_CATALOGUE, MILESTONES, DELTA_THRESHOLD, TERM_LABELS, effectiveT, evaluate };
export const ROLE_IDS = freeze(['US', 'CN', 'NL', 'AS']);
// Measures do not land together. Washington announces first, The Hague decides the licence on what
// it just saw, Beijing coordinates only once the Dutch position exists, and ASML books orders last.
// This is the order of the four windows, and it is also the order in which facts become public.
export const ACTION_ORDER = freeze(['US', 'NL', 'CN', 'AS']);
const METRICS = ['T', 'A', 'E', 'S', 'P'];
const METRIC_NAMES = freeze({ T: '先进技术获取难度', A: '美荷政策协调度', E: '整体商业收益', S: '中国技术自主能力', P: '美国国内产业压力' });
const clamp = (n, max = 5) => Math.max(0, Math.min(max, n));
const record = value => Object.fromEntries(ROLE_IDS.map(role => [role, value]));
const fail = message => { throw new Error(message); };
const validRole = role => { if (!ROLE_IDS.includes(role)) fail('请选择有效角色。'); };
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
// A role's private type is a *preference*, not a menu of moves: every role faces the same legal
// actions whatever it drew. What the type changes is how the same outcome is valued. The eight old
// Boolean goal cards survive only as milestone badges — they describe a position, never decide a win.
const card = (role,id,name,description) => ({role,id,name,description});
export const ACTIONS = freeze({
 US:[card('US','U1','收紧技术管制','T增加1×(1+回合开始A/5)；基础E−1，开始S≥3改为−0.5；开始P≥1额外E−0.5。'),card('US','U2','有限放宽管制','T−1，E+1，P−1；缓和预期，不表示中国自动解除材料限制。'),card('US','U3','争取荷兰协调','E−0.4；荷兰同轮配合协调则A+2，否则70%不变、30% A−1。'),card('US','U4','加强合规执法','E−0.2；本轮灰色交易查获概率+30个百分点，查获再A+0.5。'),card('US','PASS','保持现状','无指标变化。')],
 CN:[card('CN','C1','投资自主研发','本轮E−0.5；下一回合开始S+1；最多3次，第4回合不可选。'),card('CN','C2','限制对美关键材料出口','P+1，E−0.5；不直接改变T，也不强制美国让步。'),card('CN','C3','提出中荷商业合作','A−1，E+0.4；荷兰同轮批准有限许可时额外E+0.5。'),card('CN','C4','放松关键材料出口限制','P−1，E+0.5；仅回合开始P≥1可选。'),card('CN','PASS','保持现状','无指标变化。')],
 NL:[card('NL','N1','收紧设备许可','T增加1×(1+开始A/5)，A+1；E−1，开始S≥3时改为E−0.5。'),card('NL','N2','批准有限许可','A−1；仅回合开始A<4可选；与ASML同轮合规订单联动一次T−1、E+1。'),card('NL','N3','配合美方协调','仅与美方同轮争取协调联动A+2，不重复叠加；独立无效果。'),card('NL','PASS','保持现状','无指标变化。')],
 AS:[card('AS','S1','执行对华合规订单','与荷兰同轮有限许可联动一次T−1、E+1；没有许可则订单未执行、E−1。行动默认不公开。'),card('AS','S2','开拓其他市场','E+0.5，T+1；此T上升不受同盟杠杆放大。行动默认不公开。'),card('AS','S4','灰色渠道交易（高风险）','未查获T−1、E+1.5；查获E−2、信用−1，下回合T+1（第4回合在判胜前追加）；查获概率=min(100%,20%+临时A×10%+执法30个百分点+此前重点监控20个百分点)。不能写入正式协议。'),card('AS','PASS','保持现状','无指标变化，行动默认不公开。')],
});
const ROLE_INFO = {
  US: ['美国政府', '关注有效技术管制、美荷协调、商业收益；国内压力P为负面成本。'],
  CN: ['中国政府', '关注技术自主、技术获取难度及商业合作；材料限制提供谈判筹码。'],
  NL: ['荷兰政府', '关注许可自主、美荷协调与商业收益。'],
  AS: ['ASML', '关注合规订单、现有客户及其他市场。'],
};

// --- Type beliefs (signaling). All likelihoods are game assumptions [G]. ---
// beliefs[observer][target] = P(target drew the first catalogue goal). Deterministic, no RNG.
// publicBeliefs[target] = posterior from public signals only, identical for every observer.
// --- Type beliefs (signaling). Every likelihood is *derived*, never tabulated. ---
// beliefs[observer][target] = P(target drew the first preference of its catalogue). Deterministic, no RNG.
// publicBeliefs[target] = posterior from public signals only, identical for every observer.
// A signal means something only relative to what a type would have been expected to do, so the
// likelihood of an action a is read straight off the behavioural strategy σ(a|θ) of that type.
const BELIEF_MIN = .05, BELIEF_MAX = .95;
const bayes = (p, [l0, l1]) => {
  const top = l0 * p, next = top / (top + l1 * (1 - p));
  return Math.round(Math.max(BELIEF_MIN, Math.min(BELIEF_MAX, next)) * 100) / 100;
};
// Behavioural strategy: choices are noisy, not deterministic. λ sets how sharply expected utility
// separates actions; the tremble keeps any observation from being read as conclusive evidence [G].
const SOFTMAX_LAMBDA = 10;
const TREMBLE = .2;
const softmax = values => {
  const top = Math.max(...values), weights = values.map(v => Math.exp(SOFTMAX_LAMBDA * (v - top)));
  const total = weights.reduce((n, w) => n + w, 0);
  return weights.map(w => w / total);
};
// Mixing in a tremble bounds how much any single observation can move a posterior.
const trembled = p => TREMBLE / 2 + (1 - TREMBLE) * Math.max(0, Math.min(1, p));
// --- Issues and positions. A statement is a public stance on one issue, never an action card. ---
// Real export-control diplomacy runs on separate tracks, so a stance binds only its own issue.
export const ISSUES = freeze({
  controls: '技术出口管制',
  materials: '关键材料与供应链',
  licensing: '设备许可自主',
  enforcement: '执法与灰色渠道',
  commerce: '商业收益与市场',
});
export const ISSUE_IDS = freeze(Object.keys(ISSUES));
// How costly a stance is to walk back. A red line is the strongest commitment device available.
// Wording strength only. These are never obligations: a deal's commitments are the only promises.
export const COMMIT_LEVELS = freeze({ signal: '看法', pledge: '预告', redline: '红线' });
export const TONES = freeze({ dove: '合作姿态', hawk: '强硬姿态', neutral: '不表态' });
const LEVEL_WEIGHT = freeze({ signal: .6, pledge: 1, redline: 1.4 });
const LEVEL_RISK = freeze({ signal: .2, pledge: .5, redline: .9 }); // Contradiction penalty [G].
const LEVEL_CRED_PENALTY = freeze({ signal: .15, pledge: .3, redline: .45 });
// Each action lands on one issue with one tone; PASS, diversifying and coordination moves carry no
// stance: U3/N3 are about *whether the allies act together*, not about the level of controls, so
// counting them as controls-hawk let the coordination-minded type masquerade as the hawk type and
// drowned the statement signal.
const ACTION_STANCE = freeze({
  U1: ['controls', 'hawk'], U2: ['controls', 'dove'], U4: ['enforcement', 'hawk'],
  C1: ['controls', 'hawk'], C2: ['materials', 'hawk'], C3: ['commerce', 'dove'], C4: ['materials', 'dove'],
  N1: ['licensing', 'hawk'], N2: ['licensing', 'dove'],
  S1: ['commerce', 'dove'], S2: ['commerce', 'neutral'], S4: ['enforcement', 'hawk'],
});
export function actionStance(actionId) { return ACTION_STANCE[actionId] || [null, 'neutral']; }
const DOVE_WORDS = ['合作', '放宽', '许可', '订单', '开放', '共赢', '让步', '放松', '便利', '市场', '维持', '对话', '交换', '履约', '缓和', '稳定'];
const HAWK_WORDS = ['限制', '管制', '收紧', '自主', '安全', '反制', '施压', '执法', '查获', '监控', '审查', '风险', '保护', '红线', '制裁'];
export function classifyStance(content) {
  if (typeof content !== 'string') return null;
  const dove = DOVE_WORDS.filter(word => content.includes(word)).length;
  const hawk = HAWK_WORDS.filter(word => content.includes(word)).length;
  return dove > hawk ? 'dove' : hawk > dove ? 'hawk' : null;
}
// Deal conduct signals. Participants see exactly who kept or broke; bystanders only see whether it
// happened. Both likelihoods come off σ — see conductSignal for how the two differ.
const initialBeliefs = () => Object.fromEntries(ROLE_IDS.map(o => [o, Object.fromEntries(ROLE_IDS.filter(t => t !== o).map(t => [t, .5]))]));
// --- Position statements (semi-commitment). All weights are game assumptions [G]. ---
// The US speaks first each round. A statement is a public stance on one issue, never an action card,
// so no decision is taken twice. Consistency is checked semantically at settle: a stance the eventual
// action contradicts costs credibility, and credibility only ever scales future statement weight.
const STATEMENT_WEIGHT = .45, STATEMENT_CRED_MIN = .25, NAMED_BOOST = 1.35, BYSTANDER_RATIO = .55;
const discount = ([l0, l1], w) => [1 - w + w * l0, 1 - w + w * l1];
const clampWeight = w => Math.min(1, Math.max(0, w));
// Local wording when no model is available. Never contains digits, so it always passes validation.
const STATEMENT_TEMPLATES = freeze({
  hawk: { signal: '认为应坚持更严格的立场', pledge: '准备采取更严格的措施', redline: '划出红线：决不接受相反安排，并将采取一切必要措施' },
  dove: { signal: '认为应保持对话与灵活性', pledge: '准备展现灵活并推动合作', redline: '明确承诺不会走向对抗，愿以对话解决分歧' },
});
export function templateStatement(role, issue, tone, level, target) {
  const body = STATEMENT_TEMPLATES[tone]?.[level] || STATEMENT_TEMPLATES[tone]?.signal;
  if (!body || !ISSUES[issue]) return null;
  const named = target && ROLE_INFO[target] ? `，并点名${ROLE_INFO[target][0]}` : '';
  return `${ROLE_INFO[role][0]}就${ISSUES[issue]}${body}${named}。`;
}
// Updates beliefs of the given observers about target; public signals also move publicBeliefs and the round log.
function emitSignal(next, target, likelihood, observers, reason, isPublic) {
  for (const o of observers) {
    if (o === target) continue;
    const after = bayes(next.beliefs[o][target], likelihood);
    if (after !== next.beliefs[o][target]) next.beliefs[o][target] = after;
  }
  if (isPublic) {
    const before = next.publicBeliefs[target], after = bayes(before, likelihood);
    if (after !== before) {
      next.publicBeliefs[target] = after;
      if (reason) next.beliefLog.push({ round: next.round, target, from: before, to: after, reason });
    }
  }
}
const publicObservers = target => ROLE_IDS.filter(o => o !== target);
// Naming a party sharpens the signal for them and dulls it for bystanders; the shared public posterior
// always moves by the unnamed baseline so every observer agrees on what was publicly said.
function emitStatementSignal(next, role, base, named, reason) {
  for (const o of publicObservers(role)) {
    const likelihood = o === named ? base.named : named ? base.bystander : base.plain;
    next.beliefs[o][role] = bayes(next.beliefs[o][role], likelihood);
  }
  const before = next.publicBeliefs[role], after = bayes(before, base.plain);
  if (after === before) return;
  next.publicBeliefs[role] = after;
  if (reason) next.beliefLog.push({ round: next.round, target: role, from: before, to: after, reason });
}

export function createGame(draws,seed=1) {
  if (!draws || ROLE_IDS.some(role => !has(draws, role) || ![0, 1].includes(draws[role])) || Object.keys(draws).some(role => !ROLE_IDS.includes(role))) fail('目标抽签输入无效。');
  if (!Number.isInteger(seed) || seed<0 || seed>0xffffffff) fail('随机种子输入无效。');
  const state = { T:2, A:2, E:3, S:1, P:0 };
  return { version: 0, round: 1, totalRounds: 4, phase: 'announcement', state, roundStart: copy(state),
    prefs: Object.fromEntries(ROLE_IDS.map(role => [role, copy(PREFERENCE_CATALOGUE[role][draws[role]])])),
    draws: copy(draws),
    seed,roundSeed:roundSeed(seed,1),randomRecords:[],pendingPenalties:[],monitoring:false,
    // Sequential windows: windowStart is the position the role now on stage is looking at, and
    // roundEffects is the running ledger every window appends to. Nothing is applied twice.
    windowStart: copy(state), windowTrail: [], roundEffects: [],
    backlash: false, caught: false, u3Roll: null, greyRoll: null, greyProbability: null,
    pendingResearch: [], researchUses: 0, credit: record(1), fulfilledDeals: record(0),
    beliefs: initialBeliefs(), publicBeliefs: record(.5), beliefLog: [],
    announcements: {}, announceSources: {}, announceCred: record(1),
    statements: {}, statementSources: {}, statementCred: record(1), focusIssue: null, focusRole: null,
    messages: [], claims: [], deals: [], actions: {}, actionSources: {}, readyRoles: [], reportHistory: [] };
}

// A public stance on one issue. US first. Silence (null) is a real option: no stance, no audience cost.
export function declare(game, role, statement, source = 'player') {
  validRole(role);
  if (game.phase !== 'announcement') fail('当前阶段不能发表公开宣示。');
  if (!['player', 'llm', 'timeout', 'fallback'].includes(source)) fail('声明来源无效。');
  if (has(game.statements, role)) fail('本轮已发表过公开宣示。');
  if (role !== 'US' && !has(game.statements, 'US')) fail('须等待美方先发表公开宣示。');
  const next = copy(game);
  if (statement === null || statement === undefined) {
    next.statements[role] = null;
    next.statementSources[role] = source;
    next.version++;
    if (ROLE_IDS.every(r => has(next.statements, r))) next.phase = 'negotiation';
    return next;
  }
  const { issue, tone, level, target, text } = statement || {};
  if (!ISSUE_IDS.includes(issue)) fail('声明议题无效。');
  if (!['dove', 'hawk'].includes(tone)) fail('声明姿态须为合作或强硬。');
  if (!has(COMMIT_LEVELS, level)) fail('措辞强度无效。');
  if (target !== null && target !== undefined && (!ROLE_IDS.includes(target) || target === role)) fail('点名对象无效。');
  if (typeof text !== 'string' || !text.trim() || text.length > 200) fail('声明正文须为不超过二百字的非空文本。');
  const named = target || null;
  next.statements[role] = { issue, tone, level, target: named, text: text.trim() };
  next.statementSources[role] = source;
  // Agenda setting: whoever speaks first picks the issue the round is watched on. Silence sets nothing.
  if (!next.focusIssue) { next.focusIssue = issue; next.focusRole = role; }
  const w = clampWeight(STATEMENT_WEIGHT * LEVEL_WEIGHT[level] * next.statementCred[role]);
  const likelihood = stanceSignal(signalModel(game), role, tone, issue);
  emitStatementSignal(next, role, {
    plain: discount(likelihood, w),
    named: discount(likelihood, clampWeight(w * NAMED_BOOST)),
    bystander: discount(likelihood, clampWeight(w * BYSTANDER_RATIO)),
  }, named, `${ROLE_INFO[role][0]}就${ISSUES[issue]}发表${TONES[tone]}（${COMMIT_LEVELS[level]}）${named ? `并点名${ROLE_INFO[named][0]}` : ''}`);
  next.version++;
  if (ROLE_IDS.every(r => has(next.statements, r))) next.phase = 'negotiation';
  return next;
}
// Deterministic fallback: state the stance that matches what this role is actually about to do.
export function chooseFallbackStatement(game, role) {
  validRole(role);
  if (game.phase !== 'announcement') return null;
  if (role !== 'US' && !has(game.statements, 'US')) return null;
  const [issue, tone] = actionStance(chooseFallbackAction(game, role));
  if (!issue || !['dove', 'hawk'].includes(tone)) return null;
  const level = 'pledge';
  return { issue, tone, level, target: null, text: templateStatement(role, issue, tone, level, null) };
}

// Eligibility is read off the position the role is looking at when its own window opens, so a
// measure the US has just landed can legitimately take a Chinese option off the table.
export function legalActions(game, role) {
  validRole(role);
  const state = game.windowStart ?? game.roundStart ?? game.state;
  return copy(ACTIONS[role].filter(action => (action.id !== 'C1' || (game.round < 4 && game.researchUses < 3)) && (action.id !== 'C4' || state.P>=1) && (action.id !== 'N2' || state.A<4)));
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

// --- Claims raised at the table. Parsed locally, never by the model. ---
// Talk and text are one chain in reality: what a party says it might do decides whether that
// measure can later be written into an arrangement. A claim records the measure plus the attitude.
export const CLAIM_KINDS = freeze({ offer: '愿意', consider: '松口', request: '要求', mention: '提及', refuse: '拒绝' });
const REFUSE_WORDS = ['不接受', '不能接受', '不可能', '绝不', '决不', '无法', '拒绝', '不予', '反对', '不会'];
const CONSIDER_WORDS = ['可以谈', '可以考虑', '可以讨论', '可以商量', '可以研究', '不排除', '持开放', '开放态度', '愿意讨论', '有空间'];
const OFFER_WORDS = ['愿意', '可以', '能够', '承诺', '保证', '将会', '我方将', '予以', '准备', '打算', '我方会'];
const REQUEST_WORDS = ['希望', '要求', '能否', '可否', '应当', '建议', '换取', '期待', '呼吁'];
// Weights are game assumptions [G]: having said yes is worth more than having been asked, and
// overriding an explicit refusal is the most expensive thing you can put in a text.
const CLAIM_RISK = freeze({ offer: -.5, consider: -.25, request: -.15, mention: 0, refuse: .6 });
const CLAIM_RISK_MIN = -.6, CLAIM_RISK_MAX = 1.2, NO_CONTACT_RISK = .3, MAX_CLAIMS_PER_MESSAGE = 2;
const ACTION_INDEX = freeze(Object.fromEntries(Object.entries(ACTIONS).flatMap(([role, cards]) =>
  cards.filter(card => card.id !== 'PASS').map(card => [card.id, { role, name: card.name }]))));
export function parseClaims(content, from, to, round) {
  if (typeof content !== 'string' || !content.trim() || !ROLE_IDS.includes(from)) return [];
  const hits = [];
  for (const [id, meta] of Object.entries(ACTION_INDEX)) {
    let at = content.indexOf(meta.name);
    if (at < 0) at = content.indexOf(id);
    if (at >= 0) hits.push({ id, owner: meta.role, at });
  }
  const refuse = REFUSE_WORDS.some(word => content.includes(word));
  const consider = CONSIDER_WORDS.some(word => content.includes(word));
  const offer = OFFER_WORDS.some(word => content.includes(word));
  const request = REQUEST_WORDS.some(word => content.includes(word));
  return hits.sort((x, y) => x.at - y.at).slice(0, MAX_CLAIMS_PER_MESSAGE).map(hit => ({
    id: `k${round}-${from}-${hit.id}`, round, from, to: to ?? null, owner: hit.owner, actionId: hit.id,
    kind: refuse ? 'refuse' : consider ? 'consider' : hit.owner === from ? (offer ? 'offer' : 'mention') : (request ? 'request' : 'mention'),
  }));
}
export function sendMessage(game, role, input, source = 'player') {
  requireStage(game, 'negotiation', role);
  if (!input || length(input.content) < 1 || length(input.content) > 100 || !input.content.trim()) fail('消息须为1至100字。');
  if (input.target !== null && (!ROLE_IDS.includes(input.target) || input.target === role)) fail('请选择其他角色或公开发送。');
  if (!['player', 'llm'].includes(source)) fail('消息来源无效。');
  if (game.messages.filter(message => message.round === game.round && message.from === role).length >= 2) fail('本回合最多发送2条消息。');
  const next = copy(game);
  const stance = classifyStance(input.content);
  next.messages.push({ id: `m${next.messages.length + 1}`, round: game.round, from: role, to: input.target, content: input.content, source, stance });
  // Register what was actually put on the table. Later claims by the same speaker replace earlier ones.
  for (const claim of parseClaims(input.content, role, input.target, game.round)) {
    const at = next.claims.findIndex(c => c.round === game.round && c.from === role && c.actionId === claim.actionId);
    if (at >= 0) next.claims[at] = claim; else next.claims.push(claim);
  }
  // Cheap talk: a public statement moves every listener (and the public image); a private one moves only its recipient.
  if (stance) emitSignal(next, role, stanceSignal(signalModel(game), role, stance), input.target === null ? publicObservers(role) : [input.target],
    `${ROLE_INFO[role][0]}发表${stance === 'dove' ? '合作姿态' : '强硬姿态'}声明`, input.target === null);
  next.version++;
  return next;
}

export function proposeDeal(game, role, input) {
  requireStage(game, 'negotiation', role);
  const commitments = input?.commitments;
  if (!commitments || typeof commitments !== 'object' || Array.isArray(commitments)) fail('协议须包含有效行动承诺。');
  const participants = Object.keys(commitments);
  if (participants.length < 2 || participants.length > 4 || !participants.includes(role) || participants.some(p => !ROLE_IDS.includes(p))) fail('协议须由包含发起者的2至4方参加。');
  if (participants.some(p => ['PASS','S4'].includes(commitments[p]) || !isLegal(game, p, commitments[p]))) fail('协议须承诺本回合合法的非PASS、非灰色交易行动。');
  if (length(input.text) < 0 || length(input.text) > 300) fail('协议说明不得超过300字。');
  if (currentDeals(game).some(deal => deal.proposer === role)) fail('本回合最多发起1份协议。');
  if (signed(game, role)) fail('本回合已签署生效协议。');
  const next = copy(game);
  next.deals.push({ id: `d${next.deals.length + 1}`, round: game.round, proposer: role, participants:participants, commitments: copy(commitments), text: input.text, accepted: [role], status: 'pending' });
  // Proposing a binding exchange is a public cooperative gesture (proposer and participants are public).
  emitSignal(next, role, stanceSignal(signalModel(game), role, 'dove'), publicObservers(role), `${ROLE_INFO[role][0]}发起正式协议`, true);
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
    // Acceptance lists are visible to participants only, so this weak signal stays inside the deal.
    emitSignal(next, role, stanceSignal(signalModel(game), role, 'dove'), updated.participants.filter(p => p !== role), '', false);
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

// The window that is open right now. Windows are not interchangeable: only one role may move, and
// the others are not guessing — they are waiting for a fact.
export function currentActor(game) {
  if (game.phase !== 'actions') return null;
  return ACTION_ORDER.find(role => !has(game.actions, role)) ?? null;
}
// σ for one role at one position. Earlier windows are already facts for this role, so its strategy
// conditions on them; the composition base stays the round's own start, so a folded branch never
// counts a landed effect twice. ASML's move is never pinned for anyone: it books last.
function roleModel(game, role, state, observed) {
  const view = { ...game, state, windowStart: state, actions: { ...observed },
    deals: game.deals.map(deal => ({ ...deal, commitments: {} })) };
  return { [role]: actionStrategy(view, role, predictBackground(view, role, game.publicBeliefs ?? {})) };
}
// One window settles on its own. Everything a later mover needs — the position it faces, the
// measures already on the table, and the belief update those measures produced — is live before it
// decides. That is the whole point of ordering the game this way.
function applyWindow(next, role, actionId, source) {
  const start = next.roundStart, observed = { ...next.actions };
  // Likelihood is read at the position this window opened on, before its own effects land.
  const model = roleModel(next, role, next.windowStart, observed);
  // A coordination bid is answered — or not — in The Hague's window, never at settlement.
  if (role === 'NL' && observed.US === 'U3' && actionId !== 'N3') { next.u3Roll = roll(next.roundSeed, 0x12345); next.backlash = next.u3Roll < .3; }
  // ASML moves last, so it prices interception against measures it can already see.
  if (role === 'AS') {
    next.greyProbability = chance(start, { ...observed, AS: actionId }, next.backlash, next.monitoring);
    if (actionId === 'S4') { next.greyRoll = roll(next.roundSeed, 0xabcde); next.caught = next.greyRoll < next.greyProbability; }
  }
  next.actions[role] = actionId;
  next.actionSources[role] = source;
  const parts = contributions(role, { ...observed, [role]: actionId, finalRound: next.round === 4 }, { start, backlash: next.backlash, caught: next.caught });
  if (parts.length) {
    for (const part of parts) next.roundEffects.push({ role, ...part });
    next.state = stateAfter(start, next.roundEffects);
  }
  if (actionId === 'C1') { next.pendingResearch.push({ dueRound: next.round + 1, amount: 1 }); next.researchUses++; }
  if (next.caught && next.round < 4) next.pendingPenalties.push({ dueRound: next.round + 1, amount: 1 });
  // A measure is public unless it is ASML's; the company's hand shows only when it is caught.
  if (role !== 'AS' || next.caught)
    emitSignal(next, role, actionSignal(model, role, actionId), publicObservers(role), `${ROLE_INFO[role][0]}${ACTIONS[role].find(c => c.id === actionId)?.name || actionId}`, true);
  next.windowTrail.push({ role, action: actionId, state: copy(next.state), sigma: model[role] });
  next.windowStart = copy(next.state);
}
export function submitAction(game, role, actionId, source = 'player') {
  validRole(role);
  if (!['player', 'llm', 'timeout', 'fallback'].includes(source)) fail('行动来源无效。');
  if (game.phase !== 'actions') fail('当前阶段不能提交行动。');
  const actor = currentActor(game);
  if (!actor) fail('本回合行动已全部完成。');
  if (role !== actor) fail(`当前是${ROLE_INFO[actor][0]}的行动窗口，请等待其措施公开。`);
  if (has(game.actions, role)) fail('本回合已提交过行动。');
  if (!isLegal(game, role, actionId)) fail('请选择本回合合法行动。');
  const next = copy(game);
  applyWindow(next, role, actionId, source);
  next.version++;
  return ROLE_IDS.every(p => has(next.actions, p)) ? closeRound(next) : next;
}

// Integer hundredths preserve each window's effect until the single final rounding. Because windows
// land one at a time, the running position has to be re-derived from every effect landed so far.
const normalize = (key,n) => key==='P' ? clamp(Math.round(n),2) : clamp(Math.floor((Math.round(n*100)+5)/10)/10);
function mix(seed) {let x=seed>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return (x^(x>>>16))>>>0;}
const roundSeed = (seed,round) => mix(seed^Math.imul(round,0x9e3779b9));
const roll = (seed,lane) => mix(seed^lane)/4294967296;
const exactDelta = delta=>Object.fromEntries(Object.entries(delta).map(([k,v])=>[k,Math.round(v*100)/100]));
function aggregate(effects) {
 const hundredths=Object.fromEntries(METRICS.map(k=>[k,0]));
 for(const effect of effects)for(const k of METRICS)hundredths[k]+=Math.round((effect.delta[k]||0)*100);
 return Object.fromEntries(METRICS.map(k=>[k,hundredths[k]/100]));
}
const stateAfter=(start,effects)=>Object.fromEntries(METRICS.map(k=>[k,normalize(k,start[k]+aggregate(effects)[k])]));
// What one window's measure does, given the measures already on the table. Every coupling in this
// game is read off an *observed* move: the Dutch answer to a US coordination bid, the Chinese offer
// once a licence exists, the order ASML books once the licence is real. None of it is guessed, and
// none of it can be triggered by a move that has not happened yet.
function contributions(role,a,ctx) {
 const start=ctx.start,list=[];
 const add=(rule,description,delta,privateAS=false)=>list.push({rule,description,delta:exactDelta(delta),privateAS});
 const leverage=1+start.A/5,baseCost=start.S>=3?-.5:-1,cardId=a[role];
 if(role==='US') {
  if(cardId==='U1')add('U1',`美国收紧管制：窗口开始协调度${start.A}，技术难度增加${Number(leverage.toFixed(2))}；窗口开始自主能力${start.S}，基础商业成本${-baseCost}；窗口开始国内压力${start.P}，${start.P>=1?'另增加0.5商业成本':'未增加材料压力成本'}。`,{T:leverage,E:baseCost-(start.P>=1?.5:0)});
  if(cardId==='U2')add('U2','美国有限放宽，商业预期缓和降低国内压力；不表示中国解除材料限制。',{T:-1,E:1,P:-1});
  // The bid costs money on its own. Whether anybody answers it is settled in The Hague's window.
  if(cardId==='U3')add('U3','美国争取协调，付出商业成本；荷兰是否配合在其后的窗口决定。',{E:-.4});
  if(cardId==='U4')add('U4','美国加强合规执法，查获概率额外提高30个百分点。',{E:-.2});
 }
 if(role==='NL') {
  if(cardId==='N1')add('N1','荷兰收紧设备许可；同盟杠杆及研发缓冲按窗口开始值计算。',{T:leverage,A:1,E:baseCost});
  if(cardId==='N2')add('N2','荷兰批准有限许可，协调度下降；ASML是否接单在其后的窗口决定。',{A:-1});
  if(a.US==='U3') {
   if(cardId==='N3')add('U3+N3','美荷协调联动：美方已公开争取协调，荷兰配合，协调度提高2。',{A:2});
   else add('U3_RANDOM',ctx.backlash?'美方协调未获荷兰配合，随机反噬，协调度下降1。':'美方协调未获荷兰配合，本轮没有反噬。',ctx.backlash?{A:-1}:{});
  }
 }
 if(role==='CN') {
  if(cardId==='C1')add('C1','中国投资研发；本轮商业成本，下一回合开始自主能力提高。',{E:-.5});
  if(cardId==='C2')add('C2','中国限制对美关键材料出口，提高美国压力，不直接改变技术获取难度。',{P:1,E:-.5});
  if(cardId==='C3'){add('C3','中国提出中荷商业合作。',{A:-1,E:.4});if(a.NL==='N2')add('C3+N2','荷兰本轮已公开批准有限许可，中荷商业合作联动一次。',{E:.5});}
  if(cardId==='C4')add('C4','中国放松关键材料限制。',{P:-1,E:.5});
 }
 if(role==='AS') {
  if(cardId==='S1')add('N2+S1',a.NL==='N2'?'荷兰已公开批准有限许可，合规订单执行，联动一次。':'荷兰本轮未批准有限许可，订单未执行，发生准备成本。',a.NL==='N2'?{T:-1,E:1}:{E:-1},true);
  if(cardId==='S2')add('S2','ASML开拓其他市场；技术难度上升不受杠杆放大。',{E:.5,T:1},true);
  if(cardId==='S4'){add('S4',ctx.caught?'灰色交易被查获；商业损失、信用处罚及延迟技术处罚。':'灰色交易未被查获。',ctx.caught?{E:-2}:{T:-1,E:1.5},true);if(ctx.caught&&a.finalRound)add('S4_FINAL','终局查获的技术处罚在最终判胜前执行。',{T:1},true);if(ctx.caught&&a.US==='U4')add('U4_CAUGHT','合规执法查获灰色交易，协调度提高。',{A:.5});}
 }
 return list;
}
// Fold a complete set of four measures through the window order. Used by previews and by every
// expected-utility calculation, so a branch is always priced the way the ledger will price it.
function compose(start,a,backlash,caught) {
 const effects=[];
 for(const role of ACTION_ORDER)for(const part of contributions(role,a,{start,backlash,caught,finalRound:a.finalRound}))effects.push({role,...part});
 return {delta:aggregate(effects),effects,state:stateAfter(start,effects)};
}
function chance(start,a,backlash,monitoring) {
 let tempA=start.A+(a.US==='U3'?(a.NL==='N3'?2:backlash?-1:0):0)+(a.CN==='C3'?-1:0)+(a.NL==='N1'?1:a.NL==='N2'?-1:0);
 tempA=clamp(tempA);return Math.min(1,(20+tempA*10+(a.US==='U4'?30:0)+(monitoring?20:0))/100);
}
// The last window closes the round. By now every measure has landed and every action signal has
// been emitted at the position it was taken on, so what remains is bookkeeping: honouring
// arrangements, credit, the conduct signals a signature produces, and the public record.
function closeRound(next) {
 const a={...next.actions,finalRound:next.round===4};
 const creditDelta=record(0);if(next.caught)creditDelta.AS--;
 for(const deal of currentDeals(next)) {
  if(deal.status!=='effective')continue;
  deal.fulfillment=Object.fromEntries(deal.participants.map(r=>[r,a[r]===deal.commitments[r]]));
  const kept=deal.participants.every(r=>deal.fulfillment[r]);
  for(const r of deal.participants){creditDelta[r]+=deal.fulfillment[r]?1:-1;if(kept)next.fulfilledDeals[r]++;}
  deal.status=kept?'fulfilled':'breached';
 }
 for(const r of ROLE_IDS)next.credit[r]=clamp(next.credit[r]+creditDelta[r],2);
 if(next.caught&&next.credit.AS===0)next.monitoring=true;
 // Deal conduct signals: each participant's likelihood is read off the σ it actually faced in its
 // own window, stashed on the trail when it moved. Participants see who kept or broke; bystanders
 // only see the outcome.
 for(const deal of currentDeals(next)) {
  if(!deal.fulfillment)continue;
  for(const p of deal.participants) {
   const sigma=next.windowTrail.find(t=>t.role===p)?.sigma;
   if(!sigma)continue;
   const model={ [p]: sigma };
   const promised=actionSignal(model,p,deal.commitments[p]);
   const strong=deal.fulfillment[p]?promised:promised.map(l=>1-l);
   const weak=conductSignal(model,p,deal.fulfillment[p]);
   emitSignal(next,p,strong,deal.participants,'',false);
   emitSignal(next,p,weak,publicObservers(p).filter(o=>!deal.participants.includes(o)),deal.fulfillment[p]?`${ROLE_INFO[p][0]}所在协议全员履约`:`${ROLE_INFO[p][0]}所在协议存在违约`,true);
  }
 }
 // Position consistency, compared semantically: a stance binds its own issue only.
 // Acting on another track — or making a stance-free move — leaves the record clean.
 // Choosing silence carries no cost; promising and then doing nothing does.
 const statementChecks=[];
 for(const r of ROLE_IDS) {
  const statement=next.statements[r];
  if(!statement)continue;
  const actual=next.actions[r],[issue,tone]=actionStance(actual);
  let consistent;
  if(tone==='neutral')consistent=statement.level==='signal'?undefined:false;
  else if(issue!==statement.issue)consistent=undefined;
  else consistent=tone===statement.tone;
  if(consistent!==undefined)
   next.statementCred[r]=consistent?Math.min(1,Math.round((next.statementCred[r]+.25)*100)/100)
    :Math.max(STATEMENT_CRED_MIN,Math.round((next.statementCred[r]-LEVEL_CRED_PENALTY[statement.level])*100)/100);
  statementChecks.push({role:r,issue:statement.issue,tone:statement.tone,level:statement.level,target:statement.target,
   actual,actualIssue:issue,actualTone:tone,consistent,cred:next.statementCred[r]});
 }
 const result={delta:aggregate(next.roundEffects),effects:copy(next.roundEffects),state:copy(next.state)};
 const randomRecord={round:next.round,seed:next.roundSeed,u3Roll:next.u3Roll,greyRoll:next.greyRoll,probability:next.greyProbability,backlash:next.backlash,caught:next.caught};
 next.randomRecords.push(randomRecord);
 const beliefShifts=next.beliefLog.filter(entry=>entry.round===next.round);
 next.reportHistory.push(copy({round:next.round,roundStart:next.roundStart,actions:next.actions,sources:next.actionSources,...result,deals:currentDeals(next),credit:next.credit,fulfilledDeals:next.fulfilledDeals,caught:next.caught,randomRecord,beliefShifts,statementChecks,statements:copy(next.statements),claims:copy(next.claims),messages:copy(next.messages.filter(m=>m.round===next.round)),focusIssue:next.focusIssue,focusRole:next.focusRole}));
 next.phase=next.round===4?'finished':'report';return next;
}

export function resolveRound(game, round = game.round) {
  if (game.reportHistory.some(report => report.round === round)) return game;
  if (round !== game.round || game.phase !== 'actions') fail('当前回合无法结算。');
  if (ROLE_IDS.some(role => !has(game.actions, role) || !['player', 'llm', 'timeout','fallback'].includes(game.actionSources[role]))) fail('须由四方依次提交合法行动后才能结算。');
  const next = copy(game);
  next.version++;
  return closeRound(next);
}

export function advanceRound(game) {
  if (game.phase !== 'report' || game.round >= 4) fail('当前不能开始下一回合。');
  const next = copy(game);
  next.round++;
  const research = next.pendingResearch.filter(item => item.dueRound === next.round);
  next.state.S=normalize('S',next.state.S+research.reduce((sum,item)=>sum+item.amount,0));
  next.state.T=normalize('T',next.state.T+next.pendingPenalties.filter(item=>item.dueRound===next.round).reduce((sum,item)=>sum+item.amount,0));
  next.pendingPenalties=next.pendingPenalties.filter(item=>item.dueRound>next.round);
  next.roundSeed=roundSeed(next.seed,next.round);
  next.pendingResearch = next.pendingResearch.filter(item => item.dueRound > next.round);
  next.roundStart = copy(next.state);
  // A fresh round opens a fresh set of windows: no trail, no ledger, no resolved chance events.
  next.windowStart = copy(next.state);
  next.windowTrail = [];
  next.roundEffects = [];
  next.backlash = false; next.caught = false;
  next.u3Roll = null; next.greyRoll = null; next.greyProbability = null;
  next.actions = {};
  next.actionSources = {};
  next.readyRoles = [];
  next.announcements = {};
  next.announceSources = {};
  next.statements = {};
  next.statementSources = {};
  next.claims = [];
  next.focusIssue = null;
  next.focusRole = null;
  next.phase = 'announcement';
  next.version++;
  return next;
}

// A clause that contradicts a party's own public stance on the same issue is the visible half of
// pledgeRisk: the AI already discounts it, so signatories must be able to see the same warning.
// Only participants see terms, so only participants see the conflicts.
// Two parties that have already talked to each other this round or the last one have a working
// relationship: the other side's promises cost them less to believe.
export function hadContact(messages,a,b,round) {
  if(!a||!b||a===b)return false;
  return (messages||[]).some(m=>m.round>=round-1&&((m.from===a&&m.to===b)||(m.from===b&&m.to===a)));
}
function dealConflicts(deal,statements) {
 const conflicts=[];
 if(!deal.commitments||!statements)return conflicts;
 for(const [party,action] of Object.entries(deal.commitments)) {
  const statement=statements[party];if(!statement)continue;
  const [issue,tone]=actionStance(action);
  if(!issue||tone==='neutral'||issue!==statement.issue||tone===statement.tone)continue;
  conflicts.push({role:party,issue:statement.issue,tone:statement.tone,level:statement.level});
 }
 return conflicts;
}
function projectDeal(deal,viewer,ctx) {
 const statements=ctx?.statements,focus=ctx?.focusIssue;
 const publicPart={id:deal.id,round:deal.round,proposer:deal.proposer,participants:deal.participants,status:deal.status};
 const conflicts=dealConflicts(deal,statements);
 if(!deal.participants.includes(viewer)) {
  // Terms stay private, but a contradiction on the round's focus issue is exactly what the news
  // would dig up, so outsiders see that much and nothing else.
  const spotlight=focus?conflicts.filter(c=>c.issue===focus):[];
  return spotlight.length?{...publicPart,conflicts:spotlight}:publicPart;
 }
 const backing=dealBacking({messages:ctx?.messages,claims:ctx?.claims,round:deal.round},deal);
 return {...publicPart,commitments:deal.commitments,text:deal.text,accepted:deal.accepted,...(deal.fulfillment?{fulfillment:deal.fulfillment}:{}),...(conflicts.length?{conflicts}:{}),...(backing.length?{backing}:{})};
}
function projectReport(report,viewer) {
 const canSeeAS=viewer==='AS'||report.caught;
 const effects=report.effects.filter(e=>!e.privateAS||canSeeAS).map(({rule,description,delta})=>({rule,description,delta}));
 if(!canSeeAS)effects.push({rule:'UNDISCLOSED',description:'未公开方的合计影响（不披露具体行动）；已计入结算。',delta:Object.fromEntries(METRICS.map(k=>[k,Math.round((report.delta[k]-effects.reduce((n,e)=>n+(e.delta[k]||0),0))*100)/100]))});
 const sources={...report.sources};if(!canSeeAS)delete sources.AS;
 const adjustment=Object.fromEntries(METRICS.map(k=>[k,Math.round((report.state[k]-report.roundStart[k]-report.delta[k])*100)/100]));
 // ASML's stance record would reveal its hidden move, so others see the stance but not what it did.
 const statementChecks=(report.statementChecks||[]).map(c=>c.role==='AS'&&!canSeeAS
  ?{...c,actual:'hidden',actualIssue:null,actualTone:'hidden',consistent:undefined}:c);
 return {round:report.round,focusIssue:report.focusIssue??null,focusRole:report.focusRole??null,roundStart:report.roundStart,state:report.state,delta:report.delta,adjustment,actions:{...report.actions,AS:canSeeAS?report.actions.AS:'hidden'},sources,effects,deals:report.deals.map(d=>projectDeal(d,viewer,report)),credit:report.credit,fulfilledDeals:report.fulfilledDeals,beliefShifts:report.beliefShifts||[],statementChecks,statements:report.statements?copy(report.statements):undefined};
}
// Where a role stands, on the same scale the verdict will use. The verdict is relative improvement:
// every type is judged on how much it moved its own position, so no type gets a harder target.
export function standingOf(game, role) {
  const pref = game.prefs[role];
  const verdict = evaluate(pref.id, game.state, game.credit[role], game.fulfilledDeals[role]);
  return { ...verdict, credit: game.credit[role], fulfilledDeals: game.fulfilledDeals[role],
    won: verdict.diplomaticVictory, initial: initialUtility(pref.id), terms: normalizeTerms(game.state),
    preference: { id: pref.id, role: pref.role, label: pref.label, blurb: pref.blurb, weights: pref.weights } };
}
export function getSnapshot(game,viewer) {
 validRole(viewer);const ownDeal=signed(game,viewer);
 const snapshot={version:game.version,round:game.round,totalRounds:4,phase:game.phase,state:game.state,roundStart:game.roundStart,playerRole:viewer,
  roles:ROLE_IDS.map(id=>({id,name:ROLE_INFO[id][0],description:ROLE_INFO[id][1],credit:game.credit[id],fulfilledDeals:game.fulfilledDeals[id],possiblePreferences:PREFERENCE_CATALOGUE[id].map(({id:prefId,label})=>({id:prefId,label}))})),
  preferenceCatalogue:PREFERENCE_CATALOGUE,termLabels:TERM_LABELS,ownPreference:game.prefs[viewer],
  milestones:Object.fromEntries(ROLE_IDS.map(r=>[r,MILESTONES[r].map(b=>({id:b.id,role:b.role,label:b.label,description:b.description,...milestoneState(game.state,b)}))])),
  ownStanding:standingOf(game,viewer),
  legalActions:legalActions(game,viewer),messages:game.messages.filter(m=>m.to===null||m.from===viewer||m.to===viewer),deals:game.deals.map(d=>projectDeal(d,viewer,game)),
  claims:visibleClaims(game,viewer),claimKinds:CLAIM_KINDS,
  readyRoles:game.readyRoles,submittedRoles:ROLE_IDS.filter(r=>has(game.actions,r)),messageCount:game.messages.filter(m=>m.round===game.round&&m.from===viewer).length,proposalsMade:currentDeals(game).filter(d=>d.proposer===viewer).length,
  actionOrder:ACTION_ORDER,currentActor:currentActor(game),
  publicActions:Object.fromEntries(ROLE_IDS.filter(r=>has(game.actions,r)&&(r!=='AS'||game.caught)).map(r=>[r,game.actions[r]])),
  reportHistory:game.reportHistory.map(r=>projectReport(r,viewer)),pendingResearch:game.pendingResearch,researchUses:game.researchUses,monitoring:game.monitoring,pendingPenalties:game.pendingPenalties,
  actionPreviews:legalActions(game,viewer).map(card=>previewAction(game,viewer,card.id)),
  announcements:copy(game.announcements),announcedRoles:ROLE_IDS.filter(r=>has(game.announcements,r)),
  announceCred:Object.fromEntries(ROLE_IDS.filter(r=>r!=='AS'||viewer==='AS').map(r=>[r,game.announceCred[r]])),
  statements:copy(game.statements),declaredRoles:ROLE_IDS.filter(r=>has(game.statements,r)),
  statementCred:Object.fromEntries(ROLE_IDS.filter(r=>r!=='AS'||viewer==='AS').map(r=>[r,game.statementCred[r]])),
  issues:ISSUES,commitLevels:COMMIT_LEVELS,tones:TONES,
  focusIssue:game.focusIssue,focusRole:game.focusRole,
  beliefs:game.beliefs[viewer],ownImage:game.publicBeliefs[viewer]};
 if(viewer==='AS')snapshot.ownGreyRisk=Math.min(1,.2+(game.windowStart?.A??game.roundStart.A)*.1+(game.monitoring?.2:0));
 if(has(game.actions,viewer))snapshot.ownAction=game.actions[viewer];if(ownDeal)snapshot.signedDealId=ownDeal.id;
 if(game.phase==='finished') {
  snapshot.revealedPreferences=game.prefs;
  snapshot.results=Object.fromEntries(ROLE_IDS.map(role=>[role,standingOf(game,role)]));
 }
 return copy(snapshot);
}
export function getObservation(game,role) {
 const snapshot=getSnapshot(game,role);
 return {...snapshot,role:snapshot.roles.find(r=>r.id===role),actionCatalogue:copy(ACTIONS),rules:{version:'1.6',assumption:'所有数值是游戏假设，不构成现实政策预测。',
  metrics:{T:'先进技术获取难度，越高中国获取越难',A:'美荷政策协调度',E:'半导体整体商业收益，包括非中国市场',S:'中国技术自主能力',P:'美国国内产业压力；美国视为负面因素'},
  settlement:'行动按 美国→荷兰→中国→ASML 的窗口顺序逐个落地：每窗效果立即合计生效，先手的措施对后手公开（ASML的措施不公开，查获时除外），后手按自己窗口开始值判断资格。杠杆按轮初值计算：仅U1/N1的T增量乘1+轮初A/5；S≥3时各自基础E成本减为0.5，U1的P≥1额外0.5成本不减。T/A/E/S统一四舍五入1位并截断0..5，P整数0..2。C1下回合S+1最多3次第4回合禁用；N2需窗口开始A<4，C4需窗口开始P≥1。',
  risk:'查获概率=min(1,0.2+临时A*0.1+U4的0.3+此前重点监控0.2)，在ASML窗口按轮初值与已落地行动估计。临时A包括确定性A变化和U3随机反噬，不含U4查获后A+0.5。U3未获N3配合时在荷兰窗口当场掷定：30% A−1否则不变。S4查获信用−1、E−2、下回合T+1；第4回合在最终判胜前T+1。查获且合并协议处罚后的最终信用0触发永久重点监控一次。随机结果固定不可重抽。',
  agreements:'每轮最多发起1份并参与1份生效协议，2至4方各承诺本轮合法非PASS非S4行动。最后接受时原子锁定，冲突作废。条款只对参与者可见；其他人只见参与方/是否达成/履约状态。允许违约，逐人信用±1，所有人履约才计fulfilledDeals。S4查获额外信用−1合并后截断0..2。',
  privacy:'ASML历史行动默认未公开，仅查获S4公开；不可从effects/source/协议条款读取隐藏行动。私聊仅参与方可见。行动阶段各方按 美国→荷兰→中国→ASML 依次在自己的窗口提交并公开措施（ASML除外）；不得声称知道其他人抽中的目标类型、未公开的行动或ASML的隐藏措施。',
  victory:`第4回合末按「相对提升」判定：U=本方目标权重对公开局势的加权评分+0.05×(信用−1)+0.05×全员履约协议数，实质胜利=ΔU（相对初始局势）≥胜利线且信用≥1；外交胜利=实质胜利且至少有1份全员履约协议。胜利线按角色分两档：主动方（美国/荷兰）0.12，被遏制方（中国/ASML）0.08——避免某一方因结构劣势而被卡死。目标只改变同一个局势对你值多少，不改变你能做什么。`,
  preferences:'你抽到的是本方两种政策目标之一（各50%），它是私有的，只改变你对局势的评价，不改变你的可选行动集——四方在同一局面下的合法行动完全相同。八张旧目标卡已降级为里程碑徽章，只作展示，不再决定胜负。',
  signals:'每方对其他方持有目标类型后验beliefs（0.05–0.95，初值0.5，指其抽中目标目录中第1种的概率）；ownImage是所有人仅按公开信息对你的后验。似然不是写死的表，而是从行为策略σ(a|θ)读出来的：先按各类型对当前公开局势算期望效用，再做softmax得到它选各行动的概率，观测到某个行动就按该行动在该类型下的概率做贝叶斯更新——行动窗口内，先手已公开的措施是后手决策与推断的既成事实；颤抖手混合把单次观测的证据强度限制在合理范围。公开宣示同理——一句话的分量来自它与发言者随后措施的关联，因此同一句话在不同局势下信息量不同。协议履约/违约也是同一套σ：参与者看得见谁违约（证据完整），旁观者只看得见结果（证据减半）。ASML未公开行动不产生信号，仅查获灰色交易时公开更新。无随机、可复现。你的言行同样改变他人对你的判断，他方决策会参考其信念。',
  announcements:'每轮先进入公开宣示阶段：美方先公开就某一议题发表宣示，其余三方观测后再各自表态，也可以保持静默。宣示是议题层面的公开姿态，不是措施卡——具体措施只在最后的实际措施阶段出现，所以同一个决策不会被做两遍。声明字段为议题（技术出口管制/关键材料与供应链/设备许可自主/执法与灰色渠道/商业收益与市场）、姿态（合作/强硬）、措辞强度（看法/预告/红线）与点名对象。措辞强度只表示这句话有多重，不构成任何义务；只有协议条款才是承诺。一份声明会去三个地方：一，按0.45×强度系数（看法0.6、预告1、红线1.4）×本人可信度更新所有听众对你的类型判断，点名对被点名方更强、对旁观者更弱；二，进入正式安排阶段的条款比对——协议条款若与某方就同一议题发表的公开立场相悖，其他代表会认为难以兑现并倾向拒绝，安排界面会标出这类冲突；三，结算时按语义与实际行动核对：在另一议题上行动或做出不具姿态的动作时不予核对，「看法」级别维持现状不算背离，「预告」与「红线」级别则算背离。一致则可信度+0.25（至多1），背离按强度扣减（看法0.15、预告0.3、红线0.45，下限0.25）。可信度只影响未来声明的信号权重，不影响指标与信用。',
  positions:'公开宣示会约束随后的闭门磋商：若一方的协议承诺与其就同一议题发表的立场相反，其他代表会认为该承诺难以兑现并降低接受意愿，红线级别的矛盾代价最大；言行可预测的一方更容易谈成协议。保持静默不构成任何义务，也没有观众成本。ASML的言行记录只对自己可见。',
  limits:'每方每回合最多2条100字消息、1份当轮协议提案；自由文本不改变数值或生成额外条款。'}};
}
// --- One payoff function, used for decisions, previews, signing and the verdict alike. ---
// Every branch of the settlement is enumerated with its probability, so a risky move is judged on
// what it is worth in expectation rather than on its best case. Delayed effects (C1, interception)
// are credited when they actually land, because that is when they change the final position.
function branchStates(game, a) {
  const start = game.roundStart, full = { ...a, finalRound: game.round === 4 }, cases = [];
  for (const [backlash, bw] of full.US === 'U3' && full.NL !== 'N3' ? [[false, .7], [true, .3]] : [[false, 1]]) {
    const p = chance(start, full, backlash, game.monitoring);
    for (const [caught, cw] of full.AS === 'S4' ? [[true, p], [false, 1 - p]] : [[false, 1]]) {
      const state = { ...compose(start, full, backlash, caught).state };
      if (full.CN === 'C1' && game.round < 4) state.S = normalize('S', state.S + 1);
      // Being caught raises T next round, so a risky move has to be priced with its own penalty.
      if (full.AS === 'S4' && caught && game.round < 4) state.T = normalize('T', state.T + 1);
      cases.push({ state, caught, weight: bw * cw });
    }
  }
  return cases;
}
// Standing enters the payoff directly, so honouring a promise has to be worth points. A signatory
// that keeps its clause gains credit, and a deal every signatory keeps counts as a kept arrangement.
function standing(game, role, a, caught) {
  let credit = game.credit[role] + (role === 'AS' && caught ? -1 : 0), deals = game.fulfilledDeals[role];
  const deal = currentDeals(game).find(d => d.status === 'effective' && has(d.commitments, role));
  if (deal) {
    credit += a[role] === deal.commitments[role] ? 1 : -1;
    if (deal.participants.every(p => a[p] === deal.commitments[p])) deals++;
  }
  return { credit: clamp(credit, 2), deals };
}
// Expected utility of one move against a distribution over what the others do. This is the payoff
// of the game: no separate "interest" score, no gap to a checklist.
export function actionUtility(game, role, prefId, actionId, scenarioList) {
  let total = 0, mass = 0;
  for (const scenario of scenarioList) {
    const a = { ...scenario.a, [role]: actionId };
    for (const branch of branchStates(game, a)) {
      const st = standing(game, role, a, branch.caught);
      total += scenario.weight * branch.weight * utility(prefId, branch.state, st.credit, st.deals);
      mass += scenario.weight * branch.weight;
    }
  }
  return mass > 0 ? total / mass : 0;
}
// σ(a|θ): a noisy best response. The same object is both the model's prediction of a counterpart and
// the likelihood used to update beliefs about it, so behaviour and inference can never drift apart.
export function actionStrategy(game, role, background) {
  const actions = legalActions(game, role).map(action => action.id);
  const types = PREFERENCE_IDS[role];
  const eu = {}, sigma = {};
  for (const type of types) {
    eu[type] = actions.map(id => actionUtility(game, role, type, id, [{ a: { ...background }, weight: 1 }]));
    const shares = softmax(eu[type]);
    sigma[type] = Object.fromEntries(actions.map((id, i) => [id, shares[i]]));
  }
  return { role, types, actions, eu, sigma };
}
// Blend the two types by the observer's posterior: what you expect depends on what you believe.
export function mixStrategy(strategy, pType0 = .5) {
  return Object.fromEntries(strategy.actions.map(id => [id,
    pType0 * strategy.sigma[strategy.types[0]][id] + (1 - pType0) * strategy.sigma[strategy.types[1]][id]]));
}
// Scenarios over the others' moves that have not landed yet. A measure already on the table is a
// fact with weight 1, so the product stays small and the uncertainty is only about the future.
const SCENARIO_WIDTH = 2;
export function scenarios(game, role, beliefs, background) {
  const beliefsOf = beliefs ?? {};
  let list = [{ a: { ...background }, weight: 1 }];
  for (const other of ROLE_IDS.filter(r => r !== role)) {
    if (other !== 'AS' && has(game.actions, other)) continue;
    const dist = mixStrategy(actionStrategy(game, other, background), beliefsOf[other] ?? .5);
    const top = Object.entries(dist).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, SCENARIO_WIDTH);
    const mass = top.reduce((n, [, p]) => n + p, 0);
    const next = [];
    for (const entry of list) for (const [id, p] of top) next.push({ a: { ...entry.a, [other]: id }, weight: entry.weight * (mass > 0 ? p / mass : p) });
    list = next;
  }
  return list;
}
// Predicts others' sealed actions from the observer's own beliefs. Never inspects real private types,
// sealed actions, or terms the observer cannot see. Two passes: predict, then re-predict against that.
export function predictBackground(game, role, beliefs) {
  let background = record('PASS');
  for (let pass = 0; pass < 2; pass++) {
    const next = { ...background };
    for (const other of ROLE_IDS.filter(r => r !== role)) {
      // A measure that has already landed in an earlier window is a fact, not a forecast. Only
      // public windows count: ASML's hand is pinned for nobody.
      if (other !== 'AS' && has(game.actions, other)) { next[other] = game.actions[other]; continue; }
      const shared = currentDeals(game).find(d => d.status === 'effective' && has(d.commitments, role) && has(d.commitments, other));
      if (shared && isLegal(game, other, shared.commitments[other])) { next[other] = shared.commitments[other]; continue; }
      next[other] = Object.entries(mixStrategy(actionStrategy(game, other, background), beliefs?.[other] ?? .5))
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0];
    }
    background = next;
  }
  return background;
}
export function ownStrategy(game, role) {
  const beliefs = game.beliefs?.[role] ?? {};
  const background = predictBackground(game, role, beliefs);
  const strategy = actionStrategy(game, role, background);
  return { strategy, sigma: strategy.sigma[game.prefs[role].id], scenarios: scenarios(game, role, beliefs, background) };
}
// The action an AI role actually plays: sampled from its own σ, so identical situations need not
// produce identical moves and an observer can never treat a move as a certain type revelation.
export function chooseAction(game, role, draw = .5) {
  const { sigma } = ownStrategy(game, role);
  let cumulative = 0;
  for (const [id, p] of Object.entries(sigma).sort((x, y) => x[0].localeCompare(y[0]))) {
    cumulative += p;
    if (draw <= cumulative + 1e-12) return id;
  }
  return Object.entries(sigma).sort((x, y) => y[1] - x[1])[0][0];
}
export function chooseFallbackAction(game, role) {
  validRole(role);
  const promised = signed(game, role)?.commitments[role];
  if (promised && isLegal(game, role, promised)) return promised;
  // Only own visible agreement terms are available; never use sealed actions, other types or rolls.
  const { strategy } = ownStrategy(game, role);
  const own = strategy.eu[game.prefs[role].id];
  let best = null;
  strategy.actions.forEach((id, i) => { if (!best || own[i] > own[best.i] + 1e-9) best = { id, i }; });
  return best.id;
}
// --- Endogenous likelihoods: P(observation | θ) read off the behavioural strategy. ---
// An observer's private beliefs differ; the shared public posterior must be identical for everyone,
// so public signals are evaluated against the public belief at the state the decision was taken on.
// That view must also hold only what everyone knows: who signed with whom and whether it held is
// public, but the undertakings are not, so the terms are dropped before any likelihood is read off σ.
const publicView = game => ({
  ...game,
  state: game.roundStart,
  deals: game.deals.map(deal => ({ ...deal, commitments: {} })),
});
export function signalModel(game) {
  const view = publicView(game);
  return Object.fromEntries(ROLE_IDS.map(role =>
    [role, actionStrategy(view, role, predictBackground(view, role, game.publicBeliefs ?? {}))]));
}
export function actionSignal(model, role, actionId) {
  return model[role].types.map(type => trembled(model[role].sigma[type][actionId] ?? 0));
}
// A signature is a promise plus a move. Those who signed know which move was promised, so for them
// honouring it has likelihood σ(that move | θ). Everyone else only sees whether it happened; their
// likelihood is P(this delegation repeats itself | θ)=Σ σ(a|θ)², derived from the same σ and using no
// term they cannot see. It is naturally weaker, and it says more about a single-minded type than a
// flexible one: whoever says what they will do is easier to believe twice.
export function conductSignal(model, role, fulfilled) {
  const repeat = type => model[role].actions.reduce((n,id)=>{const p=model[role].sigma[type][id]??0;return n+p*p;},0);
  return model[role].types.map(type => trembled(fulfilled?repeat(type):1-repeat(type)));
}
// Cheap talk is informative only because it correlates with what the speaker is about to do: the
// likelihood of a tone is the strategy mass behind the moves that carry it. A stance is always taken
// on one issue, so only moves on that issue count — saying nothing about licensing is not evidence
// about licensing, and each type spreads its mass differently once one issue is held fixed.
export function stanceSignal(model, role, tone, issue = null) {
  const carries = id => { const [aIssue, aTone] = actionStance(id); return aTone === tone && (!issue || aIssue === issue); };
  return model[role].types.map(type => trembled(model[role].actions.reduce((n, id) =>
    n + (model[role].sigma[type][id] ?? 0) * (carries(id) ? 1 : 0), 0)));
}

const PREVIEW_SUMMARIES={U1:'提高技术限制，但会损失整体商业收益。',U2:'缓和技术限制并改善商业收益、降低美国压力。',U3:'争取荷兰配合；成功提升协调，未获配合可能适得其反。',U4:'付出小额商业成本，提高本轮查获灰色交易的可能。',C1:'牺牲部分当前收益，换取下一回合自主能力。',C2:'通过材料供应向美国施压；不会自动降低技术难度。',C3:'降低美荷协调、改善商业合作；荷兰许可可增加收益。',C4:'放松材料限制，缓解美国压力并改善商业收益。',N1:'提高技术限制和美荷协调，但会损失商业收益。',N2:'放宽许可；ASML配合交付才能取得订单收益。',N3:'配合美国争取协调；美国不配合时没有独立效果。',S1:'需要荷兰许可才能交付，缺少许可会损失准备成本。',S2:'通过其他市场增加商业收益，但会提高中国获取难度。',S4:'高收益、高风险；被查获会损失收益、信用并带来技术处罚。',PASS:'你不主动改变指标；其他角色仍可能改变局势。'};

// Pure counterfactuals: never inspect selected actions, private opponent goals or seeded rolls.
// Earlier windows are facts here — a preview starts from what has already landed, and only the
// windows still to come are shown as branches.
export function previewAction(game,role,actionId) {
 validRole(role);if(!isLegal(game,role,actionId))fail('该行动当前不可选，无法生成预览。');
 // ASML books last and its hand is never public, so no preview may treat it as a landed fact.
 const observed={...game.actions};if(role!=='AS')delete observed.AS;
 const base={...record('PASS'),...observed,[role]:actionId,finalRound:game.round===4};
 const branches=[];
 const prefId=game.prefs[role].id;
 const add=(label,choices={},backlash=false,caught=false,probability)=>{
  const a={...base,...choices},result=compose(game.roundStart,a,backlash,caught),delayed=[];
  if(a.CN==='C1'&&game.round<4)delayed.push({metric:'S',amount:1,when:'下一回合开始'});
  if(a.AS==='S4'&&caught&&game.round<4)delayed.push({metric:'T',amount:1,when:'下一回合开始'});
  // Score the branch exactly the way the verdict will: the state once delayed effects have landed,
  // plus the credit and kept-deal count this own move earns. There is no goal checklist here.
  const after={...result.state};
  for(const d of delayed)after[d.metric]=normalize(d.metric,after[d.metric]+d.amount);
  const st=standing(game,role,a,caught),verdict=evaluate(prefId,after,st.credit,st.deals);
  const branch={label,state:result.state,delta:result.delta,delayed,utility:verdict.utility,deltaU:verdict.delta,
   substantive:verdict.substantiveVictory,credit:st.credit,deals:st.deals,terms:normalizeTerms(after)};
  if(probability!==undefined)branch.probability=probability;
  branch.creditDelta=st.credit-game.credit[role];
  branch.fulfilledDelta=st.deals-game.fulfilledDeals[role];
  branches.push(branch);
 };
 const knows=(r,id)=>observed[r]===id;
 if(actionId==='U3') {add('荷兰随后配合协调',{NL:'N3'});add('荷兰未配合：协调不变',{},false,false,.7);add('荷兰未配合：发生反噬',{},true,false,.3);}
 else if(actionId==='U4') {add('ASML未选择灰色交易');const a={...base,AS:'S4'},p=chance(game.roundStart,a,false,game.monitoring);add('假设ASML灰色交易：查获',{AS:'S4'},false,true,p);add('假设ASML灰色交易：未查获',{AS:'S4'},false,false,1-p);}
 else if(actionId==='N3') {if(knows('US','U3'))add('美国已公开争取协调，配合联动生效');else add('美国本轮未争取协调：无独立效果');}
 else if(actionId==='N2') {add('ASML随后执行合规订单',{AS:'S1'});add('ASML没有执行合规订单');}
 else if(actionId==='S1') {if(knows('NL','N2'))add('荷兰已公开批准有限许可，合规订单执行');else add('荷兰本轮未批准有限许可，订单未执行，发生准备成本');}
 else if(actionId==='C3') {if(knows('NL','N2'))add('荷兰已公开批准有限许可，中荷商业合作联动生效');else add('荷兰本轮未批准有限许可，无联动');}
 else if(actionId==='S4') {const p=chance(game.roundStart,base,false,game.monitoring);add('查获（按已落地措施估计）',{},false,true,p);add('未查获（按已落地措施估计）',{},false,false,1-p);}
 else add('仅本方行动，其余保持现状');
 const landed=ROLE_IDS.filter(r=>has(observed,r)&&r!=='AS').map(r=>`${ROLE_INFO[r][0]}${ACTIONS[r].find(c=>c.id===observed[r])?.name||observed[r]}`);
 return copy({actionId,summary:PREVIEW_SUMMARIES[actionId],assumptions:[
  ...(landed.length?[`已按当前公开事实估算：${landed.join('；')}。`]:['按本轮开始的公开状态估算；尚未行动角色的真实选择不可知。']),
  '除分支注明的假设行动外，尚未行动的角色均假设保持现状；合作分支包括双方效果。',
  '预览不保证最终结果，实际结算还会合计所有角色行动并统一取位、截断。'],branches,...(['S4','U4'].includes(actionId)?{riskIsEstimate:true}:{})});
}

// A public stance that a pledged commitment contradicts makes the promise less credible, so the
// counterparty discounts what accepting it is worth. The weight lives on the same scale as U itself:
// one untelegraphed clause costs about half the victory threshold, an offered one pays you back [G].
const PLEDGE_RISK_WEIGHT = .15;
// Parties with prior direct contact discount a hollow promise less: talks build working trust [G].
const RAPPORT_RELIEF = .6;
export function visibleClaims(game,viewer) {
 return (game.claims||[]).filter(c=>c.round===game.round&&(c.to===null||c.from===viewer||c.to===viewer));
}
// What the table actually said about a measure: the owner's own attitude outranks having been asked.
const CLAIM_PRIORITY = ['refuse','offer','consider','request','mention'];
const claimKindFor = (game,party,action,asker) => {
 const pool=(game.claims||[]).filter(c=>c.round===game.round&&c.actionId===action&&c.owner===party&&(c.from===party||c.from===asker));
 const kinds=new Set(pool.map(c=>c.kind));
 return CLAIM_PRIORITY.find(kind=>kinds.has(kind))??null;
};
export function claimRisk(game,role,commitments) {
 let risk=0;
 for(const [party,action] of Object.entries(commitments||{})) {
  if(party===role||!ROLE_IDS.includes(party)||action==='PASS'||action==='S4')continue;
  const kind=claimKindFor(game,party,action,role);
  if(kind)risk+=CLAIM_RISK[kind];
  else if(!hadContact(game.messages,role,party,game.round))risk+=NO_CONTACT_RISK; // a text out of the blue reads as bad faith
 }
 return Math.max(CLAIM_RISK_MIN,Math.min(CLAIM_RISK_MAX,risk));
}
// Signatories only: how each clause relates to what was said at the table.
function dealBacking(game,deal) {
 if(!deal.commitments)return [];
 return Object.entries(deal.commitments).map(([party,action])=>{
  const kind=claimKindFor(game,party,action,deal.proposer);
  return {party,action,kind,contact:hadContact(game.messages,deal.proposer,party,game.round)};
 });
}
export function pledgeRisk(game,role,commitments) {
 let risk=0;
 for(const [party,action] of Object.entries(commitments||{})) {
  if(party===role||action==='PASS'||action==='S4')continue;
  const statement=game.statements?.[party];
  if(!statement)continue;
  const [issue,tone]=actionStance(action);
  if(!issue||tone==='neutral'||issue!==statement.issue)continue;
  if(tone!==statement.tone)risk+=LEVEL_RISK[statement.level];
 }
 return risk;
}
// What a set of binding clauses is worth: the clauses fix their signatories, everyone else is
// predicted, and the pledge/claim risk is a discount on how much of that to believe.
export function dealScore(game,role,commitments,risk=0) {
 // A counterpart you have actually talked to is cheaper to trust: prior contact softens pledge risk.
 const partners=Object.keys(commitments||{}).filter(r=>r!==role&&ROLE_IDS.includes(r));
 const relief=partners.some(p=>hadContact(game.messages,role,p,game.round))?RAPPORT_RELIEF:1;
 const beliefs=game.beliefs?.[role]??{};
 const scenarioList=scenarios(game,role,beliefs,predictBackground(game,role,beliefs));
 let eu=0,mass=0;
 for(const scenario of scenarioList) {
  const a={...scenario.a,...commitments};
  for(const branch of branchStates(game,a)) {
   const st=standing(game,role,a,branch.caught);
   eu+=scenario.weight*branch.weight*utility(game.prefs[role].id,branch.state,st.credit,st.deals);
   mass+=scenario.weight*branch.weight;
  }
 }
 const total=risk+claimRisk(game,role,commitments);
 // Relief softens what worries you, never the discount you earned at the table.
 return {utility:mass>0?eu/mass:0,
  discount:Math.max(0,total)*relief*PLEDGE_RISK_WEIGHT+Math.min(0,total)*PLEDGE_RISK_WEIGHT};
}

export function chooseFallbackResponses(game,role) {
 validRole(role);if(game.phase!=='signing'||game.readyRoles.includes(role))return [];
 const baseline=dealScore(game,role,{[role]:chooseFallbackAction(game,role)});
 const pending=currentDeals(game).filter(d=>d.status==='pending'&&has(d.commitments,role)&&!d.accepted.includes(role));
 let selected=!!signed(game,role);const responses=[];
 // Array insertion order is the creation order; ID provides a stable tie-break.
 for(const d of pending) {
  const possible=!selected&&d.participants.every(r=>!signed(game,r)&&isLegal(game,r,d.commitments[r])&&!['PASS','S4'].includes(d.commitments[r]));
  const score=possible?dealScore(game,role,d.commitments,pledgeRisk(game,role,d.commitments)):null;
  const accept=!!score&&score.utility-score.discount>baseline.utility+1e-9;
  responses.push({dealId:d.id,accept});if(accept)selected=true;
 }
 return responses;
}

// --- News copy: structured subjects plus deterministic local templates. ---
// The optional LLM only rewrites headline/body; digits are rejected by the caller,
// so nothing here can inject invented numbers into the game.
// Every subject carries the artwork it is illustrated with. The file name is picked here,
// never by the model, so a rewrite can only ever change the words.
export const NEWS_ART = freeze({controls:'示意图 · 晶圆制造产线',materials:'示意图 · 原料与货运港口',
 licensing:'示意图 · 光刻设备与许可审查',enforcement:'示意图 · 海关查验与转口监管',commerce:'示意图 · 市场与财报数据',talks:'示意图 · 闭门磋商现场'});
const art=(issueId)=>{const image=issueId&&NEWS_ART[issueId]?issueId:'talks';return {image,caption:NEWS_ART[image]};};
export function newsSubjects(game) {
 const items=[],name=r=>ROLE_INFO[r][0],focus=game.focusIssue?ISSUES[game.focusIssue]:null;
 // 1) Public statements, once the announcement stage has closed.
 if(game.phase==='negotiation')for(const r of ROLE_IDS) {
  const s=game.statements?.[r];
  if(!s)continue;
  items.push({id:`a${game.round}-${r}`,kind:'announcement',role:r,roleName:name(r),
   issue:ISSUES[s.issue],tone:TONES[s.tone],level:COMMIT_LEVELS[s.level],named:s.target?name(s.target):null,
   focus:s.issue===game.focusIssue,...art(s.issue)});
 }
 // 2) Consultation. Open remarks may be reported in direction; a closed contact is only ever
 //    reported as a meeting — its content, like its terms, never reaches the newsroom.
 if(game.phase==='signing') {
  const round=game.round,msgs=game.messages.filter(m=>m.round===round);
  const open=[...new Map(msgs.filter(m=>m.to===null).map(m=>[m.from,m])).values()].slice(0,3);
  for(const m of open) {
   // What someone said about a measure in public may be quoted in direction — but never the measure
   // itself, so the newsroom cannot be used to read a clause that stays private.
   const spoken=(game.claims||[]).filter(c=>c.round===round&&c.from===m.from&&c.to===null);
   const kind=CLAIM_PRIORITY.find(k=>spoken.some(c=>c.kind===k));
   const quoted=kind?spoken.find(c=>c.kind===kind):null;
   const [claimIssue]=quoted?actionStance(quoted.actionId):[null];
   items.push({id:`t${round}-${m.id}`,kind:'talks',scope:'open',role:m.from,roleName:name(m.from),
    tone:m.stance?TONES[m.stance]:null,issue:focus,claim:kind?CLAIM_KINDS[kind]:null,claimIssue:claimIssue?ISSUES[claimIssue]:null,...art('talks')});
  }
  const pairs=new Map();
  for(const m of msgs.filter(m=>m.to!==null)){const key=[m.from,m.to].sort().join('');if(!pairs.has(key))pairs.set(key,{a:m.from,b:m.to});}
  for(const [key,p] of [...pairs].slice(0,2))items.push({id:`t${round}-${key}`,kind:'talks',scope:'closed',
   role:p.a,roleName:name(p.a),other:name(p.b),issue:focus,...art('talks')});
 }
 // 3) Arrangements: who, and whether it holds. Never the clauses.
 if(game.phase==='actions') {
  const round=game.round,deals=game.deals.filter(d=>d.round===round);
  for(const d of deals.filter(d=>d.status==='effective').slice(0,2))
   items.push({id:`p${round}-${d.id}`,kind:'pact',role:d.proposer,roleName:name(d.proposer),participants:d.participants.map(name),issue:focus,...art('talks')});
  const failed=deals.filter(d=>['rejected','expired','conflict'].includes(d.status));
  if(failed.length)items.push({id:`p${round}-none`,kind:'nopact',role:failed[0].proposer,roleName:name(failed[0].proposer),participants:failed[0].participants.map(name),issue:focus,...art('talks')});
 }
 // 4) Settlement: words against measures, and measures against arrangements.
 const report=game.reportHistory[game.reportHistory.length-1];
 if(report&&game.phase==='report') {
  for(const c of report.statementChecks||[]) {
   if(c.role==='AS'&&!report.caught)continue; // undisclosed conduct stays off the news
   if(c.consistent===undefined)continue; // the stance was never put to the test this round
   items.push({id:`c${report.round}-${c.role}`,kind:c.consistent?'consistent':'deviated',role:c.role,roleName:name(c.role),
    issue:ISSUES[c.issue],tone:TONES[c.tone],level:COMMIT_LEVELS[c.level],...art(c.issue)});
  }
  for(const d of report.deals||[]) {
   const participants=(d.participants||[]).map(name);
   if(d.status==='fulfilled'&&participants.length)
    items.push({id:`r${report.round}-${d.id}`,kind:'kept',role:d.proposer,roleName:name(d.proposer),participants,issue:report.focusIssue?ISSUES[report.focusIssue]:null,...art(report.focusIssue)});
   if(d.status==='breached') {
    const quitters=(d.participants||[]).filter(r=>d.fulfillment?.[r]===false).map(name);
    if(quitters.length)items.push({id:`r${report.round}-${d.id}`,kind:'broken',role:d.proposer,roleName:name(d.proposer),participants,quitters,issue:report.focusIssue?ISSUES[report.focusIssue]:null,...art(report.focusIssue)});
   }
  }
 }
 return items;
}
function fallbackCopy(item) {
 const list=(names)=>names.join('、');
 switch(item.kind) {
  case 'announcement':return {headline:`${item.roleName}就${item.issue}公开表态`,
   body:`${item.roleName}就${item.issue}公开表态，措辞为${item.level}级别${item.named?`，并点名${item.named}`:''}${item.focus?'；该议题是本轮各方关注的焦点':''}。各方正评估这一信号的分量，更关注最终措施是否与表态一致。`};
  case 'talks':return item.scope==='closed'
   ?{headline:`${item.roleName}与${item.other}举行闭门磋商`,
    body:`据悉，${item.roleName}与${item.other}本轮就${item.issue||'产业与贸易议题'}进行了闭门接触，未披露交换条件。这类接触通常先于任何正式安排出现，其分量取决于后续是否形成安排。`}
   :{headline:`${item.roleName}在磋商中就${item.claimIssue||item.issue||'产业议题'}${item.claim?'明确':'释放'}${item.claim||item.tone||'中性'}信号`,
    body:`${item.roleName}本轮在公开磋商中以${item.tone||'中性'}措辞表态${item.claim?`，并就${item.claimIssue||'相关议题'}作出${item.claim}的表态`:''}，但未提出具体承诺。各方据此判断其谈判取向；磋商发言本身不构成义务。`};
  case 'pact':return {headline:`${list(item.participants)}宣布达成安排`,
   body:`本轮，${list(item.participants)}就彼此关切的议题达成正式安排，条款未对外公布。观察人士将比对各方后续措施是否与安排一致。`};
  case 'nopact':return {headline:`本轮磋商未形成安排`,
   body:`本轮接触后，各方未就交换条件取得一致，未形成正式安排。未达成安排不影响各方按自身目标采取后续措施。`};
  case 'kept':return {headline:`${list(item.participants)}履行本轮安排`,
   body:`结算显示，${list(item.participants)}均按本轮安排采取了措施，承诺得以兑现。各方信用随之改善。`};
  case 'broken':return {headline:`${list(item.quitters)}未履行本轮安排`,
   body:`结算显示，${list(item.quitters)}的实际措施与其在正式安排中的承诺不一致。相关方将重新评估其承诺的份量，后续安排更难谈成。`};
  case 'consistent':return {headline:`${item.roleName}言行一致`,
   body:`本轮结算显示，${item.roleName}的实际措施与其就${item.issue}发表的${item.tone}一致。观察人士认为其政策可预期性上升，后续表态的参考价值提高。`};
  default:return {headline:`${item.roleName}立场与措施相悖`,
   body:`本轮结算显示，${item.roleName}的实际措施与其就${item.issue}发表的${item.tone}并不一致。观察人士下调其公开表态的权重，各方将更多依据实际措施作出判断。`};
 }
}
// --- Round brief: the settlement as prose. ---
// The report itself is a ledger; this projects it into the qualitative story a reader can follow.
// Every number stays local: the model only ever sees direction words, so it cannot invent a figure.
const band = value => value>=1?'明显上升':value>=.3?'小幅上升':value<=-1?'明显回落':value<=-.3?'小幅回落':'基本持平';
const direction = (to,from) => to>from?'上升':to<from?'下降':'不变';
export function reportBrief(game,viewer) {
 validRole(viewer);
 const report=game.reportHistory[game.reportHistory.length-1];
 if(!report||game.phase!=='report')return null;
 const name=r=>ROLE_INFO[r][0],previous=game.reportHistory[game.reportHistory.length-2];
 const metrics=METRICS.map(id=>{
  return {id,name:METRIC_NAMES[id]??id,band:band(report.state[id]-report.roundStart[id])};
 });
 return {id:`b${report.round}`,round:report.round,
  focus:report.focusIssue?{issue:ISSUES[report.focusIssue],by:report.focusRole?name(report.focusRole):null}:null,
  moves:ROLE_IDS.filter(r=>r!=='AS'||viewer==='AS'||report.caught).map(r=>({role:r,name:name(r),
   measure:report.actions[r]==='hidden'?'未公开':report.actions[r]==='PASS'?'保持现状':ACTION_INDEX[report.actions[r]]?.name??report.actions[r],undisclosed:report.actions[r]==='hidden'})),
  metrics,
  arrangements:{reached:(report.deals||[]).filter(d=>d.status==='effective'||d.status==='fulfilled').length,
   kept:ROLE_IDS.filter(r=>(report.deals||[]).some(d=>d.fulfillment?.[r]===true)).map(name),
   broken:ROLE_IDS.filter(r=>(report.deals||[]).some(d=>d.fulfillment?.[r]===false)).map(name)},
  conduct:(report.statementChecks||[]).filter(c=>c.role!=='AS'||viewer==='AS'||report.caught).map(c=>({name:name(c.role),issue:ISSUES[c.issue],tone:TONES[c.tone],result:c.consistent===undefined?'未核对':c.consistent?'一致':'背离'})),
  credit:ROLE_IDS.map(r=>({name:name(r),direction:direction(report.credit[r],previous?previous.credit[r]:1)})),
  beliefs:(report.beliefShifts||[]).map(shift=>({target:name(shift.target),direction:direction(shift.to,shift.from)})),
  backing:(report.deals||[]).filter(d=>(d.participants||[]).includes(viewer)).flatMap(d=>dealBacking(report,d)
   .filter(entry=>entry.kind).map(entry=>({measure:ACTION_INDEX[entry.action]?.name??entry.action,party:name(entry.party),kind:CLAIM_KINDS[entry.kind]})))};
}
export function renderBriefFallback(game,viewer) {
 const brief=reportBrief(game,viewer);
 if(!brief)return null;
 const moves=brief.moves.map(m=>`${m.name}${m.undisclosed?'未公开本轮措施':`采取${m.measure}`}`).join('，');
 const metrics=brief.metrics.map(m=>`${m.name}${m.band}`).join('、');
 const conduct=brief.conduct.length?brief.conduct.map(c=>`${c.name}就${c.issue}${c.result}`).join('；'):'本轮没有需要核对的公开宣示';
 const deals=brief.arrangements.reached?`本轮达成了正式安排${brief.arrangements.broken.length?`，其中${brief.arrangements.broken.join('、')}未按承诺行事`:'，各方均按承诺行事'}。`:'本轮没有形成正式安排。';
 return {...brief,source:'template',
  summary:`第${'一二三四'[brief.round-1]??brief.round}回合${brief.focus?`聚焦${brief.focus.issue}${brief.focus.by?`（由${brief.focus.by}设定议程）`:''}`:''}。${moves}；${metrics}。${deals}`,
  moves:conduct+'。',
  watch:brief.focus?`下一轮${brief.focus.issue}仍会是各方交锋的焦点，公开宣示与实际措施是否一致将继续被拿来对照。`:'下一轮各方将重新设定议程，先宣示的一方决定本轮焦点议题。'};
}
// The newsroom must never print a clause: a measure's name would leak the terms of an arrangement.
// PASS is excluded because "维持现状" is ordinary language, not a secret term.
export const NEWS_BANNED_TERMS = freeze(Object.values(ACTIONS).flat().filter(card=>card.id!=='PASS').map(card=>card.name));
export function renderNewsFallback(game) {
 return newsSubjects(game).map(item=>({...item,source:'template',...fallbackCopy(item)}));
}
