// Offline Monte-Carlo calibration for the preference / relative-improvement model.
//
// What this is: every role plays the engine's OWN behavioural strategy — the softmax-trembled
// σ(a|θ) read off the very same utility function that decides victory — sampled with a fixed seed
// over the full 16-way type draw. That isolates the *judgement rule* (ΔU ≥ δ) from agent skill.
//
// What this is NOT: it is not a real-AI balance study, not LLM negotiation, and not a claim about
// optimal play. The calibration it supports is: pick δ so that "you improved your own position by
// δ" is neither automatic nor impossible for any of the eight preference types.
//
// Usage: node ops/v16-calibrate.mjs [seedsPerProfile] [--deals] [--silent]
import * as game from '../server/v1/engine.mjs';
const roles = game.ROLE_IDS;
const argv = process.argv.slice(2);
const SEEDS = Number(argv.find(a => /^\d+$/.test(a)) ?? 8);
const WITH_DEALS = argv.includes('--deals');
const SILENT = argv.includes('--silent');
// Deterministic own stream, independent of the engine's own rolls, so the whole run replays exactly.
const mulberry32 = seed => () => {
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
const round3 = n => Number(n.toFixed(3));

// ---------- one simulated game ----------
const closeAnnouncement = state => {
  while (state.phase === 'announcement')
    state = roles.reduce((s, r) => Object.hasOwn(s.statements, r) ? s : game.declare(s, r, SILENT ? null : (safeStatement(s, r))), state);
  return state;
};
const safeStatement = (state, role) => {
  try { return game.chooseFallbackStatement(state, role); } catch { return null; }
};
// A visible deal: each side promises what it would have done anyway, so accept/reject is meaningful.
const tryDeal = (state, from, to) => {
  try {
    const commitments = { [from]: game.chooseFallbackAction(state, from), [to]: game.chooseFallbackAction(state, to) };
    if (commitments[from] === 'PASS' || commitments[to] === 'PASS') return state;
    return game.proposeDeal(state, from, { commitments, text: 'Offline calibration deal' });
  } catch { return state; }
};
const respondAll = state => {
  for (const role of roles) {
    let responses = [];
    try { responses = game.chooseFallbackResponses(state, role); } catch { responses = []; }
    for (const response of responses) { try { state = game.respondDeal(state, role, response); } catch { /* closed */ } }
  }
  return state;
};
function playGame(draws, seed) {
  const rand = mulberry32(seed * 7919 + 13);
  let state = game.createGame(draws, seed);
  // The yardstick each verdict is measured against: this role's own utility at the opening position.
  const opening = Object.fromEntries(roles.map(role =>
    [role, game.getSnapshot(state, role).ownStanding]));
  const moves = [];
  for (let n = 1; n <= 4; n++) {
    state = closeAnnouncement(state);
    if (WITH_DEALS) {
      const pairs = [['US', 'NL'], ['CN', 'AS'], ['NL', 'AS'], ['AS', 'US']];
      for (const [from, to] of pairs) if (rand() < .5) state = tryDeal(state, from, to);
    }
    // negotiation -> signing -> settlement: each phase needs every role to confirm once.
    let guard = 0;
    while (['negotiation', 'signing'].includes(state.phase) && guard++ < 12) {
      if (state.phase === 'signing' && WITH_DEALS) state = respondAll(state);
      for (const role of roles) state = game.ready(state, role);
    }
    // Sequential windows: each role picks from its σ at the position its own window opens —
    // US, then NL, then CN, then AS — so later windows already see the earlier measures as facts.
    for (const role of game.ACTION_ORDER) {
      const action = game.chooseAction(state, role, rand());
      moves.push({ role, action });
      state = game.submitAction(state, role, action, 'fallback');
    }
    // The fourth submission closed the round; this is now an idempotent no-op kept for clarity.
    game.resolveRound(state, n);
    if (n < 4) state = game.advanceRound(state);
  }
  return { state, moves, opening };
}

// ---------- aggregate ----------
const types = Object.values(game.PREFERENCE_CATALOGUE).flat().map(p => p.id);
const stats = Object.fromEntries(types.map(id => [id, { plays: 0, deltaU: [], substantive: 0, diplomatic: 0, creditBelow1: 0, moves: {} }]));
const THRESHOLDS = [.05, .10, .15, .20, .25];
const byThreshold = Object.fromEntries(THRESHOLDS.map(d => [d, Object.fromEntries(types.map(id => [id, { substantive: 0, diplomatic: 0, plays: 0 }]))]));
const TERM_IDS = Object.keys(game.TERM_LABELS);
const drift = Object.fromEntries(types.map(id => [id, Object.fromEntries(TERM_IDS.map(t => [t, []]))]));
const finals = new Set();
let games = 0, grey = 0;
for (let mask = 0; mask < 16; mask++) {
  const draws = Object.fromEntries(roles.map((role, i) => [role, (mask >> i) & 1]));
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { state, moves, opening } = playGame(draws, seed);
    games++;
    finals.add(JSON.stringify(state.state));
    const results = game.getSnapshot(state, 'US').results;
    for (const { role, action } of moves) if (role === 'AS' && action === 'S4') grey++;
    for (const role of roles) {
      const r = results[role], id = r.prefId, s = stats[id];
      s.plays++;
      s.deltaU.push(r.delta);
      s.substantive += Number(r.substantiveVictory);
      s.diplomatic += Number(r.diplomaticVictory);
      s.creditBelow1 += Number(r.credit < 1);
      for (const move of moves) if (move.role === role) s.moves[move.action] = (s.moves[move.action] ?? 0) + 1;
      const weights = r.preference?.weights ?? {};
      for (const term of TERM_IDS) {
        const start = opening[role].terms?.[term] ?? 0, end = r.terms?.[term] ?? 0;
        drift[id][term].push((weights[term] ?? 0) * (end - start));
      }
      for (const d of THRESHOLDS) {
        const t = byThreshold[d][id];
        t.plays++;
        t.substantive += Number(r.delta >= d && r.credit >= 1);
        t.diplomatic += Number(r.delta >= d && r.credit >= 1 && r.fulfilledDeals >= 1);
      }
    }
  }
}
const summarize = list => {
  const sorted = [...list].sort((a, b) => a - b);
  return { mean: round3(list.reduce((n, v) => n + v, 0) / list.length), p10: round3(pct(sorted, .1)), median: round3(pct(sorted, .5)), p90: round3(pct(sorted, .9)), min: round3(sorted[0]), max: round3(sorted.at(-1)) };
};
const perType = Object.fromEntries(types.map(id => {
  const s = stats[id];
  return [id, {
    plays: s.plays,
    substantiveRate: Number((s.substantive / s.plays).toFixed(3)),
    diplomaticRate: Number((s.diplomatic / s.plays).toFixed(3)),
    creditBelow1Rate: Number((s.creditBelow1 / s.plays).toFixed(3)),
    deltaU: summarize(s.deltaU),
    actionShare: Object.fromEntries(Object.entries(s.moves).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, Number((v / s.plays).toFixed(3))])),
  }];
}));
const thresholdSweep = Object.fromEntries(THRESHOLDS.map(d => [d, Object.fromEntries(types.map(id => {
  const t = byThreshold[d][id];
  return [id, { substantive: Number((t.substantive / t.plays).toFixed(3)), diplomatic: Number((t.diplomatic / t.plays).toFixed(3)) }];
}))]));
// The opening σ of each type: the behavioural print every later belief update reads off.
const openingSigma = {};
{
  const state = closeAnnouncement(game.createGame({ US: 0, CN: 0, NL: 0, AS: 0 }, 1));
  for (const role of roles) {
    const strategy = game.actionStrategy(state, role, game.predictBackground(state, role, {}));
    for (const type of strategy.types)
      openingSigma[type] = Object.fromEntries(Object.entries(strategy.sigma[type]).map(([k, v]) => [k, Number(v.toFixed(3))]));
  }
}
console.log(JSON.stringify({
  kind: 'offline Monte-Carlo calibration of the preference/ΔU judgement rule; sampled from the engine σ, not real-AI play',
  sample: { profiles: 16, seedsPerProfile: SEEDS, games, talks: !SILENT, deals: WITH_DEALS, thresholdChosen: game.DELTA_THRESHOLD },
  uniqueFinalStates: finals.size,
  greyChannelPlays: grey,
  perPreferenceType: perType,
  // Mean weighted change of each normalised term — where a type's ΔU actually comes from, or leaks away.
  termDrift: Object.fromEntries(types.map(id => [id, Object.fromEntries(TERM_IDS.map(t => [t, round3(drift[id][t].reduce((n, v) => n + v, 0) / drift[id][t].length)]))])),
  thresholdSweep,
  openingSigma,
  limitations: [
    'Every role plays the engine softmax strategy σ(a|θ); no LLM, no opponent modelling beyond the engine belief update.',
    'Win rates here measure whether the improvement rule is reachable, not how skilled play distributes victories.',
    'diplomaticRate is zero whenever deals are disabled: no agreement can be kept.',
  ],
}, null, 2));
