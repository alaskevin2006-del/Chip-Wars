import {describe,it,expect} from 'vitest';
import {AGENT_IDS,ACTION_IDS,DEFAULT_CONFIG,createGame,getObservation,getLegalActions,validateDecision,resolveTurn,projectPhase,deriveIndicators,type Action,type AgentDecision,type AgentId,type Decisions,type GameConfig,type GameState,type PlayerRole} from '../src/engine';
import {decideRule} from '../src/agents/rule';
import {calculateFlows} from '../src/engine/economy';

const game=(role:PlayerRole='CN_GOV',seed=42)=>createGame(DEFAULT_CONFIG,seed,role);
function phased(s:GameState,playerDecision?:AgentDecision):Decisions{
  const d:Decisions={};for(const role of ['US_GOV','CN_GOV'] as const)d[role]=role===s.playerRole&&playerDecision?playerDecision:decideRule(getObservation(s,role));
  const third=projectPhase(s,d,'S2_THIRD_GOV',s.config);for(const role of ['NL_GOV','JP_GOV','KR_GOV'] as const)d[role]=decideRule(getObservation(third,role));
  const firms=projectPhase(s,d,'S3_FIRMS',s.config);for(const role of ['US_AI','CN_DESIGN','CN_FAB','TSMC'] as const)d[role]=decideRule(getObservation(firms,role));return d;
}
function turn(s:GameState,d:Decisions={}){return resolveTurn(s,d,{seed:s.rng_state,research:[.5,.5,.5,.5,.5,.5]},s.config);}
function nonnegative(s:GameState){for(const value of [...Object.values(s.finance.government_budgets),...Object.values(s.finance.firm_cash),...Object.values(s.materials).map(m=>m.inventory)])expect(value).toBeGreaterThanOrEqual(0);expect(JSON.stringify(s)).not.toMatch(/NaN|Infinity/);}

describe('full staged games and causal evidence',()=>{
  for(const role of ['CN_GOV','US_GOV'] as const)it(`${role}: nine autonomous actors complete six deterministic rounds`,()=>{
    let s=game(role);const actions=new Set<string>();
    for(let i=0;i<6;i++){
      const d=phased(s);for(const id of AGENT_IDS){expect(d[id]).toBeDefined();d[id]!.actions.forEach(a=>actions.add(a.id));}
      const snapshot=JSON.stringify(s),a=turn(s,d),b=turn(s,d);expect(a).toEqual(b);expect(JSON.stringify(s)).toBe(snapshot);nonnegative(a.nextState);
      for(const mechanism of ['M1_LEGAL_TRADE','M2_TOOLS_FAB','M3_RD_PIPELINE','M4_MATERIALS','M5_GOV_FIRM','M6_SUPPLY_ALLOCATION'])expect(a.events.some(e=>e.mechanism===mechanism)).toBe(true);
      expect(a.nextState.history.at(-1)?.decisions).toEqual(d);s=a.nextState;
    }
    expect(s.finished).toBe(true);expect(s.history).toHaveLength(6);expect(actions.size).toBeGreaterThan(8);expect(()=>turn(s)).toThrow(/结束/);
  });
  it('seals major governments and independently exposes only later-stage policies',()=>{
    const s=game(),before=getObservation(s,'US_GOV');
    const d:Decisions={CN_GOV:{actions:[{id:'CN_MATERIAL_LICENSE',target:'ga',level:1} ]}};
    const third=projectPhase(s,d,'S2_THIRD_GOV',s.config);expect(third.policy.cn_ga).toBe(1);expect(s.policy.cn_ga).toBe(0);expect(getObservation(s,'US_GOV')).toEqual(before);expect(()=>turn(third)).toThrow(/投影/);
  });
  it('keeps own cash/preferences while removing competitor private state and cash histories',()=>{
    const s=turn(game(),phased(game())).nextState,o=getObservation(s,'CN_DESIGN');
    expect(o.privateState.cash).toBe(s.finance.firm_cash.CN_DESIGN);expect(o.publicState.finance).not.toHaveProperty('firm_cash');expect(o).not.toHaveProperty('config');
    expect(o.privateState).not.toHaveProperty('US_GOV');
    expect(o.history.flatMap(e=>e.deltas).filter(d=>d.path.startsWith('finance.firm_cash.')).every(d=>d.path==='finance.firm_cash.CN_DESIGN')).toBe(true);
    o.publicState.technology.cn_design=0;expect(s.technology.cn_design).not.toBe(0);
  });
});

