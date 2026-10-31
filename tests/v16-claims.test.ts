import { describe, expect, it } from 'vitest';
// @ts-expect-error Server-only module.
import * as e from '../server/v1/engine.mjs';
const roles = ['US', 'CN', 'NL', 'AS'] as const;
const fresh = (seed = 1) => e.createGame({ US: 0, CN: 0, NL: 0, AS: 0 }, seed);
const stance = (issue: string, tone: string, level = 'pledge', target: string | null = null) =>
  ({ issue, tone, level, target, text: `${issue} ${tone} ${level}` });
const ready = (s: any) => roles.reduce((g, r) => e.ready(g, r), s);
const declare = (s: any, statements: Record<string, any>) => roles.reduce((g, r) => e.declare(g, r, statements[r] ?? null), s);
const talk = (s: any, role: string, content: string, target: string | null = null) =>
  e.sendMessage(s, role, { content, target });
const settled = (us = 'U2', nl = 'N3') => {
  let s = declare(fresh(5), { US: stance('controls', 'hawk') });
  s = talk(s, 'US', '若荷方配合美方协调，我方可以考虑有限放宽管制', 'NL');
  s = e.proposeDeal(s, 'US', { commitments: { US: 'U2', NL: 'N3' }, text: '放宽换协调' });
  s = e.respondDeal(ready(s), 'NL', { dealId: 'd1', accept: true });
  s = ready(s);
  return roles.reduce((g, r) => e.submitAction(g, r, r === 'US' ? us : r === 'NL' ? nl : 'PASS'), s);
};

