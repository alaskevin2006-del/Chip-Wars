import { describe, expect, it } from 'vitest';
// @ts-expect-error Server-only module.
import * as e from '../server/v1/engine.mjs';
const roles = ['US', 'NL', 'CN', 'AS'] as const;
// A stance is not an action card: tests drive the announcement phase with explicit statements.
const skipA = (s: any) => s.phase === 'announcement' ? roles.reduce((s, r) => Object.hasOwn(s.statements, r) ? s : e.declare(s, r, null), s) : s;
const fresh = (seed = 1) => e.createGame({ US: 0, CN: 0, NL: 0, AS: 0 }, seed);
const say = (s: any, role: string, content: string, target: string | null = null) => e.sendMessage(s, role, { content, target });
const ready = (s: any) => roles.reduce((s, r) => e.ready(s, r), s);
const run = (s: any, a: any) => {
  s = skipA(s);
  while (['negotiation', 'signing'].includes(s.phase)) s = ready(s);
  return roles.reduce((s, r) => e.submitAction(s, r, a[r] || 'PASS'), s);
};
const stance = (issue: string, tone: string, level = 'pledge', target: string | null = null) =>
  ({ issue, tone, level, target, text: `${issue} ${tone} ${level}` });

describe('V1.6 position statements (issue-level semi-commitment)', () => {
  it('starts every game and every round in the announcement phase', () => {
    expect(fresh().phase).toBe('announcement');
    let s = fresh(3);
    for (let i = 0; i < 3; i++) { s = run(s, {}); s = e.advanceRound(s); expect(s.phase).toBe('announcement'); }
  });

  it('declares a stance on an issue, never an action card', () => {
    const s = e.declare(fresh(), 'US', stance('controls', 'hawk'));
    expect(s.statements.US.issue).toBe('controls');
    expect(s.statements.US.tone).toBe('hawk');
    expect(s.statements.US.level).toBe('pledge');
    // The action itself is still free: nothing said here constrains the action stage.
    expect(s.actions.US).toBeUndefined();
    expect(e.legalActions(s, 'US').some((c: any) => c.id === 'U2')).toBe(true);
  });

  it('rejects unknown issues, tones, levels and self-naming', () => {
    expect(() => e.declare(fresh(), 'US', stance('nonsense', 'hawk'))).toThrow(/议题无效/);
    expect(() => e.declare(fresh(), 'US', stance('controls', 'angry'))).toThrow(/姿态/);
    expect(() => e.declare(fresh(), 'US', stance('controls', 'hawk', 'vow'))).toThrow(/措辞强度/);
    expect(() => e.declare(fresh(), 'US', stance('controls', 'hawk', 'pledge', 'US'))).toThrow(/点名对象/);
    expect(() => e.declare(fresh(), 'US', { ...stance('controls', 'hawk'), text: '' })).toThrow(/正文/);
  });

  it('keeps US-first order and rejects duplicate statements', () => {
    expect(() => e.declare(fresh(), 'CN', stance('controls', 'hawk'))).toThrow(/美方先/);
    const s = e.declare(fresh(), 'US', stance('controls', 'hawk'));
    expect(() => e.declare(s, 'US', stance('licensing', 'dove'))).toThrow(/已发表/);
    expect(e.declare(s, 'CN', stance('licensing', 'dove')).statements.CN.issue).toBe('licensing');
  });

  it('scales the signal by commitment level: redline moves beliefs most', () => {
    const signal = e.declare(fresh(5), 'US', stance('controls', 'hawk', 'signal'));
    const pledge = e.declare(fresh(5), 'US', stance('controls', 'hawk', 'pledge'));
    const redline = e.declare(fresh(5), 'US', stance('controls', 'hawk', 'redline'));
    expect(signal.publicBeliefs.US).toBe(.51);
    expect(pledge.publicBeliefs.US).toBe(.52);
    expect(redline.publicBeliefs.US).toBe(.54);
  });

  it('naming a party sharpens the signal for them and dulls it for bystanders', () => {
    const s = e.declare(fresh(5), 'US', stance('controls', 'hawk', 'pledge', 'NL'));
    expect(s.beliefs.NL.US).toBeGreaterThan(s.beliefs.CN.US);
    expect(s.beliefs.CN.US).toBeLessThan(s.publicBeliefs.US);
    expect(s.publicBeliefs.US).toBe(.52); // the shared record uses the unnamed baseline
  });

  it('silence emits no signal and carries no audience cost', () => {
    const s = roles.reduce((s, r) => e.declare(s, r, null), fresh());
    expect(s.publicBeliefs.US).toBe(.5);
    const settled = run(s, { US: 'U1' });
    expect(settled.statementCred.US).toBe(1);
    expect(settled.reportHistory[0].statementChecks).toEqual([]);
  });

  it('rewards a stance the action kept, and punishes one the action broke', () => {
    const kept = run(e.declare(fresh(2), 'US', stance('controls', 'hawk')), { US: 'U1' });
    expect(kept.statementCred.US).toBe(1);
    const broke = run(e.declare(fresh(2), 'US', stance('controls', 'hawk')), { US: 'U2' });
    expect(broke.statementCred.US).toBe(.7);
    expect(broke.reportHistory[0].statementChecks[0].consistent).toBe(false);
  });

  it('punishes a broken red line harder than a broken signal', () => {
    expect(run(e.declare(fresh(2), 'US', stance('controls', 'hawk', 'signal')), { US: 'U2' }).statementCred.US).toBe(.85);
    expect(run(e.declare(fresh(2), 'US', stance('controls', 'hawk', 'redline')), { US: 'U2' }).statementCred.US).toBe(.55);
  });

  it('never checks a stance against action on another issue', () => {
    // A hawk stance on export controls says nothing about what happens on materials.
    const s = run(e.declare(fresh(2), 'US', stance('controls', 'hawk', 'redline')), { US: 'U1' });
    expect(s.statementCred.US).toBe(1);
    const free = run(e.declare(e.declare(fresh(2), 'US', null), 'CN', stance('materials', 'dove', 'redline')), { CN: 'C1' });
    expect(free.reportHistory[0].statementChecks[0].consistent).toBeUndefined();
    expect(free.statementCred.CN).toBe(1);
  });

  it('passing the buck only counts against pledges and red lines, not mere signals', () => {
    const signal = run(e.declare(fresh(2), 'US', stance('controls', 'hawk', 'signal')), { US: 'PASS' });
    expect(signal.reportHistory[0].statementChecks[0].consistent).toBeUndefined();
    expect(signal.statementCred.US).toBe(1);
    const pledge = run(e.declare(fresh(2), 'US', stance('controls', 'hawk', 'pledge')), { US: 'PASS' });
    expect(pledge.statementCred.US).toBe(.7);
  });

  it('credibility discounts the weight of later statements', () => {
    let s = run(e.declare(fresh(2), 'US', stance('controls', 'hawk')), { US: 'U2' }); // credibility .7
    s = e.advanceRound(s);
    const before = s.publicBeliefs.US;
    s = e.declare(s, 'US', stance('controls', 'hawk'));
    expect(s.publicBeliefs.US).toBeGreaterThan(before);
    expect(s.publicBeliefs.US - before).toBeLessThan(.04); // a credible speaker moves the posterior .04
  });

  it('a stance that a pledge contradicts makes the deal harder to accept', () => {
    // US publicly takes a hard line on controls, then offers to relax them: the pledge reads as hollow.
    const base = e.declare(fresh(11), 'US', stance('controls', 'hawk', 'redline'));
    const consistent = e.declare(fresh(11), 'US', stance('controls', 'dove', 'redline'));
    const commitments = { US: 'U2', NL: 'N3' };
    expect(e.pledgeRisk(base, 'NL', commitments)).toBeGreaterThan(e.pledgeRisk(consistent, 'NL', commitments));
    expect(e.pledgeRisk(base, 'NL', commitments)).toBe(.9);
    expect(e.pledgeRisk(consistent, 'NL', commitments)).toBe(0);
    // A stance on a different issue never taints the pledge.
    expect(e.pledgeRisk(e.declare(fresh(11), 'US', stance('materials', 'hawk', 'redline')), 'NL', commitments)).toBe(0);
  });

  it('shows signatories which clauses contradict a party’s public stance, and only them', () => {
    const offered = (statement: any) => {
      let s = e.declare(fresh(11), 'US', statement);
      for (const r of ['CN', 'NL', 'AS']) s = e.declare(s, r, null);
      return e.proposeDeal(s, 'US', { commitments: { US: 'U2', NL: 'N3' }, text: '放宽换协调' });
    };
    const hollow = offered(stance('controls', 'hawk', 'redline'));
    expect(e.getSnapshot(hollow, 'US').deals.at(-1).conflicts).toEqual([{ role: 'US', issue: 'controls', tone: 'hawk', level: 'redline' }]);
    expect(e.getSnapshot(hollow, 'NL').deals.at(-1).conflicts).toHaveLength(1);
    // Controls is the focus issue here (the US spoke first), so outsiders see the contradiction
    // without ever seeing the clause itself.
    const outsider = e.getSnapshot(hollow, 'CN').deals.at(-1);
    expect(outsider.commitments).toBeUndefined();
    expect(outsider.conflicts).toEqual([{ role: 'US', issue: 'controls', tone: 'hawk', level: 'redline' }]);
    expect(e.getSnapshot(offered(stance('controls', 'dove', 'redline')), 'US').deals.at(-1).conflicts).toBeUndefined();
    expect(e.getSnapshot(offered(stance('materials', 'hawk', 'redline')), 'US').deals.at(-1).conflicts).toBeUndefined();
  });

  it('lets the first speaker set the focus issue of the round', () => {
    let s = e.declare(fresh(3), 'US', stance('materials', 'hawk', 'pledge'));
    expect(s.focusIssue).toBe('materials');
    expect(s.focusRole).toBe('US');
    for (const r of ['CN', 'NL', 'AS']) s = e.declare(s, r, stance('controls', 'dove'));
    expect(s.focusIssue).toBe('materials'); // later speakers do not move the agenda
    // A contradiction off the focus issue stays between signatories.
    let off = e.declare(fresh(3), 'US', stance('materials', 'hawk', 'pledge')); // focus: materials
    off = e.declare(off, 'CN', null);
    off = e.declare(off, 'NL', stance('licensing', 'dove', 'pledge'));
    off = e.declare(off, 'AS', null);
    s = e.proposeDeal(off, 'NL', { commitments: { NL: 'N1', US: 'U1' }, text: '许可换管制' });
    expect(e.getSnapshot(s, 'US').deals.at(-1).conflicts).toEqual([{ role: 'NL', issue: 'licensing', tone: 'dove', level: 'pledge' }]);
    expect(e.getSnapshot(s, 'CN').deals.at(-1).conflicts).toBeUndefined();
    // Silence sets no agenda at all.
    const quiet = ['US', 'CN', 'NL', 'AS'].reduce((g, r) => e.declare(g, r, null), fresh(3));
    expect(quiet.focusIssue).toBeNull();
  });

  it('the fallback stance matches what the role is actually about to do', () => {
    const s = fresh(7);
    const statement = e.chooseFallbackStatement(s, 'US');
    expect(statement).not.toBeNull();
    const [issue, tone] = e.actionStance(e.chooseFallbackAction(s, 'US'));
    expect([statement.issue, statement.tone]).toEqual([issue, tone]);
    expect(statement.level).toBe('pledge');
    expect(e.declare(s, 'US', statement).statements.US.text).toContain('美国政府');
  });

  it('masks ASML conduct from outsiders while keeping its stance visible', () => {
    const withStance = e.declare(e.declare(e.declare(e.declare(fresh(4), 'US', null), 'CN', null), 'NL', null), 'AS', stance('commerce', 'dove'));
    const settled = run(withStance, { AS: 'S2' });
    const report = settled.reportHistory[0];
    expect(report.statementChecks[0].role).toBe('AS');
    const outsider = e.getSnapshot(settled, 'US').reportHistory.at(-1);
    expect(outsider.statementChecks[0].actual).toBe('hidden');
    expect(outsider.statementChecks[0].consistent).toBeUndefined();
    expect(e.getSnapshot(settled, 'AS').reportHistory.at(-1).statementChecks[0].actual).toBe('S2');
  });

  it('news subjects stay numeric-free and describe stances, not action cards', () => {
    let s = e.declare(fresh(8), 'US', stance('enforcement', 'hawk', 'redline', 'AS'));
    for (const r of ['CN', 'NL', 'AS']) s = e.declare(s, r, null);
    const items = e.renderNewsFallback(s);
    expect(items).toHaveLength(1);
    expect(items[0].headline).toContain('执法与灰色渠道');
    for (const item of items) expect(/[0-9]/.test(item.headline + item.body)).toBe(false);
    expect(JSON.stringify(items)).not.toContain('U4');
  });

  it('keeps statement handling deterministic', () => {
    const play = () => {
      let s = e.declare(fresh(9), 'US', stance('controls', 'hawk', 'redline'));
      for (const r of ['CN', 'NL', 'AS']) s = e.declare(s, r, null);
      for (let round = 1; round <= 4; round++) {
        s = run(s, { US: 'U1', CN: round < 4 ? 'C1' : 'PASS' });
        if (s.phase === 'finished') break;
        s = e.advanceRound(s);
        if (round < 4) { s = e.declare(s, 'US', stance('controls', 'hawk', 'redline')); for (const r of ['CN', 'NL', 'AS']) s = e.declare(s, r, null); }
      }
      return s;
    };
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });

  it('an ordinary negotiation message still emits its own cheap signal', () => {
    let s = skipA(fresh(6));
    s = say(s, 'US', '收紧管制是安全红线，必须执法');
    expect(s.publicBeliefs.US).toBeGreaterThan(.5);
    expect(s.messages.at(-1).stance).toBe('hawk');
  });
});
