import {describe,it,expect} from 'vitest';
import {DEFAULT_CONFIG,createGame,getObservation,getLegalActions,projectPhase,resolveTurn,deriveIndicators,type AgentDecision,type Decisions,type GameConfig,type GameState,type PlayerRole} from '../src/engine';
import {decideRule} from '../src/agents/rule';

type Strategy='hold'|'strict'|'support';
function choose(s:GameState,strategy:Strategy):AgentDecision{
  const legal=getLegalActions(s,s.playerRole);let chosen=legal.filter(a=>{
    if(strategy==='strict'){
      if(s.playerRole==='CN_GOV')return a.id==='CN_MATERIAL_LICENSE'&&a.level===(a.target==='ga'?s.policy.cn_ga:s.policy.cn_ge)+1;
      return (a.id==='US_CHIP_LICENSE'&&a.level===s.policy.us_chip+1)||(a.id==='US_TOOL_LICENSE'&&a.level===s.policy.us_tool+1);
    }
    if(strategy==='support')return s.playerRole==='CN_GOV'?(a.id==='CN_SUBSIDY'&&a.target==='manufacturing')||a.id==='CN_INDUSTRY_COORD':(a.id==='US_SUPPORT'&&a.target==='rd')||(a.id==='US_DIPLOMACY'&&a.target==='NL_GOV');
    return false;
  });
  let cash=s.finance.government_budgets[s.playerRole];chosen=chosen.filter(a=>{if(a.money_cost>cash)return false;cash-=a.money_cost;return true;});
  return {actions:chosen.length?chosen.map(({id,target,level})=>({id,target,level})):[{id:'HOLD'}],source:'player'};
}
function simulate(role:PlayerRole,strategy:Strategy,config:GameConfig=DEFAULT_CONFIG):GameState{
  let s=createGame(config,42,role);
  while(!s.finished){
    const d:Decisions={};for(const actor of ['US_GOV','CN_GOV'] as const)d[actor]=actor===role?choose(s,strategy):decideRule(getObservation(s,actor));
    const third=projectPhase(s,d,'S2_THIRD_GOV',config);for(const actor of ['NL_GOV','JP_GOV','KR_GOV'] as const)d[actor]=decideRule(getObservation(third,actor));
    const firms=projectPhase(s,d,'S3_FIRMS',config);for(const actor of ['US_AI','CN_DESIGN','CN_FAB','TSMC'] as const)d[actor]=decideRule(getObservation(firms,actor));
    s=resolveTurn(s,d,{seed:42+s.turn},config).nextState;
  }
  return s;
}

describe('six-round strategic tradeoffs and normalized ending scores',()=>{
  for(const role of ['CN_GOV','US_GOV'] as const)it(`${role}: passive, strictest and repeated-support strategies remain distinguishable`,()=>{
    const hold=simulate(role,'hold'),strict=simulate(role,'strict'),support=simulate(role,'support');
    const scores=[hold,strict,support].map(s=>deriveIndicators(s).player_score);
    expect(hold.history).toHaveLength(6);expect(strict.history).toHaveLength(6);expect(support.history).toHaveLength(6);
    expect(scores[0].total).toBeLessThan(100);expect(Object.values(scores[0].dimensions).every(v=>v===100)).toBe(false);
    expect(new Set(scores.map(score=>score.total)).size).toBe(3);
    expect(scores[2].dimensions.fiscal).toBeLessThan(scores[0].dimensions.fiscal);
    expect(support.finance.government_budgets[role]).toBeLessThan(hold.finance.government_budgets[role]);
    expect(scores[1].dimensions.economy).toBeLessThan(scores[0].dimensions.economy);
    if(role==='CN_GOV'){
      expect(scores[1].dimensions.diplomacy).toBeLessThan(scores[0].dimensions.diplomacy);
      expect(scores[1].total).toBeLessThan(scores[0].total);
    }else expect(scores[1].dimensions.technology).toBeGreaterThan(scores[0].dimensions.technology);
  });
  it('strict US control is not universally optimal under different existing preference weights',()=>{
    const industry=structuredClone(DEFAULT_CONFIG);industry.preferences.US_GOV={security:.1,industry:.7,fiscal:.15,diplomacy:.05};
    const strict=deriveIndicators(simulate('US_GOV','strict',industry)).player_score;
    const hold=deriveIndicators(simulate('US_GOV','hold',industry)).player_score;
    expect(strict.dimensions.technology).toBeGreaterThan(hold.dimensions.technology);expect(strict.total).toBeLessThan(hold.total);
  });
  it('CN technology rewards actual domestic production even if imports fully cover demand',()=>{
    const ampleHbm=structuredClone(DEFAULT_CONFIG);ampleHbm.initial.capacity.global_hbm=150;ampleHbm.parameters.order_cn=70;
    const imported=createGame(ampleHbm,42,'CN_GOV');imported.policy.us_chip=0;imported.technology.cn_packaging=15;
    const domestic=structuredClone(imported);domestic.technology.cn_packaging=25;domestic.capacity.cn_hbm_access=40;
    // Same total available supply, different actual domestic contribution. No direct score assignment.
    const a=deriveIndicators(imported),b=deriveIndicators(domestic);
    expect(a.cn_usable_ai).toBe(ampleHbm.parameters.demand_cn);expect(b.cn_usable_ai).toBe(a.cn_usable_ai);
    expect(b.cn_domestic_ai_output).toBeGreaterThan(a.cn_domestic_ai_output);
    expect(b.player_score.dimensions.technology).toBeGreaterThan(a.player_score.dimensions.technology);
    expect(b.player_score.explanation).toContain('国产交付覆盖');
  });
  it('support-rd advertises its immediate cash transfer while materials retains construction delay',()=>{
    const s=createGame(DEFAULT_CONFIG,42,'US_GOV');s.turn=6;
    const actions=getLegalActions(s,'US_GOV'),rd=actions.find(a=>a.id==='US_SUPPORT'&&a.target==='rd')!,materials=actions.find(a=>a.id==='US_SUPPORT'&&a.target==='materials')!;
    expect(rd.effective_at).toBe(6);expect(rd.risk).not.toContain('长期潜力');expect(materials.effective_at).toBe(8);expect(materials.risk).toContain('长期潜力');
    const projected=projectPhase(s,{US_GOV:{actions:[{id:'US_SUPPORT',target:'rd'}]}},'S3_FIRMS',s.config);
    expect(projected.finance.firm_cash.US_AI-s.finance.firm_cash.US_AI).toBe(s.config.costs.US_SUPPORT);expect(projected.technology.us_ai_frontier).toBe(s.technology.us_ai_frontier);
    const materialCard=getLegalActions(createGame(DEFAULT_CONFIG,42,'CN_GOV'),'CN_GOV').find(a=>a.id==='CN_MATERIAL_LICENSE')!;
    expect(materialCard.explanation).toContain('既有库存缓冲短缺');expect(materialCard.explanation).not.toContain('设备');
  });
});
