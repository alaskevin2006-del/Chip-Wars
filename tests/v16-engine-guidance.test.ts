import {describe,it,expect} from 'vitest';
// @ts-expect-error Pure server module.
import * as e from '../server/v1/engine.mjs';
const roles=['US','CN','NL','AS'];
const initial=(seed=1)=>e.createGame({US:0,CN:0,NL:0,AS:0},seed);
const ready=(s:any)=>roles.reduce((s,r)=>e.ready(s,r),s);
const run=(s:any,a:any)=>{while(['negotiation','signing'].includes(s.phase))s=ready(s);return roles.reduce((s,r)=>e.submitAction(s,r,a[r]||'PASS'),s);};
const start=(state:any)=>{const s=initial();return {...s,state:{...s.state,...state},roundStart:{...s.roundStart,...state}};};
describe('guided previews and exact public reconciliation',()=>{
 it.each([[0,1,-1],[1,1,-1.5],[0,3,-.5],[1,3,-1]])('U1 costs use roundStart P%s/S%s in BOTH effects and totals', (P,S,cost)=>{
  const s=run(start({P,S}),{US:'U1',CN:'C2'}),r=e.getSnapshot(s,'US').reportHistory[0],u=r.effects.find((x:any)=>x.rule==='U1');
  expect(u.delta.E).toBe(cost);expect(s.state.E).toBe(3+cost-.5);expect(u.description).toContain(`轮初国内压力${P}`);expect(u.description).toContain(P===0?'未增加材料压力成本':'另增加0.5商业成本');
  const p=e.previewAction(start({P,S}),'US','U1');expect(p.branches[0].delta.E).toBe(cost);
 });
 it.each(['S1','S2','S4','PASS'])('public residual and adjustment reconcile %s without naming its hidden action',(AS)=>{
  const s=run(start({T:4.9,E:4.9,P:0}),{US:'U2',CN:'C3',AS}),r=e.getSnapshot(s,'US').reportHistory[0];
  for(const k of ['T','A','E','S','P']){
   const raw=r.effects.reduce((n:number,x:any)=>n+(x.delta[k]||0),0);expect(raw).toBeCloseTo(r.delta[k],10);expect(r.roundStart[k]+raw+r.adjustment[k]).toBeCloseTo(r.state[k],10);
  }
  if(r.actions.AS==='hidden'){const residual=r.effects.filter((x:any)=>x.rule==='UNDISCLOSED');expect(residual).toHaveLength(1);expect(residual[0].description).not.toMatch(/S[124]|灰色|订单|其他市场/);}
 });
 it('previews reuse settlement effects, show conditional cooperation, and keep research delayed',()=>{
  const s=initial(),u=e.previewAction(s,'US','U1').branches[0];expect(u.state).toEqual(run(s,{US:'U1'}).state);
  const n=e.previewAction(s,'NL','N2');expect(n.branches[0].state).toEqual(run(s,{NL:'N2',AS:'S1'}).state);expect(n.branches[1].state).toEqual(run(s,{NL:'N2'}).state);
  const a=e.previewAction(s,'AS','S1');expect(a.branches[0].state).toEqual(n.branches[0].state);
  const coordination=e.previewAction(s,'US','U3');expect(coordination.branches[0].state).toEqual(run(s,{US:'U3',NL:'N3'}).state);expect(coordination.branches.slice(1).map((x:any)=>x.probability)).toEqual([.7,.3]);
  const c=e.previewAction(s,'CN','C1').branches[0];expect(c.state.S).toBe(1);expect(c.delta.E).toBe(-.5);expect(c.delayed).toEqual([{metric:'S',amount:1,when:'下一回合开始'}]);
 });
 it('S4 risk scenarios reflect baseline assumptions, never seeded future outcomes',()=>{
  const base=initial(),preview=e.previewAction(base,'AS','S4');expect(preview.riskIsEstimate).toBe(true);expect(preview.branches[0].probability).toBeCloseTo(.4);expect(preview.branches[0].creditDelta).toBe(-1);expect(preview.branches[0].delayed[0].metric).toBe('T');
  const altered={...base,seed:999,roundSeed:123,actions:{US:'U4',CN:'C2',NL:'N1'},goals:{...base.goals,US:e.GOAL_CATALOGUE.US[1]}};
  expect(e.previewAction(altered,'AS','S4')).toEqual(preview);
  for(const caught of [true,false]){let settled;for(let seed=0;seed<1000;seed++){const s=run(initial(seed),{AS:'S4'});if(s.randomRecords[0].caught===caught){settled=s;break;}}expect(preview.branches[caught?0:1].state).toEqual(settled.state);}
 });
 it('snapshot preview contains own legal cards and no action/seed/private goal read-through',()=>{
  const s=initial(),p=e.getSnapshot(s,'CN');expect(p.actionPreviews.map((x:any)=>x.actionId)).toEqual(e.legalActions(s,'CN').map((x:any)=>x.id));expect(p.actionPreviews.some((x:any)=>x.actionId==='C4')).toBe(false);
  const changed={...s,actions:{US:'U4',AS:'S4'},seed:100,roundSeed:987,goals:{...s.goals,AS:e.GOAL_CATALOGUE.AS[1]}};
  expect(e.getSnapshot(changed,'CN').actionPreviews).toEqual(p.actionPreviews);expect(JSON.stringify(p.actionPreviews)).not.toMatch(/seed|roundSeed|AS_GLOBAL|AS_CN/);
 });
});
describe('deterministic signing responses',()=>{
 it('accepts beneficial visible cooperation, rejects worsening trades, and changes no state',()=>{
  let s=initial();s=e.proposeDeal(s,'US',{commitments:{US:'U3',NL:'N3'},text:'VISIBLE'});s=ready(s);const before=structuredClone(s);expect(e.chooseFallbackResponses(s,'NL')).toEqual([{dealId:'d1',accept:true}]);expect(s).toEqual(before);
  let bad=initial();bad=e.proposeDeal(bad,'US',{commitments:{US:'U1',NL:'N1'},text:''});bad=ready(bad);expect(e.chooseFallbackResponses(bad,'NL')).toEqual([{dealId:'d1',accept:false}]);
 });
 it('selects at most one beneficial invitation in creation order and cannot bypass effective locks',()=>{
  let s=initial();s=e.proposeDeal(s,'US',{commitments:{US:'U3',NL:'N3'},text:''});s=e.proposeDeal(s,'AS',{commitments:{AS:'S2',NL:'N1'},text:''});s=ready(s);
  const responses=e.chooseFallbackResponses(s,'NL');expect(responses).toEqual([{dealId:'d1',accept:true},{dealId:'d2',accept:false}]);for(const r of responses)s=e.respondDeal(s,'NL',r);expect(s.deals.map((d:any)=>d.status)).toEqual(['effective','rejected']);
  let locked=initial();locked=e.proposeDeal(locked,'US',{commitments:{US:'U3',CN:'C3'},text:'OTHER_PRIVATE'});locked=e.proposeDeal(locked,'AS',{commitments:{AS:'S2',NL:'N1',US:'U3'},text:''});locked=ready(locked);locked=e.respondDeal(locked,'CN',{dealId:'d1',accept:true});expect(e.chooseFallbackResponses(locked,'NL')).toEqual([{dealId:'d2',accept:false}]);
 });
 it('does not use hidden other goals, sealed choices or upcoming rolls for signing',()=>{
  let s=initial();s=e.proposeDeal(s,'US',{commitments:{US:'U3',NL:'N3'},text:''});s=ready(s);
  const changed={...s,seed:222,roundSeed:999,actions:{US:'U1',AS:'S4'},goals:{...s.goals,US:e.GOAL_CATALOGUE.US[1],CN:e.GOAL_CATALOGUE.CN[1]}};expect(e.chooseFallbackResponses(changed,'NL')).toEqual(e.chooseFallbackResponses(s,'NL'));
 });
});
