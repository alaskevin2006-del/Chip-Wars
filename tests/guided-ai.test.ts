import {describe,it,expect} from 'vitest';
// @ts-expect-error Server-only JavaScript module.
import * as engine from '../server/v1/engine.mjs';
// @ts-expect-error Server-only JavaScript module.
import {buildDecisionBrief,buildGameMessages} from '../server/v1/ai.mjs';
// @ts-expect-error Server-only JavaScript module.
import {createProvider} from '../server/diplomacy/provider.mjs';
describe('grounded negotiation decision context',()=>{
 it('summarizes goal gaps, actual visible requests, capped metrics and conditional options without private data',()=>{
  let state=engine.createGame({US:1,CN:0,NL:0,AS:0},123);
  state={...state,state:{T:3,A:3,E:5,S:1,P:0},roundStart:{T:3,A:3,E:5,S:1,P:0}};
  state=engine.sendMessage(state,'CN',{content:'PRIVATE_OTHER_CHANNEL',target:'AS'});
  state=engine.sendMessage(state,'NL',{content:'愿意配合贵方争取协调。',target:'US'});
  state=engine.proposeDeal(state,'CN',{commitments:{CN:'C3',AS:'S1'},text:'PRIVATE_OTHER_TERMS'});
  const observation={...engine.getObservation(state,'US'),task:'action'};const brief=buildDecisionBrief(observation);
  expect(brief.goalProgress.find((g:any)=>g.metric==='A').gap).toBe(1);expect(brief.atBoundary).toContainEqual({metric:'E',value:5});expect(brief.currentMessages[0].content).toContain('配合');expect(brief.options.find((p:any)=>p.actionId==='U3').branches.length).toBe(3);
  expect(JSON.stringify(brief)).not.toMatch(/PRIVATE_OTHER_CHANNEL|PRIVATE_OTHER_TERMS|roundSeed|AS_CN|CN_TECH/);
  const opposite=structuredClone(observation);opposite.messages[0].content='本轮不配合美方协调。';expect(buildDecisionBrief(opposite).currentMessages).not.toEqual(brief.currentMessages);
  const prompt=buildGameMessages({...observation,decisionBrief:brief});expect(prompt[0].content).toContain('仍最优时允许重复');expect(prompt[0].content).toContain('不能无视可见谈判');
 });
 it('refreshes projected context before a malformed-response retry rather than reusing stale invitations',async()=>{
  const seen:any[]=[];let revision=1;
  const provider=createProvider({env:{DEEPSEEK_API_KEY:'test-key-not-real',LLM_DAILY_LIMIT:'unlimited'},buildMessages:(o:any)=>[{role:'user',content:JSON.stringify(o)}],fetchImpl:async(_url:string,init:RequestInit)=>{seen.push(JSON.parse(String(init.body)));revision++;return new Response(JSON.stringify({choices:[{message:{content:seen.length===1?'bad json':'{"responses":[]}'}}]}));}});
  const result=await provider.decide({version:0},()=>({valid:true}),undefined,()=>({version:revision,visibleInvites:revision===1?['closed-on-retry']:[]}));
  expect(result).toEqual({responses:[]});expect(seen).toHaveLength(2);expect(JSON.parse(seen[0].messages[0].content)).toEqual({version:1,visibleInvites:['closed-on-retry']});expect(JSON.parse(seen[1].messages[0].content)).toEqual({version:2,visibleInvites:[]});
 });
});
