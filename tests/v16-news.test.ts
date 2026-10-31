import { describe, expect, it } from 'vitest';
// @ts-expect-error Server-only module.
import * as e from '../server/v1/engine.mjs';
const roles = ['US', 'CN', 'NL', 'AS'] as const;
const fresh = (seed = 1) => e.createGame({ US: 0, CN: 0, NL: 0, AS: 0 }, seed);
const stance = (issue: string, tone: string, level = 'pledge', target: string | null = null) =>
  ({ issue, tone, level, target, text: `${issue} ${tone} ${level}` });
const ready = (s: any) => roles.reduce((g, r) => e.ready(g, r), s);
const declare = (s: any, statements: Record<string, any>) => roles.reduce((g, r) => e.declare(g, r, statements[r] ?? null), s);
const settleWith = (us: string) => {
  let s = declare(fresh(5), { US: stance('controls', 'hawk') });
  s = e.proposeDeal(s, 'US', { commitments: { US: 'U2', NL: 'N3' }, text: '放宽换协调' });
  s = e.respondDeal(ready(s), 'NL', { dealId: 'd1', accept: true });
  s = ready(s);
  return roles.reduce((g, r) => e.submitAction(g, r, r === 'US' ? us : r === 'NL' ? 'N3' : 'PASS'), s);
};

describe('V1.6 newsroom: one news cycle per layer', () => {
  it('reports public statements once the announcement stage closes', () => {
    const s = declare(fresh(5), { US: stance('controls', 'hawk') });
    expect(s.phase).toBe('negotiation');
    const items = e.newsSubjects(s);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('announcement');
    expect(items[0].focus).toBe(true); // the first speaker set the agenda
  });

  it('reports that closed-door talks happened without ever printing what was said', () => {
    let s = declare(fresh(5), { US: stance('controls', 'hawk') });
    s = e.sendMessage(s, 'US', { content: '放宽部分许可以换取荷方协调', target: 'NL' });
    s = e.sendMessage(s, 'CN', { content: '坚持自主与管制底线', target: null });
    s = ready(s);
    expect(s.phase).toBe('signing');
    const items = e.newsSubjects(s);
    expect(items.every((i: any) => i.kind === 'talks')).toBe(true);
    const closed = items.find((i: any) => i.scope === 'closed'), open = items.find((i: any) => i.scope === 'open');
    expect(closed.other).toBe('荷兰政府');
    expect(open.tone).toBe('强硬姿态'); // an open remark can be reported in direction
    expect(JSON.stringify(items)).not.toContain('放宽部分许可以换取荷方协调');
    for (const item of e.renderNewsFallback(s)) expect(item.headline + item.body).not.toContain('放宽部分许可以换取荷方协调');
  });

  it('reports an arrangement by participants and status, never by clauses', () => {
    let s = declare(fresh(5), { US: stance('controls', 'hawk') });
    s = e.proposeDeal(s, 'US', { commitments: { US: 'U2', NL: 'N3' }, text: '放宽换协调' });
    s = e.respondDeal(ready(s), 'NL', { dealId: 'd1', accept: true });
    s = ready(s);
    expect(s.phase).toBe('actions');
    const items = e.newsSubjects(s);
    expect(items[0].kind).toBe('pact');
    expect(items[0].participants).toContain('美国政府');
    expect(JSON.stringify(items)).not.toContain('U2');
  });

  it('reports kept and broken arrangements after settlement', () => {
    const kept = e.newsSubjects(settleWith('U2'));
    expect(kept.some((i: any) => i.kind === 'kept')).toBe(true);
    const broken = e.newsSubjects(settleWith('U1'));
    const item = broken.find((i: any) => i.kind === 'broken');
    expect(item).toBeTruthy();
    expect(item.quitters).toContain('美国政府');
  });

  it('keeps local copy numeric-free and bans only real clause names', () => {
    expect(e.NEWS_BANNED_TERMS).toContain('有限放宽管制');
    expect(e.NEWS_BANNED_TERMS).not.toContain('维持现状'); // ordinary wording stays usable
    const s = declare(fresh(5), { US: stance('controls', 'hawk') });
    for (const item of e.renderNewsFallback(s)) expect(/[0-9]/.test(item.headline + item.body)).toBe(false);
    for (const item of e.renderNewsFallback(settleWith('U1'))) expect(/[0-9]/.test(item.headline + item.body)).toBe(false);
  });

  it('illustrates every bulletin with artwork chosen here, never by the model', () => {
    const captions = (game: any) => e.renderNewsFallback(game);
    const stated = declare(fresh(5), { US: stance('controls', 'hawk') });
    const announced = captions(stated);
    expect(announced[0].image).toBe('controls'); // the issue of the statement
    expect(announced[0].caption).toBe('示意图 · 晶圆制造产线');
    let s = e.sendMessage(stated, 'US', { content: '交换条件', target: 'NL' });
    const talked = captions(ready(s));
    expect(talked[0].image).toBe('talks'); // closed-door contacts get the meeting room
    s = e.proposeDeal(stated, 'US', { commitments: { US: 'U2', NL: 'N3' }, text: '放宽换协调' });
    s = e.respondDeal(ready(s), 'NL', { dealId: 'd1', accept: true });
    expect(captions(ready(s))[0].image).toBe('talks');
    for (const item of captions(settleWith('U2'))) {
      expect(['controls', 'materials', 'licensing', 'enforcement', 'commerce', 'talks']).toContain(item.image);
      expect(item.caption).toBeTruthy();
      expect(/[0-9]/.test(item.caption)).toBe(false);
    }
  });

  it('hands the focus issue to the report the player actually reads', () => {
    const s = settleWith('U2');
    expect(s.reportHistory.at(-1).focusIssue).toBe('controls');
    for (const viewer of roles) {
      const report = e.getSnapshot(s, viewer).reportHistory.at(-1);
      expect(report.focusIssue).toBe('controls');
      expect(report.focusRole).toBe('US');
    }
  });

  it('trusts a counterpart you have already talked to a little more', () => {
    let s = declare(fresh(5), { US: stance('controls', 'hawk', 'redline') });
    const commitments = { US: 'U2', NL: 'N3', CN: 'PASS', AS: 'PASS' };
    const risk = e.pledgeRisk(s, 'NL', commitments);
    expect(risk).toBeGreaterThan(0);
    const net = (g:any) => { const x = e.dealScore(g, 'NL', commitments, risk); return x.utility - x.discount; };
    const cold = net(s);
    const talks = e.sendMessage(s, 'NL', { content: '愿就许可问题交换条件', target: 'US' });
    expect(e.hadContact(talks.messages, 'NL', 'US', talks.round)).toBe(true);
    expect(net(talks)).toBeGreaterThan(cold);
    expect(e.hadContact([{ round: 1, from: 'NL', to: 'US' }], 'NL', 'US', 3)).toBe(false); // too long ago
    expect(e.hadContact([{ round: 1, from: 'NL', to: 'CN' }], 'NL', 'US', 2)).toBe(false); // never talked
  });
});
