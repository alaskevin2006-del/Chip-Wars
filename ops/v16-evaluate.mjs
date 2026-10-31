// Offline rule/fallback evaluation only: no provider, credentials, HTTP or balance claims.
import assert from 'node:assert/strict';
import * as game from '../server/v1/engine.mjs';
const roles=game.ROLE_IDS;
// Fixed legal witnesses discovered by a bounded action-sequence search. They prove
// existence of wins under specified choices, not optimal strategies or fair odds.
const witnesses=[
 {"goal":"CN_TRADE","seed":1,"draws":{"US":0,"CN":1,"NL":0,"AS":0},"actions":[{"US":"U2","CN":"PASS","NL":"N3","AS":"S1"},{"US":"U4","CN":"PASS","NL":"PASS","AS":"PASS"},{"US":"U1","CN":"C2","NL":"N2","AS":"S4"},{"US":"U2","CN":"C4","NL":"N3","AS":"S2"}],"agreement":{"round":3,"target":"CN","commitments":{"CN":"C2","US":"U1"}},"expectedFinal":{"T":1.4,"A":1,"E":4.8,"S":1,"P":0}},
 {"goal":"NL_TRADE","seed":1,"draws":{"US":0,"CN":0,"NL":1,"AS":0},"actions":[{"US":"U2","CN":"PASS","NL":"N3","AS":"S1"},{"US":"U4","CN":"PASS","NL":"PASS","AS":"PASS"},{"US":"U1","CN":"C2","NL":"N2","AS":"S4"},{"US":"U2","CN":"C4","NL":"N3","AS":"S2"}],"agreement":{"round":1,"target":"NL","commitments":{"NL":"N3","US":"U2"}},"expectedFinal":{"T":1.4,"A":1,"E":4.8,"S":1,"P":0}},
 {"goal":"US_SEC","seed":2,"draws":{"US":0,"CN":0,"NL":0,"AS":0},"actions":[{"US":"U1","CN":"C2","NL":"PASS","AS":"S1"},{"US":"U3","CN":"C3","NL":"N1","AS":"PASS"},{"US":"U4","CN":"C4","NL":"PASS","AS":"S4"},{"US":"U1","CN":"PASS","NL":"N1","AS":"S2"}],"agreement":{"round":1,"target":"US","commitments":{"US":"U1","CN":"C2"}},"expectedFinal":{"T":5,"A":3.5,"E":0,"S":1,"P":0}},
 {"goal":"CN_TECH","seed":5,"draws":{"US":0,"CN":0,"NL":0,"AS":0},"actions":[{"US":"U2","CN":"C1","NL":"N2","AS":"S4"},{"US":"U3","CN":"C3","NL":"N1","AS":"S2"},{"US":"PASS","CN":"C1","NL":"N2","AS":"S1"},{"US":"U3","CN":"PASS","NL":"PASS","AS":"S4"}],"agreement":{"round":1,"target":"CN","commitments":{"CN":"C1","US":"U2"}},"expectedFinal":{"T":0.2,"A":0,"E":5,"S":3,"P":0}},
 {"goal":"US_ALLY","seed":6,"draws":{"US":1,"CN":0,"NL":0,"AS":0},"actions":[{"US":"U3","CN":"C3","NL":"N3","AS":"S1"},{"US":"U3","CN":"C3","NL":"N3","AS":"S1"},{"US":"U4","CN":"C3","NL":"PASS","AS":"PASS"},{"US":"PASS","CN":"C2","NL":"N1","AS":"S1"}],"agreement":{"round":1,"target":"US","commitments":{"US":"U3","CN":"C3"}},"expectedFinal":{"T":3.6,"A":4,"E":0,"S":1,"P":1}},
 {"goal":"NL_ALLY","seed":51,"draws":{"US":0,"CN":0,"NL":0,"AS":0},"actions":[{"US":"U2","CN":"C3","NL":"N3","AS":"S1"},{"US":"PASS","CN":"PASS","NL":"N1","AS":"S2"},{"US":"U2","CN":"C2","NL":"PASS","AS":"S2"},{"US":"U3","CN":"C2","NL":"N3","AS":"PASS"}],"agreement":{"round":1,"target":"NL","commitments":{"NL":"N3","US":"U2"}},"expectedFinal":{"T":3.2,"A":4,"E":3,"S":1,"P":1}},
 {"goal":"AS_CN","seed":128,"draws":{"US":0,"CN":0,"NL":0,"AS":0},"actions":[{"US":"U3","CN":"C3","NL":"N3","AS":"PASS"},{"US":"U2","CN":"C1","NL":"N2","AS":"S1"},{"US":"U4","CN":"C2","NL":"PASS","AS":"S2"},{"US":"U2","CN":"PASS","NL":"N1","AS":"PASS"}],"agreement":{"round":2,"target":"AS","commitments":{"AS":"S1","US":"U2"}},"expectedFinal":{"T":1.4,"A":3,"E":4.3,"S":2,"P":0}},
 {"goal":"AS_GLOBAL","seed":189,"draws":{"US":0,"CN":0,"NL":0,"AS":1},"actions":[{"US":"U3","CN":"C1","NL":"N3","AS":"S2"},{"US":"U4","CN":"C1","NL":"N1","AS":"S2"},{"US":"U2","CN":"C2","NL":"N3","AS":"S2"},{"US":"U2","CN":"C3","NL":"PASS","AS":"S4"}],"agreement":{"round":1,"target":"AS","commitments":{"AS":"S2","US":"U3"}},"expectedFinal":{"T":3,"A":4,"E":5,"S":3,"P":0}}
];

