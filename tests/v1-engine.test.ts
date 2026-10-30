import { describe, expect, it } from 'vitest';
// The engine deliberately remains a dependency-free server-side ES module.
// @ts-expect-error The frozen integration surface is documented in game-v1-contracts.md.
import { ROLE_IDS, ACTIONS, GOAL_CATALOGUE, createGame, legalActions, sendMessage, proposeDeal, respondDeal, ready, submitAction, resolveRound, advanceRound, getSnapshot, getObservation } from '../server/v1/engine.mjs';
import type { Role, ActionId, Metrics, Snapshot } from '../src/game-v1/types';

const roles: Role[] = ['US', 'CN', 'NL', 'AS'];
const initial = (draw = 0) => createGame(Object.fromEntries(roles.map(role => [role, draw])));
type Game = ReturnType<typeof initial>;
const stage = (g: Game) => roles.reduce((s, role) => ready(s, role), g);
const actionsStage = (g = initial()) => stage(stage(g));
const play = (g: Game, choices: Partial<Record<Role, ActionId>> = {}) => roles.reduce((s, role) => submitAction(s, role, choices[role] ?? 'PASS'), g);
const round = (g: Game, choices: Partial<Record<Role, ActionId>> = {}) => play(actionsStage(g), choices);
const metricStart = (metrics: Partial<Metrics>) => {
  const g = initial();
  Object.assign(g.state, metrics);
  g.roundStart = { ...g.state };
  return g;
};
const allFour = (choices: Partial<Record<Role, ActionId>> = {}, g = initial()) => {
  for (let i = 1; i <= 4; i++) {
    g = round(g, choices);
    if (i < 4) g = advanceRound(g);
  }
  return g;
};
const deepFreeze = (value: any): any => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

