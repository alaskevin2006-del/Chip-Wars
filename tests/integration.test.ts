import { describe,it,expect,vi } from 'vitest';
import { createEngineAdapter } from '../src/game/adapter';
import { decideRule } from '../src/agents/rule';
import type { AgentObservation,PlayerRole } from '../src/engine';

describe('real game orchestration',()=>{
  for (const role of ['CN_GOV','US_GOV'] as PlayerRole[]) {
    it(`${role} completes six independent rule turns with every role and mechanism`,async()=>{
      const adapter=createEngineAdapter();
      let view=adapter.start(role,{useLLM:false,seed:2027});
      for (let round=1;round<=6;round++) {
        expect(view.observation.turn).toBe(round);
        view=await adapter.play(decideRule(view.observation).actions);
        expect(view.records).toHaveLength(round);
        const record=view.records.at(-1)!;
        expect(Object.keys(record.decisions)).toHaveLength(9);
        for (const mechanism of ['M1_LEGAL_TRADE','M2_TOOLS_FAB','M3_RD_PIPELINE','M4_MATERIALS','M5_GOV_FIRM','M6_SUPPLY_ALLOCATION']) {
          expect(record.events.some(event=>event.mechanism===mechanism)).toBe(true);
        }
        expect(view.observation.publicState.indicators.player_score.total).toBeGreaterThanOrEqual(0);
      }
      expect(view.finished).toBe(true);
      await expect(adapter.play([])).rejects.toThrow('结束');
    });
  }
  it('rejects illegal player choices without advancing the turn',async()=>{
    const adapter=createEngineAdapter();
    adapter.start('CN_GOV',{useLLM:false});
    await expect(adapter.play([{id:'US_CHIP_LICENSE',level:2}])).rejects.toThrow();
    const after=await adapter.play([]);
    expect(after.records).toHaveLength(1);
  });
  it('opponent model sees pre-submission policy and never other private preferences',async()=>{
    const captured:AgentObservation[]=[];
    const adapter=createEngineAdapter({llmDecider:async observation=>{
      captured.push(observation);
      return {decision:{actions:[],source:'llm'},fallback:false};
    }});
    const initial=adapter.start('CN_GOV',{useLLM:true});
    const policy=initial.observation.legalActions.find(a=>a.id==='CN_MATERIAL_LICENSE'&&a.target==='ga'&&a.level===1)!;
    expect(policy).toBeDefined();
    const view=await adapter.play([policy]);
    expect(captured).toHaveLength(1);
    expect(captured[0].roleId).toBe('US_GOV');
    expect(captured[0].publicState.policy.cn_ga).toBe(initial.observation.publicState.policy.cn_ga);
    expect(captured[0].publicState).not.toHaveProperty('private');
    expect(captured[0].publicState.finance).not.toHaveProperty('firm_cash');
    expect(view.records[0].decisions.US_GOV?.source).toBe('llm');
  });
  for (const failure of ['unavailable','crash','illegal'] as const) {
    it(`model ${failure} falls back for all six rounds`,async()=>{
      const llmDecider=vi.fn(async()=>{
        if (failure==='crash') throw new Error('network unavailable');
        return failure==='illegal'?{decision:{actions:[{id:'CN_SUBSIDY' as const,target:'design'}]},fallback:false}:{decision:null,fallback:true};
      });
      const adapter=createEngineAdapter({llmDecider});
      adapter.start('CN_GOV',{useLLM:true});
      for (let turn=0;turn<6;turn++) {
        const view=await adapter.play([]);
        expect(view.notice).toContain('规则');
        expect(view.records.at(-1)?.decisions.US_GOV?.source).toBe('fallback');
        expect(view.finished).toBe(turn===5);
      }
      expect(llmDecider).toHaveBeenCalledTimes(6);
    });
  }
  it('returned views cannot mutate authoritative game state',async()=>{
    const adapter=createEngineAdapter();
    const first=adapter.start('US_GOV',{useLLM:false});
    first.observation.publicState.finance.government_budgets.US_GOV=99999;
    const next=await adapter.play([]);
    expect(next.observation.publicState.finance.government_budgets.US_GOV).toBeLessThan(1000);
    expect(next.records.flatMap(record=>record.events).flatMap(event=>event.deltas).some(delta=>delta.path.startsWith('finance.firm_cash.'))).toBe(false);
  });
  it('does not allow an old model response or duplicate submit to overwrite a restarted game',async()=>{
    let finish!: (result:{decision:null;fallback:boolean})=>void;
    const adapter=createEngineAdapter({llmDecider:()=>new Promise(resolve=>{finish=resolve;})});
    adapter.start('CN_GOV',{useLLM:true});
    const pending=adapter.play([]);
    await expect(adapter.play([])).rejects.toThrow('正在结算');
    adapter.start('US_GOV',{useLLM:false});
    finish({decision:null,fallback:true});
    await expect(pending).rejects.toThrow('重新开始');
    const fresh=await adapter.play([]);
    expect(fresh.observation.roleId).toBe('US_GOV');
    expect(fresh.records).toHaveLength(1);
    expect(fresh.notice).toBeUndefined();
  });
  it('replays identical seed and player actions to identical records',async()=>{
    const a=createEngineAdapter(),b=createEngineAdapter();
    a.start('US_GOV',{useLLM:false,seed:101}); b.start('US_GOV',{useLLM:false,seed:101});
    for (let turn=0;turn<6;turn++) expect(await a.play([])).toEqual(await b.play([]));
  });
});
