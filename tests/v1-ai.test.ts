import {describe,it,expect} from 'vitest';
// @ts-expect-error Server-only JavaScript module.
import {validateEnvelope,buildGameMessages} from '../server/v1/ai.mjs';
const obs={task:'polish',role:{id:'US',name:'美国政府'},round:1,ownPreference:{id:'US_SEC',label:'安全优先',blurb:'把封锁的真实强度放在第一位。',weights:{Teff:.5,A:.2,E:.1,LowP:.2}},originalText:'合作',legalActions:[{id:'U3'}]};
describe('V1 AI task boundaries',()=>{
 it('refuses newly added action promises, quantities, threats and conditions in polish',()=>{
  for(const candidate of ['我保证选择U3','合作，否则制裁','如果合作就保证交付','合作100台','合作三台设备','若先放宽才合作'])expect(validateEnvelope('polish',{candidate},obs).valid).toBe(false);
  expect(validateEnvelope('polish',{candidate:'希望讨论合作。'},obs).valid).toBe(true);
 });
 it('keeps the recorded claim identical when polishing a negotiation sentence',()=>{
  const offer={...obs,originalText:'关于「有限放宽管制」，我方愿意作出让步。'};
  // A prettier sentence that drops the attitude word would be recorded as a different claim.
  expect(validateEnvelope('polish',{candidate:'关于有限放宽管制，我方愿在互惠基础上作出相应调整。'},offer).valid).toBe(false);
  expect(validateEnvelope('polish',{candidate:'关于有限放宽管制，我方愿意在互惠基础上作出相应安排。'},offer).valid).toBe(true);
  const request={...obs,originalText:'希望贵方重新考虑「批准有限许可」。'};
  expect(validateEnvelope('polish',{candidate:'就批准有限许可一事，我方期待贵方重新评估。'},request).valid).toBe(true);
  expect(validateEnvelope('polish',{candidate:'就批准有限许可一事，我方不能接受。'},request).valid).toBe(false);
  expect(validateEnvelope('polish',{candidate:'就收紧技术管制与有限放宽管制，我方愿意一并讨论。'},offer).valid).toBe(false);
  expect(buildGameMessages(offer)[0].content).toContain('有限放宽管制');
 });
 it('limits negotiation messages and requires uncertainty on motive guesses',()=>{
  expect(validateEnvelope('negotiation',{messages:[{content:'字'.repeat(101),target:null}],proposal:null},obs).valid).toBe(false);
  expect(validateEnvelope('negotiation',{messages:[{content:'合法私聊',target:'US'}],proposal:null},obs).valid).toBe(false);
  expect(validateEnvelope('secretary',{otherRequests:[],possibleMotives:[{text:'我知道对方秘密目标',uncertain:false}],relevantActions:[],risks:[]},obs).valid).toBe(false);
 });
 it('prompts each task from supplied role projection and only permits legal action IDs',()=>{
  expect(validateEnvelope('action',{actionId:'C1'},obs).valid).toBe(false);expect(validateEnvelope('action',{actionId:'U3'},obs).valid).toBe(true);
  const messages=buildGameMessages({...obs,task:'action'});expect(messages[0].content).toContain('不能知道别人本轮已经选什么');expect(messages[0].content).toContain('不得声称知道对方隐藏偏好');expect(JSON.stringify(messages)).toContain('US_SEC');
 });
});