describe('V1.6 claims: what the table said decides what can be written down', () => {
  it('reads the attitude behind a measure out of a message', () => {
    expect(e.parseClaims('我方愿意有限放宽管制', 'US', null, 1)[0]).toMatchObject({ owner: 'US', kind: 'offer' });
    expect(e.parseClaims('批准有限许可可以考虑', 'NL', null, 1)[0]).toMatchObject({ owner: 'NL', kind: 'consider' });
    expect(e.parseClaims('希望荷方批准有限许可', 'US', 'NL', 1)[0]).toMatchObject({ owner: 'NL', kind: 'request' });
    expect(e.parseClaims('限制对美关键材料出口我们不接受', 'CN', null, 1)[0]).toMatchObject({ owner: 'CN', kind: 'refuse' });
    expect(e.parseClaims('我们注意到收紧技术管制', 'CN', null, 1)[0]).toMatchObject({ owner: 'US', kind: 'mention' });
    expect(e.parseClaims('今天天气不错', 'US', null, 1)).toHaveLength(0);
  });

  it('records at most two claims per message, latest attitude wins', () => {
    const open = declare(fresh(5), { US: stance('controls', 'hawk') });
    const s = talk(open, 'US', '收紧技术管制、加强合规执法、投资自主研发都要谈', null);
    expect(s.claims).toHaveLength(2);
    expect(s.claims.map((c: any) => c.actionId).sort()).toEqual(['U1', 'U4']);
    const again = e.sendMessage(s, 'US', { content: '收紧技术管制我们不接受', target: null });
    expect(again.claims).toHaveLength(2);
    expect(again.claims.find((c: any) => c.actionId === 'U1').kind).toBe('refuse');
  });

  it('keeps a closed-door claim between the two who spoke', () => {
    let s = declare(fresh(5), { US: stance('controls', 'hawk') });
    s = talk(s, 'US', '希望荷方批准有限许可', 'NL');
    expect(e.getSnapshot(s, 'US').claims).toHaveLength(1);
    expect(e.getSnapshot(s, 'NL').claims).toHaveLength(1);
    expect(e.getSnapshot(s, 'CN').claims).toHaveLength(0); // a bystander learns nothing
    expect(e.getSnapshot(s, 'AS').claims).toHaveLength(0);
  });

  it('makes a clause you offered cheaper and a clause you refused expensive', () => {
    const base = talk(declare(fresh(5), { US: stance('controls', 'hawk') }), 'US', '我方愿意有限放宽管制', null);
    const commitments = { US: 'U2', NL: 'N3' };
    // The score is what the desk maximises: offered clauses raise a deal's net worth, refused ones sink it.
    const net = (g:any) => { const x = e.dealScore(g, 'US', commitments, 0); return x.utility - x.discount; };
    const cold = net(base);
    const offered = talk(base, 'NL', '批准有限许可可以考虑，配合美方协调也可以考虑', null);
    expect(e.claimRisk(offered, 'US', commitments)).toBeLessThan(0);
    expect(net(offered)).toBeGreaterThan(cold);
    const refused = talk(base, 'NL', '配合美方协调我们不接受', null);
    expect(e.claimRisk(refused, 'US', commitments)).toBeGreaterThan(0);
    expect(net(refused)).toBeLessThan(cold);
  });

  it('charges for dropping a text on someone you never talked to, and clamps the total', () => {
    const base = declare(fresh(5), { US: stance('controls', 'hawk') });
    expect(e.claimRisk(base, 'NL', { US: 'U2', NL: 'N3' })).toBeCloseTo(.3, 5); // no contact yet
    let s = talk(base, 'NL', '收紧技术管制我们不接受，配合美方协调我们也不接受', null);
    s = e.sendMessage(s, 'NL', { content: '限制对美关键材料出口我们不接受', target: null });
    expect(e.claimRisk(s, 'NL', { US: 'U1', NL: 'N3', CN: 'C2' })).toBeCloseTo(1.2, 5); // clamped
  });

  it('shows signatories how each clause was backed at the table, and only them', () => {
    let s = declare(fresh(5), { US: stance('controls', 'hawk') });
    s = talk(s, 'US', '希望荷方批准有限许可', 'NL');
    s = e.proposeDeal(s, 'US', { commitments: { US: 'U2', NL: 'N2' }, text: '许可换放宽' });
    const mine = e.getSnapshot(s, 'NL').deals.at(-1);
    expect(mine.backing?.find((b: any) => b.party === 'NL')).toMatchObject({ kind: 'request', contact: true });
    expect(e.getSnapshot(s, 'CN').deals.at(-1).backing).toBeUndefined();
  });

  it('turns the ledger into prose without ever handing a figure to the model', () => {
    const s = settled();
    expect(s.phase).toBe('report');
    const brief = e.reportBrief(s, 'US');
    expect(brief.round).toBe(1);
    expect(brief.metrics.every((m: any) => /上升|回落|持平/.test(m.band))).toBe(true);
    expect(JSON.stringify(brief)).not.toMatch(/[0-9]{2,}/); // no magnitudes, only ids and counts stay
    const disclosed = [...brief.moves.map((m: any) => m.measure), ...brief.backing.map((b: any) => b.measure)];
    for (const name of e.NEWS_BANNED_TERMS) if (!disclosed.includes(name)) expect(JSON.stringify(brief)).not.toContain(name);
    const copy = e.renderBriefFallback(s, 'US');
    expect(copy.source).toBe('template');
    for (const part of [copy.summary, copy.moves, copy.watch]) {
      expect(part.length).toBeGreaterThan(10);
      expect(part).not.toMatch(/[0-9]/);
    }
    expect(copy.backing?.length).toBeGreaterThan(0); // the deal was backed by talks
  });
});

describe('speech templates align with parseClaims', () => {
  const cases: [string, string, string, string][] = [
    ['offer', 'US', '关于「有限放宽管制」，我方愿意作出让步。', 'U2'],
    ['consider', 'US', '「有限放宽管制」可以谈。', 'U2'],
    ['request', 'US', '希望贵方重新考虑「批准有限许可」。', 'N2'],
    ['mention', 'US', '我们注意到「收紧技术管制」。', 'U1'],
    ['refuse', 'US', '「收紧技术管制」，我们不能接受。', 'U1'],
  ];
  for (const [kind, from, text, actionId] of cases) {
    it(`parses the ${kind} template`, () => {
      const claims = e.parseClaims(text, from, null, 1);
      expect(claims.length).toBe(1);
      expect(claims[0]).toMatchObject({ kind, owner: actionId[0]==='U'?'US':'NL', actionId, from });
    });
  }
});
