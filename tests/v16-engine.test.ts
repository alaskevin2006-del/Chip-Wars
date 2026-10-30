import {describe,it,expect} from 'vitest';
// @ts-expect-error Server-only module.
import * as e from '../server/v1/engine.mjs';
const roles=['US','CN','NL','AS'];
const initial=(seed=1)=>e.createGame({US:0,CN:0,NL:0,AS:0},seed);
const ready=(s:any)=>roles.reduce((s,r)=>e.ready(s,r),s);
const actions=(s:any)=>{while(['negotiation','signing'].includes(s.phase))s=ready(s);return s;};
const run=(s:any,chosen:any={})=>roles.reduce((s,r)=>e.submitAction(s,r,chosen[r]||'PASS'),actions(s));
const withState=(s:any,state:any)=>({...s,state:{...s.state,...state},roundStart:{...s.roundStart,...state}});
const ids=(s:any,r:string)=>e.legalActions(s,r).map((a:any)=>a.id);
const find=(caught:boolean,setup=(s:any)=>s)=>{for(let seed=0;seed<1000;seed++){const s=run(setup(initial(seed)),{AS:'S4'});if(s.randomRecords[0].caught===caught)return s;}throw Error('seed not found');};
describe('V1.6 exact effects and stable random settlement',()=>{
 it('matches the three-party cooperation acceptance result and charges each linkage once',()=>{
  const s=run(initial(),{CN:'C3',NL:'N2',AS:'S1'});expect(s.state).toEqual({T:1,A:0,E:4.9,S:1,P:0});expect(s.reportHistory[0].effects.filter((x:any)=>x.rule==='N2+S1')).toHaveLength(1);
  const combined=run(initial(),{US:'U3',NL:'N3'});expect(combined.state.A).toBe(4);expect(combined.state.E).toBe(2.6);
 });
 it('material pressure does not directly lower T; only next-round existing pressure raises U1 cost',()=>{
  const same=run(initial(),{US:'U1',CN:'C2'});expect(same.state).toEqual({T:3.4,A:2,E:1.5,S:1,P:1});
  const first=run(initial(),{CN:'C2'});expect(first.state).toEqual({T:2,A:2,E:2.5,S:1,P:1});
  const second=run(e.advanceRound(first),{US:'U1'});expect(second.state.E).toBe(1);
 });
 it('delays research exactly once, allows three uses, and forbids round4 research',()=>{
  let s=initial();for(let round=1;round<=3;round++){s=run(s,{CN:'C1'});expect(s.state.S).toBe(round);expect(s.state.E).toBe(3-round*.5);s=e.advanceRound(s);expect(s.state.S).toBe(round+1);}
  expect(s.researchUses).toBe(3);expect(ids(s,'CN')).not.toContain('C1');expect(()=>e.submitAction(actions(s),'CN','C1')).toThrow();
 });
 it('checks N2/C4 eligibility strictly from roundStart and P combines once',()=>{
  const s=withState(initial(),{A:4,P:0});expect(ids(s,'NL')).not.toContain('N2');expect(ids(s,'CN')).not.toContain('C4');
  const next=run(s,{CN:'C3'});expect(next.state.A).toBe(3);expect(()=>e.submitAction(actions(s),'NL','N2')).toThrow();
  const pressure=run(withState(initial(),{P:1}),{US:'U2',CN:'C2'});expect(pressure.state.P).toBe(1);
  const relief=run(withState(initial(),{P:1}),{US:'U2',CN:'C4'});expect(relief.state.P).toBe(0);
 });
 it('uses roundStart leverage/buffer, sums before rounding and clamps just once',()=>{
  const s=run(withState(initial(),{T:4.9,A:2.5,E:4.9,S:3,P:1}),{US:'U1',NL:'N1',CN:'C3',AS:'S2'});
  expect(s.reportHistory[0].delta.T).toBe(4);expect(s.state).toEqual({T:5,A:2.5,E:4.3,S:3,P:1});
  const unclipped=run(withState(initial(),{E:4.9}),{US:'U1',AS:'S2'});expect(unclipped.state.E).toBe(4.4);
  const precise=run(withState(initial(),{A:2.3,T:1}),{US:'U1',NL:'N1'});expect(precise.state.T).toBe(3.9);
 });
 it('stores deterministic seeds/results once and replay does not redraw or mutate input',()=>{
  const s=initial(123),copy=structuredClone(s);const first=run(s,{US:'U3',AS:'S4'}),replay=run(s,{US:'U3',AS:'S4'});
  expect(s).toEqual(copy);expect(first).toEqual(replay);expect(e.resolveRound(first)).toBe(first);expect(first.randomRecords).toHaveLength(1);
  expect(first.randomRecords[0]).toHaveProperty('seed');expect(first.randomRecords[0]).toHaveProperty('probability');
 });
 it('computes grey risk from temporary A excluding the caught U4 bonus and adds enforcement',()=>{
  const s=run(withState(initial(3),{A:3}),{US:'U4',CN:'C3',NL:'N1',AS:'S4'});
  expect(s.randomRecords[0].probability).toBe(.8);if(s.randomRecords[0].caught)expect(s.state.A).toBe(3.5);
  const coordinated=run(initial(11),{US:'U3',NL:'N3',AS:'S4'});expect(coordinated.randomRecords[0].probability).toBe(.6);
 });
 it('merges caught credit penalties with breach before clamping; monitoring stacks once',()=>{
  let selected:any;
  for(let seed=0;seed<200;seed++){
   let s=initial(seed);s=e.proposeDeal(s,'AS',{commitments:{AS:'S2',US:'U2'},text:'private'});s=ready(s);s=e.respondDeal(s,'US',{dealId:'d1',accept:true});s=ready(s);s=run(s,{US:'U2',AS:'S4'});if(s.randomRecords[0].caught){selected=s;break;}
  }
  expect(selected).toBeDefined();expect(selected.credit.AS).toBe(0);expect(selected.credit.US).toBe(2);expect(selected.fulfilledDeals.US).toBe(0);expect(selected.monitoring).toBe(true);
  const next=e.advanceRound(selected);expect(next.state.T).toBe(Math.min(5,selected.state.T+1));expect(next.pendingPenalties).toHaveLength(0);
  const again=run(next,{AS:'S4'});expect(again.randomRecords[1].probability).toBeCloseTo(Math.min(1,.4+next.roundStart.A*.1));expect(again.monitoring).toBe(true);
 });
 it('charges final-round caught T penalty before victory rather than scheduling unreachable round5',()=>{
  const s=find(true,s=>({...withState(s,{T:3}),round:4}));expect(s.state.T).toBe(4);expect(s.pendingPenalties).toHaveLength(0);expect(s.phase).toBe('finished');expect(e.getSnapshot(s,'US').results.US.substantiveVictory).toBe(true);
 });
 it('supports both U3 random outcomes without drawing when coordination succeeds',()=>{
  const observed=new Set();for(let seed=0;seed<100;seed++)observed.add(run(initial(seed),{US:'U3'}).state.A);expect([...observed].sort()).toEqual([1,2]);
  expect(run(initial(0),{US:'U3',NL:'N3'}).randomRecords[0].backlash).toBe(false);
 });
});
describe('V1.6 private views, atomic agreements, victory and fallback',()=>{
 it.each(['S1','S2','PASS'])('hides AS %s in every non-owner report, source and effect',a=>{
  const s=run(initial(),{AS:a,NL:a==='S1'?'N2':'PASS'}),p=e.getSnapshot(s,'US'),r=p.reportHistory[0];expect(r.actions.AS).toBe('hidden');expect(r.sources.AS).toBeUndefined();expect(r.effects.some((x:any)=>x.rule===a||x.rule==='N2+S1')).toBe(false);expect(e.getSnapshot(s,'AS').reportHistory[0].actions.AS).toBe(a);expect(p.randomRecords).toBeUndefined();expect(p.seed).toBeUndefined();
 });
 it('uncaught grey delivery stays hidden; caught delivery is public without revealing seeds',()=>{
  const hidden=e.getSnapshot(find(false),'NL');expect(hidden.reportHistory[0].actions.AS).toBe('hidden');expect(JSON.stringify(hidden.reportHistory)).not.toContain('S4');
  const caught=e.getSnapshot(find(true),'NL');expect(caught.reportHistory[0].actions.AS).toBe('S4');expect(caught.reportHistory[0].randomRecord).toBeUndefined();expect(caught.goals).toBeUndefined();
 });
 it('keeps agreements and private messages participant-only at all nesting levels even at final',()=>{
  let s=initial();s=e.sendMessage(s,'CN',{content:'PRIVATE_MESSAGE',target:'AS'});s=e.proposeDeal(s,'CN',{commitments:{CN:'C3',AS:'S2'},text:'PRIVATE_TERMS'});s=ready(s);s=e.respondDeal(s,'AS',{dealId:'d1',accept:true});s=ready(s);s=run(s,{CN:'C3',AS:'S2'});
  while(s.phase!=='finished')s=run(e.advanceRound(s));
  for(const role of ['US','NL']){const p=e.getSnapshot(s,role);expect(JSON.stringify(p)).not.toContain('PRIVATE_MESSAGE');expect(JSON.stringify(p)).not.toContain('PRIVATE_TERMS');expect(p.deals[0].commitments).toBeUndefined();expect(p.reportHistory[0].deals[0].fulfillment).toBeUndefined();expect(p.deals[0].participants).toEqual(['CN','AS']);}
  const own=e.getSnapshot(s,'AS');expect(own.deals[0].commitments).toEqual({CN:'C3',AS:'S2'});expect(own.revealedGoals).toBeDefined();
 });
 it('prohibits mismatched roles, PASS/S4 promises and only locks at final consent',()=>{
  expect(()=>e.proposeDeal(initial(),'AS',{commitments:{AS:'N2',NL:'N2'},text:''})).toThrow();
  for(const action of ['S4','PASS'])expect(()=>e.proposeDeal(initial(),'AS',{commitments:{AS:action,NL:'N2'},text:''})).toThrow();
  let s=initial();s=e.proposeDeal(s,'US',{commitments:{US:'U2',CN:'C3',NL:'N2'},text:'a'});s=e.proposeDeal(s,'CN',{commitments:{CN:'C3',AS:'S2'},text:'b'});s=ready(s);s=e.respondDeal(s,'CN',{dealId:'d1',accept:true});s=e.respondDeal(s,'AS',{dealId:'d2',accept:true});s=e.respondDeal(s,'NL',{dealId:'d1',accept:true});expect(s.deals.map((d:any)=>d.status)).toEqual(['conflict','effective']);
 });
 it('effective T weakens security, credit gates substantive, deals and pressure gate diplomacy',()=>{
  let s={...withState(initial(),{T:5,S:4,P:2}),phase:'finished',fulfilledDeals:{US:1,CN:0,NL:0,AS:0}};let r=e.getSnapshot(s,'US').results.US;expect(r.effectiveT).toBe(4);expect(r.substantiveVictory).toBe(true);expect(r.diplomaticVictory).toBe(false);
  s={...s,state:{...s.state,P:1}};expect(e.getSnapshot(s,'US').results.US.diplomaticVictory).toBe(true);s={...s,credit:{...s.credit,US:0}};expect(e.getSnapshot(s,'US').results.US.substantiveVictory).toBe(false);
  const decimal={...withState(initial(),{T:4.1,S:2.2}),phase:'finished'};expect(e.getSnapshot(decimal,'US').results.US.effectiveT).toBe(4);expect(e.getSnapshot(decimal,'US').results.US.substantiveVictory).toBe(true);
 });
 it('fallback honors a legal promise first and considers delayed C1, without hidden choices/RNG/goals',()=>{
  let s=initial();expect(e.chooseFallbackAction(s,'CN')).toBe('C1');const first=e.chooseFallbackAction(s,'US');const changed={...s,seed:222,roundSeed:999,actions:{CN:'C2',AS:'S4'},goals:{...s.goals,CN:e.GOAL_CATALOGUE.CN[1]}};expect(e.chooseFallbackAction(changed,'US')).toBe(first);
  s=e.proposeDeal(s,'US',{commitments:{US:'U2',NL:'N2'},text:''});s=ready(s);s=e.respondDeal(s,'NL',{dealId:'d1',accept:true});s=ready(s);expect(e.chooseFallbackAction(s,'US')).toBe('U2');s=e.submitAction(s,'US','U2','fallback');expect(s.actionSources.US).toBe('fallback');
 });
 it('every projected role observation contains only own actual goal and no current opponents actions',()=>{
  let s=actions(initial());s=e.submitAction(s,'AS','S4');for(const role of roles){const p=e.getObservation(s,role);expect(p.ownGoal.role).toBe(role);expect(p.goals).toBeUndefined();expect(p.actions).toBeUndefined();expect(p.randomRecords).toBeUndefined();expect(p.rules.version).toBe('1.6');if(role!=='AS')expect(p.ownAction).toBeUndefined();}
 });
});