describe('V1 setup and simultaneous action resolution', () => {
  it('requires explicit binary draws and has exactly four roles and three actions plus PASS each', () => {
    expect(ROLE_IDS).toEqual(roles);
    expect(initial().state).toEqual({ A: 3, B: 3, H: 2, R: 1 });
    expect(initial().roundStart).toEqual(initial().state);
    expect(initial().phase).toBe('negotiation');
    for (const role of roles) {
      expect(ACTIONS[role]).toHaveLength(4);
      expect(initial().goals[role]).toEqual(GOAL_CATALOGUE[role][0]);
      expect(initial(1).goals[role]).toEqual(GOAL_CATALOGUE[role][1]);
    }
    expect(() => createGame()).toThrow();
    expect(() => createGame({ US: 0, CN: 0, NL: 0, AS: 2 })).toThrow();
    expect(() => createGame({ US: 0, CN: 0, NL: 0 })).toThrow();
  });
  it.each([
    [{ NL: 'N2', AS: 'S1' }, { A: 4, B: 5, H: 1, R: 1 }],
    [{ AS: 'S1' }, { A: 3, B: 2, H: 2, R: 1 }],
    [{ NL: 'N1', AS: 'S1' }, { A: 2, B: 1, H: 3, R: 1 }],
    [{ US: 'U3', NL: 'N3' }, { A: 3, B: 5, H: 4, R: 1 }],
    [{ NL: 'N3' }, { A: 3, B: 3, H: 2, R: 1 }],
  ] as [Partial<Record<Role, ActionId>>, Metrics][])('resolves joint conditions %j', (choices, expected) => {
    expect(round(initial(), choices).state).toEqual(expected);
  });
  it('sums simultaneous deltas then clips once, independent of submission order', () => {
    const g = actionsStage(metricStart({ A: 5, B: 5 }));
    const choices = { US: 'U2', CN: 'C2', NL: 'N1', AS: 'S2' } as const;
    const forward = play(g, choices);
    const reverse = [...roles].reverse().reduce((s, role) => submitAction(s, role, choices[role]), g);
    expect(forward.state).toEqual({ A: 4, B: 4, H: 3, R: 1 });
    expect(reverse.state).toEqual(forward.state);
    expect(forward.reportHistory[0].delta).toEqual({ A: -1, B: -1, H: 1, R: 0 });
    expect(round(metricStart({ A: 0, B: 0 }), { US: 'U1', CN: 'C2', NL: 'N1', AS: 'S1' }).state).toEqual({ A: 0, B: 0, H: 3, R: 1 });
  });
  it('S3 checks roundStart, not an action-adjusted A', () => {
    expect(round(metricStart({ A: 2 }), { US: 'U2', AS: 'S3' }).state).toEqual({ A: 3, B: 4, H: 2, R: 1 });
    expect(round(metricStart({ A: 3 }), { US: 'U1', AS: 'S3' }).state).toEqual({ A: 2, B: 3, H: 2, R: 1 });
  });
  it('delays C1 until next round start exactly once, limits uses to two and forbids round four', () => {
    let g = round(initial(), { CN: 'C1' });
    expect(g.state.R).toBe(1);
    expect(g.pendingResearch).toEqual([{ dueRound: 2, amount: 1 }]);
    expect(resolveRound(g)).toBe(g);
    g = advanceRound(g);
    expect(g.state.R).toBe(2);
    expect(g.roundStart.R).toBe(2);
    expect(g.pendingResearch).toEqual([]);
    expect(() => advanceRound(g)).toThrow();
    g = advanceRound(round(g, { CN: 'C1' }));
    expect(g.state.R).toBe(3);
    expect(g.researchUses).toBe(2);
    expect(legalActions(g, 'CN').map((a: any) => a.id)).not.toContain('C1');
    expect(() => submitAction(actionsStage(g), 'CN', 'C1')).toThrow();
    const four = advanceRound(round(advanceRound(round(advanceRound(round(initial()))))));
    expect(four.round).toBe(4);
    expect(legalActions(four, 'CN').map((a: any) => a.id)).not.toContain('C1');
    expect(() => proposeDeal(four, 'CN', { commitments: { CN: 'C1', US: 'U1' }, text: '' })).toThrow();
  });
  it('rejects invalid/incomplete actions and makes repeat settlement/submission idempotent', () => {
    let g = actionsStage();
    expect(() => resolveRound(g)).toThrow();
    expect(() => submitAction(g, 'US', 'C2')).toThrow();
    g = submitAction(g, 'US', 'U2');
    expect(submitAction(g, 'US', 'U2')).toBe(g);
    expect(() => submitAction(g, 'US', 'U1')).toThrow();
    g = submitAction(g, 'CN', 'PASS', 'timeout');
    g = submitAction(g, 'NL', 'N2', 'llm');
    g = submitAction(g, 'AS', 'S1');
    expect(g.phase).toBe('report');
    expect(g.reportHistory[0].sources).toEqual({ US: 'player', CN: 'timeout', NL: 'llm', AS: 'player' });
    expect(resolveRound(g, 1)).toBe(g);
    const next = advanceRound(g);
    expect(resolveRound(next, 1)).toBe(next);
    expect(() => resolveRound(next, 2)).toThrow();
  });
});

