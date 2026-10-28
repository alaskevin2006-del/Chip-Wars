import {describe,it,expect} from 'vitest';
// @ts-expect-error Runtime-only server module deliberately has no browser declaration.
import {createSimulation,getObservation,validateAction,applyAction,skipAction,getSnapshot} from '../server/diplomacy/engine.mjs';
// @ts-expect-error Runtime-only server demo module.
import {decideDemo} from '../server/diplomacy/demo.mjs';

const action=(agent:string,extra:Record<string,unknown>={})=>({agent,action:'statement',target:null,content:'公开示例立场。',proposal_id:null,reason:'简短说明。',is_public:true,...extra});
const advance=(state:any)=>applyAction(state,decideDemo(getObservation(state,state.actor)),state.actor===state.player?'player':state.mode==='demo'?'demo':'llm');
const seek=(state:any,actor:string)=>{while(state.actor!==actor&&state.status!=='completed')state=advance(state);return state;};

describe('Chip Diplomacy isolated four-role engine',()=>{
  it('completes every supported round count and every player using valid independently scheduled slots',()=>{
    for(const rounds of [1,2,3,4,5])for(const player of [null,'USA','China','Netherlands','ASML']) {
      let state=createSimulation({rounds,player});
      while(state.status!=='completed') {
        if(state.actor===player)expect(state.status).toBe('awaiting_player');
        state=advance(state);
      }
      expect(state.version).toBe(rounds*4);
      expect(state.messages).toHaveLength(rounds*4);
      expect(Object.keys(state.decisions)).toEqual(['USA','China','Netherlands','ASML']);
      expect(state.actor).toBeNull();
      expect(state.round).toBe(rounds);
    }
  });

  it('does not mutate inputs or let consumers mutate snapshots and observations',()=>{
    const state=createSimulation();const original=structuredClone(state);
    const next=advance(state);expect(state).toEqual(original);expect(next).not.toBe(state);
    const snapshot=getSnapshot(next);snapshot.messages[0].content='changed';snapshot.roles[0].name='changed';
    expect(next.messages[0].content).not.toBe('changed');expect(next.roles[0].name).not.toBe('changed');
    const observation=getObservation(next,'China');observation.scenario.assumptions.push('changed');
    expect(next.scenario.assumptions).not.toContain('changed');
  });

  it('hides private messages and private notes from other agents and public spectators',()=>{
    let state=createSimulation({player:'China'});
    state=applyAction(state,action('USA',{action:'message',target:'Netherlands',is_public:false,content:'PRIVATE_CHANNEL_CANARY'}),'demo');
    for(const role of ['China','ASML']) {
      const observation=getObservation(state,role);
      expect(JSON.stringify(observation)).not.toContain('PRIVATE_CHANNEL_CANARY');
      expect(Object.keys(observation.role)).toContain('private_notes');
      for(const other of ['USA','China','Netherlands','ASML'].filter(id=>id!==role))expect(JSON.stringify(observation)).not.toContain(state.privateNotes[other][0]);
    }
    for(const role of ['USA','Netherlands'])expect(JSON.stringify(getObservation(state,role))).toContain('PRIVATE_CHANNEL_CANARY');
    expect(JSON.stringify(getSnapshot(state))).not.toContain('PRIVATE_CHANNEL_CANARY');
    state.player=null;expect(JSON.stringify(getSnapshot(state))).not.toContain('PRIVATE_CHANNEL_CANARY');
    expect(getSnapshot(state)).not.toHaveProperty('privateNotes');
  });

  it('requires the existing addressed pending proposal and blocks outsider or wrong-target consent',()=>{
    let state=createSimulation();
    state=applyAction(state,action('USA',{action:'proposal',target:'Netherlands',scope:'diplomatic',content:'可复议的沟通程序。'}),'demo');
    expect(state.proposals[0].status).toBe('pending');expect(state.proposals[0].accepted_by).toEqual(['USA']);
    expect(validateAction(state,action('China',{action:'accept',target:'USA',proposal_id:'p1'})).valid).toBe(false);
    state=advance(state);
    expect(validateAction(state,action('Netherlands',{action:'accept',target:'China',proposal_id:'p1'})).valid).toBe(false);
    expect(validateAction(state,action('Netherlands',{action:'accept',target:'USA',proposal_id:'absent'})).valid).toBe(false);
    state=applyAction(state,action('Netherlands',{action:'accept',target:'USA',proposal_id:'p1'}),'demo');
    expect(state.proposals[0].status).toBe('accepted');expect(state.proposals[0].accepted_by).toEqual(['USA','Netherlands']);
    state=seek(state,'USA');
    expect(validateAction(state,action('USA',{action:'revise',target:'Netherlands',scope:'diplomatic',proposal_id:'p1'})).valid).toBe(false);
    expect(state).not.toHaveProperty('policy');
  });

  it('keeps private proposal outcomes private and prevents public replies that expose them',()=>{
    let state=createSimulation({player:'China'});
    state=applyAction(state,action('USA',{action:'proposal',target:'Netherlands',scope:'diplomatic',is_public:false,content:'PRIVATE_PROPOSAL_CANARY'}),'demo');
    state=applyAction(state,action('China'),'player');
    expect(validateAction(state,action('Netherlands',{action:'accept',target:'USA',proposal_id:'p1'})).valid).toBe(false);
    state=applyAction(state,action('Netherlands',{action:'accept',target:'USA',proposal_id:'p1',is_public:false}),'demo');
    expect(getSnapshot(state).proposals).toEqual([]);
    expect(getObservation(state,'ASML').proposals).toEqual([]);
    expect(getObservation(state,'USA').proposals[0].status).toBe('accepted');
    expect(JSON.stringify(getSnapshot(state))).not.toContain('PRIVATE_PROPOSAL_CANARY');
  });

  it('supersedes revised proposals with new IDs and requires fresh consent',()=>{
    let state=createSimulation({rounds:4});
    state=applyAction(state,action('USA',{action:'proposal',target:'China',scope:'diplomatic'}),'demo');
    state=applyAction(state,action('China'),'demo');state=advance(state);state=advance(state);
    const original=structuredClone(state);
    state=applyAction(state,action('USA',{action:'revise',target:'China',scope:'diplomatic',proposal_id:'p1',content:'修订后的沟通条件。'}),'demo');
    expect(original.proposals[0].status).toBe('pending');
    expect(state.proposals[0].status).toBe('superseded');
    expect(state.proposals[1].id).toBe('p5');expect(state.proposals[1].accepted_by).toEqual(['USA']);
    expect(validateAction(state,action('China',{action:'accept',target:'USA',proposal_id:'p1'})).valid).toBe(false);
    state=applyAction(state,action('China',{action:'accept',target:'USA',proposal_id:'p5'}),'demo');
    expect(state.proposals[1].status).toBe('accepted');
  });

  it('enforces ASML commercial authority and government-only diplomatic scope',()=>{
    let state=createSimulation();
    expect(validateAction(state,action('USA',{action:'proposal',target:'ASML',scope:'diplomatic'})).valid).toBe(false);
    expect(validateAction(state,action('USA',{action:'proposal',target:'Netherlands',scope:'commercial'})).valid).toBe(false);
    state=seek(state,'ASML');
    expect(validateAction(state,action('ASML',{action:'proposal',target:'Netherlands',scope:'diplomatic'})).valid).toBe(false);
    expect(validateAction(state,action('ASML',{action:'proposal',target:'China',scope:'commercial'})).valid).toBe(false);
    expect(validateAction(state,action('ASML',{action:'proposal',target:'Netherlands',scope:'commercial'})).valid).toBe(true);
  });

  it('rejects malformed actions and source spoofing without advancing state',()=>{
    const state=createSimulation();
    for(const input of [null,[],{},action('China'),action('USA',{content:''}),action('USA',{content:'a'.repeat(2001)}),action('USA',{reason:'a'.repeat(401)}),action('USA',{is_public:'yes'}),action('USA',{action:'unknown'}),action('USA',{target:'USA'}),action('USA',{action:'message',target:'China'}),action('USA',{mutation:{}})]) {
      expect(validateAction(state,input).valid).toBe(false);expect(()=>applyAction(state,input,'demo')).toThrow();
    }
    expect(()=>applyAction(state,action('USA'),'llm')).toThrow();expect(()=>applyAction(state,action('USA'),'player')).toThrow();
    expect(()=>applyAction(state,action('USA'),'madeup')).toThrow();expect(state.version).toBe(0);
    expect(()=>applyAction(createSimulation({player:'USA'}),action('USA'),'demo')).toThrow();
    expect(()=>applyAction(createSimulation({mode:'live'}),action('USA'),'demo')).toThrow();
  });

  it('records failed final slots explicitly without fabricating any model decisions',()=>{
    let state=createSimulation({mode:'live',rounds:1});
    expect(validateAction(state,action('USA')).valid).toBe(false);
    for(let i=0;i<4;i++)state=skipAction(state,'模型超时，本次行动未生成。');
    expect(state.status).toBe('completed');expect(state.messages).toHaveLength(0);expect(state.errors).toHaveLength(4);expect(state.decisions).toEqual({});
    expect(()=>skipAction(state,'again')).toThrow();expect(()=>applyAction(state,action('USA',{action:'decision'}),'llm')).toThrow();
  });

  it('makes final evidence public and traceable, excluding private channels',()=>{
    let state=createSimulation({rounds:2});
    state=applyAction(state,action('USA',{action:'message',target:'China',is_public:false,content:'PRIVATE_FINAL_CANARY'}),'demo');
    state=advance(state);state=advance(state);state=advance(state);
    state=advance(state);
    expect(state.decisions.USA.evidence).not.toContain('m1');
    for(const id of state.decisions.USA.evidence)expect(state.messages.find((item:any)=>item.id===id)?.is_public).toBe(true);
  });

  it('validates initial settings and bounds visible recent context',()=>{
    for(const settings of [{rounds:0},{rounds:6},{rounds:1.5},{mode:'unknown'},{player:'TSMC'}])expect(()=>createSimulation(settings)).toThrow();
    let state=createSimulation({rounds:5});while(state.status!=='completed')state=advance(state);
    for(const role of ['USA','China','Netherlands','ASML'])expect(getObservation(state,role).messages.length).toBeLessThanOrEqual(29);
    expect(()=>getObservation(state,'TSMC')).toThrow();
  });
});