describe('legality, resources and independent accounts',()=>{
  it('freezes exactly 24 templates plus hold, with negotiation hidden',()=>{
    expect(AGENT_IDS).toHaveLength(9);expect(ACTION_IDS).toHaveLength(25);
    const templates=new Set(AGENT_IDS.flatMap(id=>getLegalActions(game(),id)).map(a=>a.id));expect(templates.size).toBe(24);expect(templates.has('CN_OFFER')).toBe(false);
  });
  it('rejects cross-jurisdiction, duplicate policies, leaps, AP and aggregate spending',()=>{
    const s=game();
    const check=(role:AgentId,actions:Action[])=>validateDecision(s,role,{actions}).valid;
    expect(check('KR_GOV',[{id:'US_TOOL_LICENSE',level:0}])).toBe(false);
    expect(check('CN_GOV',[{id:'CN_MATERIAL_LICENSE',target:'ga',level:2}])).toBe(false);
    expect(check('US_GOV',[{id:'US_CHIP_LICENSE',level:0},{id:'US_CHIP_LICENSE',level:2}])).toBe(false);
    expect(check('US_GOV',[{id:'US_CHIP_LICENSE',level:0},{id:'US_TOOL_LICENSE',level:0},{id:'US_DIPLOMACY',target:'NL_GOV'}])).toBe(false);
    s.finance.government_budgets.CN_GOV=20;
    expect(check('CN_GOV',[{id:'CN_SUBSIDY',target:'design'},{id:'CN_INDUSTRY_COORD'}])).toBe(false);
    expect(check('US_GOV',[{id:'HOLD'},{id:'US_CHIP_LICENSE',level:0}])).toBe(false);
    expect(()=>turn(s,{CN_GOV:{actions:[{id:'CN_SUBSIDY',target:'design'},{id:'CN_INDUSTRY_COORD'}]}})).toThrow(/预算/);
  });
  it('subsidy is an exact transfer with no automatic research and no repeated phase charge',()=>{
    const s=game(),d:Decisions={CN_GOV:{actions:[{id:'CN_SUBSIDY',target:'design'}]}};
    const projected=projectPhase(s,d,'S3_FIRMS',s.config),cost=s.config.costs.CN_SUBSIDY;
    expect(projected.finance.government_budgets.CN_GOV).toBe(s.finance.government_budgets.CN_GOV-cost);expect(projected.finance.firm_cash.CN_DESIGN).toBe(s.finance.firm_cash.CN_DESIGN+cost);expect(projected.technology).toEqual(s.technology);
    const a=turn(s,d),baseline=turn(s);expect(a.nextState.finance.firm_cash.CN_DESIGN-baseline.nextState.finance.firm_cash.CN_DESIGN).toBeCloseTo(cost);expect(a.nextState.finance.government_budgets.CN_GOV-baseline.nextState.finance.government_budgets.CN_GOV).toBeCloseTo(-cost);
    const event=a.events.find(e=>e.actions.some(a=>a.id==='CN_SUBSIDY'))!;expect(event.deltas.reduce((sum,d)=>sum+(d.path.startsWith('finance.')?d.after-d.before:0),0)).toBe(0);
  });
  it('investment pays now and changes only its target after the specified delay',()=>{
    let s=game();const cash=s.finance.firm_cash.CN_DESIGN,design=s.technology.cn_design;
    const a=turn(s,{CN_DESIGN:{actions:[{id:'CN_DESIGN_RD'}]}});s=a.nextState;
    expect(s.technology.cn_design).toBe(design);expect(s.finance.firm_cash.CN_DESIGN).toBeCloseTo(cash-s.config.costs.CN_DESIGN_RD+s.finance.firm_profit.CN_DESIGN);expect(s.pending_projects[0].due_turn).toBe(3);
    s=turn(s).nextState;expect(s.technology.cn_design).toBe(design);const b=turn(s);expect(b.nextState.technology.cn_design).toBeGreaterThan(design);expect(b.events.some(e=>e.mechanism==='M3_RD_PIPELINE')).toBe(true);expect(b.nextState.pending_projects).toHaveLength(0);
  });
  it('cashless firms cannot invest and late projects clearly disclose unrealized potential',()=>{
    const s=game();s.finance.firm_cash.CN_FAB=0;expect(getLegalActions(s,'CN_FAB').map(a=>a.id)).toEqual(['HOLD']);expect(validateDecision(s,'CN_FAB',{actions:[{id:'CN_FAB_INVEST',target:'process'}]}).valid).toBe(false);
    s.turn=6;expect(getLegalActions(s,'CN_DESIGN').find(a=>a.id==='CN_DESIGN_RD')!.risk).toContain('长期潜力');
  });
});

