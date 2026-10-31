import {describe,it,expect} from 'vitest';
// @ts-expect-error Server-only module.
import * as e from '../server/v1/engine.mjs';
const roles=['US','CN','NL','AS'];
const skipA=(s:any)=>s.phase==='announcement'?roles.reduce((s,r)=>e.declare(s,r,null),s):s;
const initial=(seed=1,draws={US:0,CN:0,NL:0,AS:0})=>skipA(e.createGame(draws,seed));
const ready=(s:any)=>roles.reduce((s,r)=>e.ready(s,r),s);
const actions=(s:any)=>{s=skipA(s);while(['negotiation','signing'].includes(s.phase))s=ready(s);return s;};
const run=(s:any,chosen:any={})=>roles.reduce((s,r)=>e.submitAction(s,r,chosen[r]||'PASS'),actions(s));
const say=(s:any,from:string,content:string,target:string|null=null)=>e.sendMessage(skipA(s),from,{content,target});
const sign=(s:any)=>{ // US proposes U2/C3, CN accepts; lands in actions phase with an effective deal.
  s=e.proposeDeal(s,'US',{commitments:{US:'U2',CN:'C3'},text:''});
  s=ready(s); // -> signing
  s=e.respondDeal(s,'CN',{dealId:s.deals[0].id,accept:true});
  return ready(s); // -> actions
};
describe('V1.6 type beliefs and signaling',()=>{
 it('starts at uniform 0.5 priors and exposes them per viewer',()=>{
  const s=initial();
  expect(s.beliefs.US).toEqual({CN:.5,NL:.5,AS:.5});
  expect(s.publicBeliefs).toEqual({US:.5,CN:.5,NL:.5,AS:.5});
  const snap=e.getSnapshot(s,'CN');
  expect(snap.beliefs).toEqual({US:.5,NL:.5,AS:.5});
  expect(snap.ownImage).toBe(.5);
  expect(snap.beliefs.CN).toBeUndefined();
 });
 it('classifies stances by open keyword rules',()=>{
  expect(e.classifyStance('我们愿意放宽许可、深化合作')).toBe('dove');
  expect(e.classifyStance('收紧管制是安全红线')).toBe('hawk');
  expect(e.classifyStance('你好')).toBeNull();
  expect(e.classifyStance('合作与安全并重')).toBeNull();
 });
// Likelihoods are read off the behavioural strategy σ(a|θ), so the numbers below are what that
// computation yields at the opening state — they move if the state, the weights or λ move.
 it('public statements move every listener and the public image',()=>{
  const s=say(initial(),'US','我们愿意放宽许可、深化合作');
  for(const o of ['CN','NL','AS'])expect(s.beliefs[o].US).toBeCloseTo(.48,6);
  expect(s.publicBeliefs.US).toBeCloseTo(.48,6);
  expect(s.beliefs.US.CN).toBe(.5); // speaker's own row untouched
  expect(s.messages[0].stance).toBe('dove');
 });
 it('private statements move only the recipient and stay out of the public image',()=>{
  const s=say(initial(),'CN','必须坚持自主与安全红线','NL');
  expect(s.beliefs.NL.CN).toBeCloseTo(.59,6); // hawk talk lifts the CN_TECH posterior
  expect(s.beliefs.US.CN).toBe(.5);
  expect(s.beliefs.AS.CN).toBe(.5);
  expect(s.publicBeliefs.CN).toBe(.5);
  expect(s.beliefLog).toHaveLength(0);
 });
 it('a costly public action is a stronger signal than keeping still',()=>{
  const s=run(initial(),{US:'U1'});
  for(const o of ['CN','NL','AS'])expect(s.beliefs[o].US).toBeCloseTo(.61,6);
  expect(s.publicBeliefs.US).toBeCloseTo(.61,6);
  // Standing pat carries whatever the strategy mass says about passing — real, but weak.
  expect(s.beliefs.CN.NL).toBeGreaterThan(.5);expect(s.beliefs.CN.NL).toBeLessThan(s.beliefs.CN.US);
  const shifts=s.reportHistory[0].beliefShifts;
  expect(shifts.some((x:any)=>x.target==='US'&&Math.abs(x.to-.61)<1e-9)).toBe(true);
 });
 it('hidden ASML actions emit no signal unless caught',()=>{
  const unseen=run(initial(),{AS:'S2'});
  for(const o of ['US','CN','NL'])expect(unseen.beliefs[o].AS).toBe(.5);
  let caught:any;
  for(let seed=0;seed<1000;seed++){const s=run(initial(seed),{AS:'S4'});if(s.randomRecords[0].caught){caught=s;break;}}
  for(const o of ['US','CN','NL'])expect(caught.beliefs[o].AS).toBeCloseTo(.54,6);
  expect(caught.publicBeliefs.AS).toBeCloseTo(.54,6);
 });
 it('fulfilled promises convince the signatories more than the room',()=>{
  const s=run(sign(initial()),{US:'U2',CN:'C3'});
  expect(s.deals[0].status).toBe('fulfilled');
  expect(s.beliefs.US.CN).toBeCloseTo(.23,6); // signatory knows which measure was delivered
  expect(s.beliefs.NL.CN).toBeCloseTo(.39,6); // the room only learns that something went right
  expect(s.beliefs.AS.CN).toBeCloseTo(.39,6);
  expect(s.publicBeliefs.CN).toBeCloseTo(.39,6);
  // Terms are private, so every outsider reaches exactly the public reading of the same conduct.
  expect(s.beliefs.NL.CN).toBe(s.publicBeliefs.CN);
  expect(Math.abs(s.beliefs.US.CN-.5)).toBeGreaterThan(Math.abs(s.beliefs.NL.CN-.5));
 });
 it('breach moves the signatory further than the room',()=>{
  const before=sign(initial());
  const s=run(before,{US:'U2',CN:'C1'});
  expect(s.deals[0].status).toBe('breached');
  expect(s.beliefs.US.CN).toBeCloseTo(.59,6);
  expect(s.beliefs.NL.CN).toBeCloseTo(.62,6);
  expect(s.publicBeliefs.CN).toBeCloseTo(.62,6);
  // Each observer started the round somewhere else — the signatory had read the signature — so
  // compare how far this round moved them, not where they happened to end up.
  expect(Math.abs(s.beliefs.US.CN-before.beliefs.US.CN)).toBeGreaterThan(Math.abs(s.beliefs.NL.CN-before.beliefs.NL.CN));
 });
 it('only signatories read the terms; the room reads the same conduct identically',()=>{
  // Same punishment served, different undertaking written down: the room must not be able to tell.
  const play=(promise:string)=>run((()=>{
   let s=e.proposeDeal(initial(),'US',{commitments:{US:'U2',CN:promise},text:''});
   s=ready(s);s=e.respondDeal(s,'CN',{dealId:s.deals[0].id,accept:true});return ready(s);
  })(),{US:'U2',CN:'C1'});
  const hard=play('C2'),soft=play('C3');
  expect(hard.deals[0].status).toBe('breached');expect(soft.deals[0].status).toBe('breached');
  expect(hard.beliefs.NL.CN).toBe(soft.beliefs.NL.CN); // an outsider sees one documented failure
  expect(hard.publicBeliefs.CN).toBe(soft.publicBeliefs.CN);
  expect(Math.abs(soft.beliefs.US.CN-hard.beliefs.US.CN)).toBeGreaterThan(.01); // the promise was named
 });
 it('keeps posteriors deterministic and clamped inside [0.05,0.95]',()=>{
  let s=initial(),previous=.5;
  for(let i=0;i<8;i++){
   s=say(s,'US','收紧管制是安全红线，必须执法');
   const settled=run(s,{US:'U1'});
   expect(settled.beliefs.CN.US).toBeGreaterThan(previous); // more hawk evidence every round
   previous=settled.beliefs.CN.US;
   if(settled.phase==='finished'){s=settled;break;}
   s=e.advanceRound(settled);
  }
  expect(previous).toBeGreaterThan(.7);expect(previous).toBeLessThanOrEqual(.95);
  expect(s.beliefLog.every((x:any)=>x.to>=.05&&x.to<=.95)).toBe(true);
 });
 it('fallback strategy predicts others from beliefs instead of assuming PASS',()=>{
  const base=initial(1,{US:1,CN:0,NL:0,AS:0}); // US drew US_ALLY
  const ally={...base,beliefs:{...base.beliefs,US:{...base.beliefs.US,NL:.9}}}; // NL expected to coordinate
  const trade={...base,beliefs:{...base.beliefs,US:{...base.beliefs.US,NL:.1}}}; // NL expected to go its own way
  expect(e.chooseFallbackAction(ally,'US')).toBe('U3');
  expect(e.chooseFallbackAction(trade,'US')).toBe('U1'); // then tighten alone
 });
 it('never leaks drawn preferences through projections, only the public catalogue',()=>{
  const s=run(sign(initial()),{US:'U2',CN:'C3'});
  const snap=e.getSnapshot(s,'NL');
  expect(snap.goals).toBeUndefined();
  expect(snap.prefs).toBeUndefined();
  expect(snap.revealedPreferences).toBeUndefined(); // only after finished
  expect(snap.roles.find((r:any)=>r.id==='US').possiblePreferences).toHaveLength(2); // public candidates stay visible
  expect(snap.ownPreference.role).toBe('NL');
  expect(snap.beliefs.US).toBeDefined();
  expect(snap.ownImage).toBeDefined();
 });
});
