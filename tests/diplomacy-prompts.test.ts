import {describe,it,expect} from 'vitest';
// @ts-expect-error Server-only JavaScript module.
import {buildDiplomacyMessages} from '../server/diplomacy/prompts.mjs';
// @ts-expect-error Server-only engine.
import {createSimulation,applyAction,getObservation} from '../server/diplomacy/engine.mjs';

describe('grounded substantive diplomacy requests',()=>{
  it('uses role-projected context and does not leak private channels to other model requests',()=>{
    let state=createSimulation({mode:'live'});
    state=applyAction(state,{agent:'USA',action:'message',target:'Netherlands',proposal_id:null,content:'PRIVATE_CHANNEL_CANARY',reason:'磋商',is_public:false},'llm');
    const china=JSON.stringify(buildDiplomacyMessages(getObservation(state,'China')));
    const dutch=JSON.stringify(buildDiplomacyMessages(getObservation(state,'Netherlands')));
    expect(china).not.toContain('PRIVATE_CHANNEL_CANARY');expect(dutch).toContain('PRIVATE_CHANNEL_CANARY');
    for(const other of ['USA','Netherlands','ASML'])expect(china).not.toContain(state.privateNotes[other][0]);
    expect(china).toContain(state.privateNotes.China[0]);
  });
  it('keeps final-round authority and makes validator corrections specific without resending rejected output',()=>{
    const observation={role:{id:'ASML',name:'ASML 企业'},round:3,rounds:3,messages:[],proposals:[]};
    const messages=buildDiplomacyMessages(observation,'ASML不能签政府间协议');
    expect(messages).toHaveLength(3);expect(messages[2].content).toContain('ASML不能签政府间协议');
    expect(messages[1].content).toContain('"agent":"ASML"');expect(messages[1].content).toContain('"action":"decision"');
    expect(messages[0].content).toContain('不要输出、索取或保存隐藏思维链');
  });
});