describe('industrial and physical invariants',()=>{
  it('tightening chip licenses never increases controlled legal deliveries',()=>{
    const outputs=[0,1,2].map(level=>{const s=game();s.policy.us_chip=level;return turn(s).indicators.cn_legal_ai_import;});expect(outputs[0]).toBeGreaterThan(outputs[1]);expect(outputs[1]).toBeGreaterThan(outputs[2]);expect(outputs[2]).toBe(0);
  });
  it('blocking new equipment does not erase installed tools and US/JP/NL are independent',()=>{
    const s=game();s.policy.us_tool=2;s.policy.nl_duv=2;
    const a=turn(s);expect(a.nextState.technology.cn_tools_litho).toBeCloseTo(s.technology.cn_tools_litho*s.config.parameters.equipment_retention);expect(a.nextState.technology.cn_tools_other).toBeGreaterThan(s.technology.cn_tools_other*.98);
    expect(getLegalActions(s,'CN_FAB').some(a=>a.target==='litho'||a.target==='us_tools')).toBe(false);expect(getLegalActions(s,'CN_FAB').some(a=>a.target==='jp_tools')).toBe(true);
  });
  it('design cannot replace packaging/HBM and all supply is bounded by physical bottlenecks',()=>{
    const s=game();s.technology.cn_design=100;s.technology.cn_packaging=3;let f=calculateFlows(s);expect(f.cn_domestic_ai_output).toBe(3);s.technology.cn_packaging=100;s.capacity.cn_hbm_access=2;f=calculateFlows(s);expect(f.cn_domestic_ai_output).toBe(2);
    expect(f.cn_domestic_ai_output+f.tsmc_delivered).toBeLessThanOrEqual(s.capacity.global_hbm+.001);expect(f.tsmc_delivered).toBeLessThanOrEqual(s.capacity.tsmc_total);for(const value of Object.values(f.bottlenecks))expect(f.cn_domestic_ai_output).toBeLessThanOrEqual(value+.001);
  });
  it('TSMC adjusts only flexible allocations and rejects a forbidden buyer',()=>{
    const s=game();expect(validateDecision(s,'TSMC',{actions:[{id:'TSMC_ALLOCATE',target:'CN_DESIGN'}]}).valid).toBe(false);
    const low=turn(s,{TSMC:{actions:[{id:'TSMC_ALLOCATE',target:'OTHER'}]}}),high=turn(s,{TSMC:{actions:[{id:'TSMC_ALLOCATE',target:'US_AI'}]}});
    expect(high.indicators.us_ai_output-low.indicators.us_ai_output).toBeLessThanOrEqual(s.capacity.tsmc_total*s.capacity.tsmc_flexible_share+.001);expect(high.nextState.capacity.tsmc_total).toBe(s.capacity.tsmc_total);expect(high.nextState.capacity.tsmc_us_ai_allocation).toBeLessThanOrEqual(1);
  });
  it('gallium and germanium inventories/costs are separate and do not delete silicon output',()=>{
    const open=game(),restricted=game();restricted.policy.cn_ga=2;restricted.materials.ga.inventory=0;
    const a=turn(open),b=turn(restricted);expect(b.indicators.ga_sector_cost).toBeGreaterThan(a.indicators.ga_sector_cost);expect(b.indicators.ge_sector_cost).toBe(a.indicators.ge_sector_cost);expect(b.indicators.us_ai_output).toBe(a.indicators.us_ai_output);expect(b.indicators.cn_domestic_ai_output).toBe(a.indicators.cn_domestic_ai_output);
    const buffered=game();buffered.policy.cn_ga=2;buffered.materials.ga.inventory=50;expect(turn(buffered).indicators.ga_sector_cost).toBe(100);expect(b.nextState.materials.ga.inventory).toBeGreaterThanOrEqual(0);
  });
  it('paid material substitution has delay and reduces corresponding later shortage',()=>{
    let s=game();s.policy.cn_ga=2;s.policy.cn_ge=2;s.materials.ga.inventory=0;s.materials.ge.inventory=0;
    const baseline=s.materials.ga.non_cn_alt_capacity,first=turn(s,{US_GOV:{actions:[{id:'US_SUPPORT',target:'materials'}]}});s=first.nextState;expect(s.materials.ga.non_cn_alt_capacity).toBe(baseline);
    s=turn(s).nextState;const third=turn(s);expect(third.nextState.materials.ga.non_cn_alt_capacity).toBeGreaterThan(baseline);expect(third.indicators.ga_sector_cost).toBeLessThan(first.indicators.ga_sector_cost);expect(third.nextState.finance.government_budgets.US_GOV).toBeLessThan(DEFAULT_CONFIG.initial.finance.government_budgets.US_GOV+15);
  });
  it('derived report indicators are actual last settlement rather than recomputed post-consumption forecasts',()=>{
    const a=turn(game());expect(deriveIndicators(a.nextState)).toEqual(a.indicators);
  });
  it('material stock exactly conserves licensed inflow plus alternatives minus consumption',()=>{
    const s=game();s.materials.ga.inventory=80;const f=calculateFlows(s),a=turn(s);
    expect(a.nextState.materials.ga.inventory).toBeCloseTo(s.materials.ga.inventory+f.ga_imports+s.materials.ga.non_cn_alt_capacity-f.ga_consumed);
  });
  it('HBM honors committed contracts first, with no reassignment of a blocked customer contract',()=>{
    const s=game();s.capacity.global_hbm=90;
    const low=turn(s,{TSMC:{actions:[{id:'TSMC_ALLOCATE',target:'OTHER'}]}}),high=turn(s,{TSMC:{actions:[{id:'TSMC_ALLOCATE',target:'US_AI'}]}});
    expect(high.indicators.us_ai_output).toBe(low.indicators.us_ai_output);
    const blocked=game();blocked.policy.tw_compliance_mask.US_AI=false;const b=calculateFlows(blocked);
    expect(b.us_ai_output).toBe(0);expect(b.tsmc_delivered).toBeLessThan(blocked.capacity.tsmc_total*(1-blocked.config.parameters.committed_us_share));
  });
  it('research consumes explicit random samples and rejects non-finite inputs',()=>{
    let s=turn(game(),{CN_DESIGN:{actions:[{id:'CN_DESIGN_RD'}]}}).nextState;s=turn(s).nextState;
    const low=resolveTurn(s,{}, {seed:1,research:[0]},s.config),high=resolveTurn(s,{}, {seed:1,research:[1]},s.config);
    expect(high.nextState.technology.cn_design).toBeGreaterThan(low.nextState.technology.cn_design);expect(()=>resolveTurn(s,{}, {seed:1,research:[NaN]},s.config)).toThrow(/有限/);
  });
  it('score dimensions use each firm own technology, profit and cash account',()=>{
    const s=game();s.finance.firm_cash.CN_DESIGN=0;
    expect(getObservation(s,'CN_DESIGN').publicState.indicators.player_score.dimensions.fiscal).toBe(0);
    expect(getObservation(s,'CN_GOV').publicState.indicators.player_score.dimensions.fiscal).toBeCloseTo(100*100/(100+6*5));
  });
});