function round(state, actions, agreement) {
 if(agreement)state=game.proposeDeal(state,agreement.target,{commitments:agreement.commitments,text:'Offline current-round commitment witness'});
 for(const role of roles)state=game.ready(state,role);
 if(agreement)for(const role of Object.keys(agreement.commitments))if(role!==agreement.target)state=game.respondDeal(state,role,{dealId:state.deals.at(-1).id,accept:true});
 if(agreement)assert.equal(state.deals.at(-1).status,'effective');
 for(const role of roles)state=game.ready(state,role);
 for(const role of roles){assert.ok(game.legalActions(state,role).some(card=>card.id===actions[role]));state=game.submitAction(state,role,actions[role],'fallback');}
 return state;
}
function replay(witness) {
 let state=game.createGame(witness.draws,witness.seed);
 for(let n=1;n<=4;n++){
  state=round(state,witness.actions[n-1],witness.agreement.round===n?witness.agreement:undefined);
  assert.equal(game.resolveRound(state,n),state,'settlement must remain idempotent');
  if(n<4)state=game.advanceRound(state);
 }
 const role=witness.agreement.target,result=game.getSnapshot(state,role).results[role];
 assert.equal(result.goal.id,witness.goal);assert.equal(result.diplomaticVictory,true);assert.equal(result.substantiveVictory,true);
 assert.ok(result.credit>=1);assert.ok(result.fulfilledDeals>=1);assert.deepEqual(state.state,witness.expectedFinal);
 if(role==='US')assert.ok(state.state.P<=1);
 return {goal:witness.goal,seed:witness.seed,final:state.state,credit:result.credit,fulfilledDeals:result.fulfilledDeals};
}
const witnessResults=witnesses.map(w=>{const first=replay(w);assert.deepEqual(replay(w),first,'fixed seeds/actions must replay identically');return first;});
const counts=Object.fromEntries(Object.values(game.GOAL_CATALOGUE).flat().map(goal=>[goal.id,{played:0,substantive:0,diplomatic:0}]));
const finals=new Set();let greyActions=0;
// Exactly 16 complete goal profiles x 16 seeds, without speech or agreements.
// These agents use deterministic one-step fallback, not real LLM negotiation.
for(let mask=0;mask<16;mask++)for(let seed=1;seed<=16;seed++){
 const draws=Object.fromEntries(roles.map((role,i)=>[role,(mask>>i)&1]));let state=game.createGame(draws,seed);
 for(let n=1;n<=4;n++){
  const actions=Object.fromEntries(roles.map(role=>[role,game.chooseFallbackAction(state,role)]));
  if(actions.AS==='S4')greyActions++;
  state=round(state,actions);if(n<4)state=game.advanceRound(state);
 }
 const results=game.getSnapshot(state,'US').results;
 for(const role of roles){const r=results[role],c=counts[r.goal.id];c.played++;c.substantive+=Number(r.substantiveVictory);c.diplomatic+=Number(r.diplomaticVictory);}
 finals.add(JSON.stringify(state.state));
}
let state=game.createGame({US:0,CN:0,NL:0,AS:0},1);
const before=game.chooseFallbackAction(state,'US');
state=game.proposeDeal(state,'US',{commitments:{US:'U2',CN:'C3'},text:'Visible own promise changes fallback'});
for(const role of roles)state=game.ready(state,role);
state=game.respondDeal(state,'CN',{dealId:state.deals.at(-1).id,accept:true});
const after=game.chooseFallbackAction(state,'US');assert.equal(after,'U2');assert.notEqual(before,after);
console.log(JSON.stringify({kind:'offline seeded engine/fallback evaluation; not real-AI balance validation',witnesses:witnessResults,fallbackGames:256,goalCounts:counts,uniqueFinalStates:finals.size,greyActions,asRoundChoices:1024,promiseEffect:{before,after},limitations:['Fixed witnesses establish reachability only.','The fallback is a myopic rule strategy and these outcomes do not estimate real-AI win rates.','No-talk sample has no agreements, therefore diplomatic victories must be zero.','Observed fallback distribution is strongly US-skewed; supplied coefficients were not adjusted.']},null,2));