describe('V1 messages, phases and atomic agreements', () => {
  it('enforces phases, Unicode limits, message cap, and idempotent readiness without changing metrics', () => {
    let g = sendMessage(initial(), 'US', { content: '😀'.repeat(100), target: null });
    expect(() => sendMessage(g, 'US', { content: '😀'.repeat(101), target: null })).toThrow();
    expect(() => sendMessage(g, 'US', { content: ' ', target: null })).toThrow();
    expect(() => sendMessage(g, 'US', { content: 'x', target: 'US' })).toThrow();
    g = sendMessage(g, 'US', { content: 'private', target: 'CN' }, 'llm');
    expect(() => sendMessage(g, 'US', { content: 'third', target: null })).toThrow();
    g = ready(g, 'US');
    expect(ready(g, 'US')).toBe(g);
    expect(() => sendMessage(g, 'US', { content: 'x', target: null })).toThrow();
    for (const role of ['CN', 'NL', 'AS']) g = ready(g, role);
    expect(g.phase).toBe('signing');
    expect(g.readyRoles).toEqual([]);
    expect(g.state).toEqual(initial().state);
    expect(() => sendMessage(g, 'CN', { content: 'x', target: null })).toThrow();
    expect(() => submitAction(g, 'CN', 'PASS')).toThrow();
  });
  it('validates proposals, one per proposer, and restricts responses to signing/invitees', () => {
    let g = initial();
    for (const commitments of [{ US: 'PASS', CN: 'C3' }, { US: 'U2' }, { CN: 'C3', NL: 'N2' }, { US: 'U2', CN: 'U3' }, { US: 'U2', XX: 'S2' }]) {
      expect(() => proposeDeal(g, 'US', { commitments, text: '' })).toThrow();
    }
    g = proposeDeal(g, 'US', { commitments: { US: 'U2', CN: 'C3' }, text: '研发追加100不属于条款' });
    expect(g.deals[0].accepted).toEqual(['US']);
    expect(() => proposeDeal(g, 'US', { commitments: { US: 'U2', AS: 'S1' }, text: '' })).toThrow();
    expect(() => respondDeal(g, 'CN', { dealId: 'd1', accept: true })).toThrow();
    g = stage(g);
    expect(() => respondDeal(g, 'NL', { dealId: 'd1', accept: true })).toThrow();
    expect(() => respondDeal(g, 'US', { dealId: 'd1', accept: true })).toThrow();
    g = respondDeal(g, 'CN', { dealId: 'd1', accept: true });
    expect(g.deals[0].status).toBe('effective');
    expect(() => respondDeal(g, 'CN', { dealId: 'd1', accept: true })).toThrow();
    expect(g.state).toEqual(initial().state);
  });
  it('locks 2–4 parties only on last acceptance, records conflicts atomically and expires pending deals', () => {
    let g = proposeDeal(initial(), 'US', { commitments: { US: 'U3', CN: 'C3', NL: 'N3', AS: 'S2' }, text: '' });
    g = proposeDeal(g, 'CN', { commitments: { US: 'U2', CN: 'C3' }, text: '' });
    g = proposeDeal(g, 'NL', { commitments: { NL: 'N2', AS: 'S1' }, text: '' });
    g = stage(g);
    g = respondDeal(g, 'CN', { dealId: 'd1', accept: true });
    g = respondDeal(g, 'NL', { dealId: 'd1', accept: true });
    expect(g.deals[0].status).toBe('pending');
    expect(getSnapshot(g, 'NL').signedDealId).toBeUndefined();
    g = respondDeal(g, 'US', { dealId: 'd2', accept: true });
    expect(g.deals[1].status).toBe('effective');
    g = respondDeal(g, 'AS', { dealId: 'd1', accept: true });
    expect(g.deals[0].status).toBe('conflict');
    expect(getSnapshot(g, 'AS').signedDealId).toBeUndefined();
    g = respondDeal(g, 'AS', { dealId: 'd3', accept: true });
    expect(g.deals[2].status).toBe('effective');
    expect(getSnapshot(g, 'NL').signedDealId).toBe('d3');
    expect(getSnapshot(g, 'US').signedDealId).toBe('d2');
    expect(g.state).toEqual(initial().state);
    const pending = stage(proposeDeal(initial(), 'US', { commitments: { US: 'U2', CN: 'C3' }, text: '' }));
    expect(stage(pending).deals[0].status).toBe('expired');
    const rejected = respondDeal(pending, 'CN', { dealId: 'd1', accept: false });
    expect(rejected.deals[0].status).toBe('rejected');
    expect(() => respondDeal(rejected, 'CN', { dealId: 'd1', accept: true })).toThrow();
  });
  it('keeps breaching action effects, awards credit individually and fulfilledDeals only to all-kept agreements', () => {
    let g = stage(proposeDeal(initial(), 'US', { commitments: { US: 'U2', CN: 'C3' }, text: '' }));
    g = respondDeal(g, 'CN', { dealId: 'd1', accept: true });
    g = play(stage(g), { US: 'U1', CN: 'C3' });
    expect(g.state).toEqual({ A: 2, B: 3, H: 2, R: 1 });
    expect(g.credit).toEqual({ US: 0, CN: 2, NL: 1, AS: 1 });
    expect(g.fulfilledDeals).toEqual({ US: 0, CN: 0, NL: 0, AS: 0 });
    expect(g.deals[0].status).toBe('breached');
    expect(g.deals[0].fulfillment).toEqual({ US: false, CN: true });
    g = advanceRound(g);
    g = stage(proposeDeal(g, 'US', { commitments: { US: 'U2', CN: 'C3', NL: 'N2', AS: 'S1' }, text: '' }));
    for (const role of ['CN', 'NL', 'AS']) g = respondDeal(g, role, { dealId: 'd2', accept: true });
    g = play(stage(g), { US: 'U2', CN: 'C3', NL: 'N2', AS: 'S1' });
    expect(g.fulfilledDeals).toEqual({ US: 1, CN: 1, NL: 1, AS: 1 });
    expect(g.credit).toEqual({ US: 1, CN: 2, NL: 2, AS: 2 });
    expect(g.deals[1].status).toBe('fulfilled');
  });
});

