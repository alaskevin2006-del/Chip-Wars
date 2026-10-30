import {describe,it,expect} from 'vitest';
// @ts-expect-error Server-only JavaScript module.
import {validateEnvelope,buildGameMessages} from '../server/v1/ai.mjs';
const obs={task:'polish',role:{id:'US',name:'美国政府'},round:1,ownGoal:{id:'US_SEC'},originalText:'合作',legalActions:[{id:'U3'}]};
describe('V1 AI task boundaries',()=>{
 it('refuses newly added action promises, quantities, threats and conditions in polish',()=>{
  for(const candidate of ['我保证选择U3','合作，否则制裁','如果合作就保证交付','合作100台','合作三台设备','若先放宽才合作'])expect(validateEnvelope('polish',{candidate},obs).valid).toBe(false);
  expect(validateEnvelope('polish',{candidate:'希望讨论合作。'},obs).valid).toBe(true);
 });
 it('limits negotiation messages and requires uncertainty on motive guesses',()=>{
  expect(validateEnvelope('negotiation',{messages:[{content:'字'.repeat(101),target:null}],proposal:null},obs).valid).toBe(false);
  expect(validateEnvelope('negotiation',{messages:[{content:'合法私聊',target:'US'}],proposal:null},obs).valid).toBe(false);
  expect(validateEnvelope('secretary',{otherRequests:[],possibleMotives:[{text:'我知道对方秘密目标',uncertain:false}],relevantActions:[],risks:[]},obs).valid).toBe(false);
 });
 it('prompts each task from supplied role projection and only permits legal action IDs',()=>{
  expect(validateEnvelope('action',{actionId:'C1'},obs).valid).toBe(false);expect(validateEnvelope('action',{actionId:'U3'},obs).valid).toBe(true);
  const messages=buildGameMessages({...obs,task:'action'});expect(messages[0].content).toContain('不能知道别人本轮已经选什么');expect(messages[0].content).toContain('不得声称知道对方隐藏目标');expect(JSON.stringify(messages)).toContain('US_SEC');
 });
});
