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
  const messages=buildGameMessages({...obs,task:'action'});expect(messages[0].content).toContain('不能知道尚未行动角色本轮会选什么');expect(messages[0].content).toContain('不得声称知道对方隐藏偏好');expect(JSON.stringify(messages)).toContain('US_SEC');
 });
 it('tailors secretary guidance to the current phase and falls back to negotiation',()=>{
  const secretary=(phase?:string)=>buildGameMessages({...obs,task:'secretary',...(phase?{phase}:{})})[0].content;
  expect(secretary('announcement')).toContain('当前是公开宣示阶段');
  expect(secretary('signing')).toContain('当前是签约阶段');
  expect(secretary('actions')).toContain('当前是实际措施阶段');
  expect(secretary('report')).toContain('当前是战报阶段');
  expect(secretary('negotiation')).toContain('当前是闭门磋商阶段');
  // Missing or unknown phase keeps the negotiation template so prompts stay analyzable.
  expect(secretary(undefined)).toContain('当前是闭门磋商阶段');
  expect(secretary('mystery')).toContain('当前是闭门磋商阶段');
  // Phase-specific guidance must not leak into other phases' prompts. The system rules mention every
  // phase by name, so the assertion targets the guidance prefix instead of the bare phase word.
  expect(secretary('signing')).not.toContain('当前是公开宣示阶段');
  expect(secretary('announcement')).not.toContain('当前是签约阶段');
 });
 it('accepts a short reason on a stance and switches to drafting when no sentence is given',()=>{
  const declareObs={...obs,task:'declare',issues:['controls','licensing']};
  const stance={issue:'licensing',tone:'dove',level:'pledge',target:null,text:'我方愿意就设备许可与各方保持沟通。'};
  expect(validateEnvelope('declare',stance,declareObs).valid).toBe(true);
  expect(validateEnvelope('declare',{...stance,reason:'落在设备许可议题。'},declareObs).valid).toBe(true);
  // The reason is advice for the player, so it is optional but never unbounded.
  expect(validateEnvelope('declare',{...stance,reason:'字'.repeat(41)},declareObs).valid).toBe(false);
  const drafted=buildGameMessages({...declareObs,originalText:undefined})[0].content;
  expect(drafted).toContain('代拟');
  expect(drafted).toContain('判定理由');
  // Rewording an existing sentence uses the other branch; a blank draft must not claim to polish one.
  expect(buildGameMessages({...declareObs,originalText:'荷兰应保持自主'})[0].content).toContain('把玩家的原始措辞转成');
 });
});