describe('V1 privacy, immutability and complete games', () => {
  it.each([
    ['US', 0, { A: 2, B: 4, H: 2, R: 1 }],
    ['US', 1, { A: 3, B: 3, H: 4, R: 1 }],
    ['CN', 0, { A: 3, B: 3, H: 2, R: 3 }],
    ['CN', 1, { A: 4, B: 4, H: 2, R: 1 }],
    ['NL', 0, { A: 3, B: 3, H: 4, R: 1 }],
    ['NL', 1, { A: 4, B: 4, H: 2, R: 1 }],
    ['AS', 0, { A: 4, B: 4, H: 2, R: 1 }],
    ['AS', 1, { A: 3, B: 5, H: 3, R: 1 }],
  ] as [Role, number, Metrics][])('uses exact thresholds for %s draw %s', (role, draw, metrics) => {
    const g = allFour({}, initial(draw));
    g.state = metrics;
    g.credit[role] = 1;
    g.fulfilledDeals[role] = 1;
    expect(getSnapshot(g, role).results[role].won).toBe(true);
    for (const condition of g.goals[role].conditions) {
      const missed = structuredClone(g);
      missed.state[condition.metric] += condition.operator === 'gte' ? -1 : 1;
      expect(getSnapshot(missed, role).results[role].won).toBe(false);
    }
    g.credit[role] = 0;
    expect(getSnapshot(g, role).results[role].won).toBe(false);
    g.credit[role] = 1;
    g.fulfilledDeals[role] = 0;
    expect(getSnapshot(g, role).results[role].won).toBe(false);
  });
  it('projects only owned private information and public catalogues, never other sealed actions', () => {
    let g = sendMessage(initial(), 'CN', { content: 'private-CN-NL', target: 'NL' });
    g = sendMessage(g, 'AS', { content: 'private-AS-US', target: 'US' });
    g = sendMessage(g, 'CN', { content: 'public-CN', target: null });
    g = submitAction(actionsStage(g), 'CN', 'C2');
    for (const role of roles) {
      const snap = getSnapshot(g, role);
      const obs = getObservation(g, role);
      expect(snap.goalCatalogue).toEqual(GOAL_CATALOGUE);
      expect(snap.ownGoal).toEqual(g.goals[role]);
      expect(obs.role.id).toBe(role);
      expect(obs.role.name).toBe(snap.roles.find((r: any) => r.id === role).name);
      expect(obs.goals).toBeUndefined();
      expect(obs.actions).toBeUndefined();
      expect(obs.actionSources).toBeUndefined();
      expect(snap.revealedGoals).toBeUndefined();
      expect(snap.submittedRoles).toEqual(['CN']);
      expect(snap.ownAction).toBe(role === 'CN' ? 'C2' : undefined);
      expect(JSON.stringify(snap)).toContain(role === 'US' || role === 'AS' ? 'private-AS-US' : 'private-CN-NL');
      expect(JSON.stringify(obs)).not.toContain(role === 'US' || role === 'AS' ? 'private-CN-NL' : 'private-AS-US');
      expect(snap.messages.some((m: any) => m.content === 'public-CN')).toBe(true);
      // Switching every opponent's draw cannot change this role's projection.
      const alternate = structuredClone(g);
      for (const other of roles.filter(r => r !== role)) alternate.goals[other] = GOAL_CATALOGUE[other][1];
      expect(getObservation(alternate, role)).toEqual(obs);
      // Switching a sealed opponent choice cannot change the projection, either.
      if (role !== 'CN') { alternate.actions.CN = 'C3'; expect(getObservation(alternate, role)).toEqual(obs); }
    }
    // Shared integration shape is checked by assigning HTTP-owned additions only.
    const typed: Snapshot = { ...getSnapshot(g, 'US'), id: 'session', notices: [] };
    expect(typed.phase).toBe('actions');
  });
  it('never changes inputs or leaks mutable references through constants, snapshots or observations', () => {
    const g = deepFreeze(initial());
    const next = sendMessage(g, 'US', { content: 'public', target: null });
    expect(g.messages).toEqual([]);
    expect(next.version).toBe(g.version + 1);
    const offered = proposeDeal(g, 'US', { commitments: { US: 'U2', CN: 'C3' }, text: '' });
    let signing = deepFreeze(stage(offered));
    signing = respondDeal(signing, 'CN', { dealId: 'd1', accept: true });
    let submitting = deepFreeze(stage(signing));
    for (const role of roles) submitting = deepFreeze(submitAction(submitting, role, role === 'US' ? 'U2' : role === 'CN' ? 'C3' : 'PASS'));
    const advanced = advanceRound(submitting);
    expect(advanced.round).toBe(2);
    const snapshot = getSnapshot(g, 'US');
    snapshot.state.A = 99;
    snapshot.ownGoal.conditions[0].value = 99;
    snapshot.goalCatalogue.CN[0].conditions[0].value = 99;
    getObservation(g, 'US').actionCatalogue.CN[0].name = 'changed';
    expect(g.state.A).toBe(3);
    expect(GOAL_CATALOGUE.US[0].conditions[0].value).toBe(2);
    expect(GOAL_CATALOGUE.CN[0].conditions[0].value).toBe(3);
    expect(ACTIONS.CN[0].name).toBe('投资自主研发');
    expect(round(initial(), { US: 'U2' })).toEqual(round(initial(), { US: 'U2' }));
  });
  it('can finish all four rounds without negotiation but no numeric-only win is official', () => {
    const g = allFour({ US: 'U2', CN: 'C3', NL: 'N2', AS: 'S1' }, initial(1));
    expect(g.phase).toBe('finished');
    expect(g.round).toBe(4);
    expect(g.reportHistory).toHaveLength(4);
    const snap = getSnapshot(g, 'US');
    expect(snap.revealedGoals).toEqual(g.goals);
    expect(snap.results.CN.conditionsMet).toEqual([true, true]);
    expect(snap.results.CN.won).toBe(false);
    expect(roles.every(role => !snap.results[role].won)).toBe(true);
    expect(() => advanceRound(g)).toThrow();
    expect(() => submitAction(g, 'US', 'PASS')).toThrow();
    expect(resolveRound(g, 4)).toBe(g);
  });
  it('checks both exact goal conditions AND all-kept agreement history AND final credit', () => {
    let g = stage(proposeDeal(initial(1), 'CN', { commitments: { CN: 'C3', NL: 'N2', AS: 'S1' }, text: '' }));
    g = respondDeal(g, 'NL', { dealId: 'd1', accept: true });
    g = respondDeal(g, 'AS', { dealId: 'd1', accept: true });
    g = play(stage(g), { US: 'U2', CN: 'C3', NL: 'N2', AS: 'S1' });
    for (let i = 2; i <= 4; i++) g = round(advanceRound(g));
    const result = getSnapshot(g, 'US').results;
    expect(result.CN.won).toBe(true);
    expect(result.NL.won).toBe(true);
    expect(result.US.won).toBe(false);
    expect(result.AS.won).toBe(false); // GLOBAL also requires H>=3, which is false.
    const lowCredit = structuredClone(g);
    lowCredit.credit.CN = 0;
    expect(getSnapshot(lowCredit, 'CN').results.CN.won).toBe(false);
    const missedThreshold = structuredClone(g);
    missedThreshold.state.B = 3;
    expect(getSnapshot(missedThreshold, 'CN').results.CN.won).toBe(false);
    expect(getSnapshot(missedThreshold, 'CN').results.CN.conditionsMet).toEqual([true, false]);
  });
});