describe('commercial feedback into independent government policy',()=>{
  it('real exporter losses create pressure and change the following US policy choice',()=>{
    const s=game();s.politics.domestic_pressure.US_GOV=0;
    const before=decideRule(getObservation(s,'US_GOV'));
    const result=turn(s,{US_GOV:{actions:[{id:'US_CHIP_LICENSE',level:2}]}});
    expect(result.indicators.us_exporter_loss).toBeGreaterThan(0);expect(result.nextState.politics.domestic_pressure.US_GOV).toBeGreaterThan(s.politics.domestic_pressure.US_GOV);
    const after=decideRule(getObservation(result.nextState,'US_GOV'));
    expect(before.actions.some(a=>a.id==='US_CHIP_LICENSE'&&a.level===0)).toBe(false);expect(after.actions.some(a=>a.id==='US_CHIP_LICENSE'&&a.level===1)).toBe(true);
    expect(result.events.find(e=>e.mechanism==='M5_GOV_FIRM')!.deltas.some(d=>d.path==='politics.domestic_pressure.US_GOV')).toBe(true);
  });
  it('diplomacy never forces an allied license and a commercially oriented NL can refuse',()=>{
    const s=game();s.politics.domestic_pressure.NL_GOV=80;
    const d:Decisions={US_GOV:{actions:[{id:'US_DIPLOMACY',target:'NL_GOV'}]}};
    const projected=projectPhase(s,d,'S2_THIRD_GOV',s.config);expect(projected.policy.nl_duv).toBe(s.policy.nl_duv);
    const nl=decideRule(getObservation(projected,'NL_GOV'));expect(nl.actions).toContainEqual({id:'NL_DUV_LICENSE',level:0});
  });
});
