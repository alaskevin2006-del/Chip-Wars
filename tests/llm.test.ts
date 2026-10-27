import { afterEach, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createGameServer, type ServerOptions } from '../server/index.mjs';
import { decideLLM } from '../src/agents/llm';
import type { AgentObservation, LegalAction } from '../src/engine/types';

const hold:LegalAction={id:'HOLD',actor:'CN_GOV',label:'保持现状',ap_cost:0,money_cost:0,preconditions:[],effective_at:1,duration:1,explanation:'保持政策',direction:'无政策变化',risk:'机会成本'};
const subsidy:LegalAction={...hold,id:'CN_SUBSIDY',target:'design',label:'补贴设计',ap_cost:1,money_cost:20};
const coord:LegalAction={...hold,id:'CN_INDUSTRY_COORD',label:'协作',ap_cost:1,money_cost:15};
const ga:LegalAction={...hold,id:'CN_MATERIAL_LICENSE',target:'ga',level:2,label:'镓许可',ap_cost:1};
const ge:LegalAction={...ga,target:'ge',label:'锗许可'};
const observation=():AgentObservation=>({
  roleId:'CN_GOV',turn:1,phase:'S0_BRIEFING',
  publicState:{
    policy:{us_chip:1,us_tool:1,nl_duv:1,jp_tool:1,cn_ga:1,cn_ge:1,tw_compliance_mask:{US_AI:true,CN_DESIGN:false},us_fab_license_scope:1},
    technology:{cn_design:40,cn_process:40,cn_yield:60,cn_packaging:40,cn_tools_litho:40,cn_tools_other:40,cn_local_tool_adaptation:30,cn_adaptation:50,us_ai_frontier:80},
    capacity:{tsmc_total:80,tsmc_flexible_share:.2,tsmc_us_ai_allocation:.5,global_hbm:80,cn_hbm_access:30,kr_china_fab_operability:70},
    materials:{ga:{inventory:10,licensed_supply:20,non_cn_alt_capacity:10,affected_sector_demand:40},ge:{inventory:15,licensed_supply:30,non_cn_alt_capacity:10,affected_sector_demand:50}},
    finance:{government_budgets:{US_GOV:100,CN_GOV:100,NL_GOV:80,JP_GOV:80,KR_GOV:80},firm_profit:{US_AI:15,CN_DESIGN:10,CN_FAB:8,TSMC:20},industry_profit:{NL:12,JP:10,KR:15},cn_material_export_revenue:20},
    politics:{alignment:{US_NL:60,US_JP:60,US_KR:60},domestic_pressure:{US_GOV:30,CN_GOV:30,NL_GOV:30,JP_GOV:30,KR_GOV:30},offers:[]},
    indicators:{cn_legal_ai_import:20,cn_domestic_ai_output:25,cn_usable_ai:45,us_ai_output:60,ga_sector_cost:1,ge_sector_cost:1,us_exporter_loss:10,nl_litho_profit:12,jp_tool_profit:10,kr_memory_profit:15,supply_chain_risk:30,dependency_index:45,bottlenecks:{design:40,manufacturing:35,equipment:35,packaging:40,hbm:30},player_score:{dimensions:{technology:45,economy:55,diplomacy:60,fiscal:70},total:57,label:'均衡',explanation:'测试局势',longTermPotential:0}},
    pending_projects:[],
  },
  privateState:{weights:{security:.3,industry:.4,fiscal:.2,diplomacy:.1},strategy_type:'balanced',estimates:{},cash:100,ap:2},
  history:[],legalActions:[hold,subsidy,coord,ga,ge],
});
const wire=(obs=observation())=>({observation:obs,legalActions:obs.legalActions});
const provider=(content:unknown)=>new Response(JSON.stringify({choices:[{message:{content:typeof content==='string'?content:JSON.stringify(content)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
const enabled={DEEPSEEK_API_KEY:'test-placeholder',LLM_TIMEOUT_MS:'1000'};
const servers:Server[]=[];const directories:string[]=[];
async function boot(options:ServerOptions={}) {
  const server=createGameServer(options);servers.push(server);server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {server,origin,post:async(value:unknown=wire(),headers:Record<string,string>={})=>fetch(`${origin}/api/agent/decide`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(value)})};
}
afterEach(async()=>{
  await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})));
  await Promise.all(directories.splice(0).map(directory=>rm(directory,{recursive:true,force:true})));
});

describe('optional model proxy',()=>{
  it('returns safe not-configured fallback and health without a key',async()=>{
    const model=vi.fn();const app=await boot({env:{},fetchImpl:model});
    const response=await app.post();expect(response.status).toBe(200);expect(await response.json()).toEqual({decision:null,fallback:true,reason:'not_configured'});expect(model).not.toHaveBeenCalled();
    const health=await (await fetch(`${app.origin}/api/health`)).json();expect(health).toEqual({status:'ok',llm:{enabled:false,model:'deepseek-flash'}});
  });
  it('returns a legal JSON decision and sends only role-scoped state',async()=>{
    const model=vi.fn(async()=>provider({actions:[{id:'CN_SUBSIDY',target:'design'}],rationale:'保障设计企业现金。'}));
    const app=await boot({env:enabled,fetchImpl:model});
    const result=await (await app.post()).json();expect(result).toEqual({fallback:false,decision:{actions:[{id:'CN_SUBSIDY',target:'design'}],rationale:'保障设计企业现金。',source:'llm'}});
    const call=model.mock.calls[0] as unknown as [string,RequestInit];expect(call[0]).toBe('https://api.deepseek.com/chat/completions');
    const input=JSON.parse(call[1].body as string);expect(input.model).toBe('deepseek-flash');expect(input.max_tokens).toBe(500);expect(input.thinking.type).toBe('disabled');expect(JSON.stringify(input)).not.toContain('test-placeholder');
  });
  it('uses configurable base URL and model, without exposing either in failures',async()=>{
    const model=vi.fn(async()=>provider({actions:[]}));const app=await boot({env:{...enabled,DEEPSEEK_BASE_URL:'https://example.test/v1/',DEEPSEEK_MODEL:'configured-model'},fetchImpl:model});
    expect((await (await app.post()).json()).fallback).toBe(false);expect((model.mock.calls[0] as unknown as [string])[0]).toBe('https://example.test/v1/chat/completions');
  });
  it('retries malformed JSON only once, then returns rule fallback',async()=>{
    const model=vi.fn(async()=>provider('not JSON'));const app=await boot({env:enabled,fetchImpl:model});const result=await (await app.post()).json();
    expect(result.fallback).toBe(true);expect(model).toHaveBeenCalledTimes(2);
  });
  it('recovers on the one permitted format retry',async()=>{
    const model=vi.fn().mockResolvedValueOnce(provider('```json {} ```')).mockResolvedValueOnce(provider({actions:[{id:'HOLD'}]}));
    const app=await boot({env:enabled,fetchImpl:model});expect((await (await app.post()).json()).fallback).toBe(false);expect(model).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['unknown action',{actions:[{id:'DELETE_WORLD'}]}],
    ['wrong option',{actions:[{id:'CN_SUBSIDY',target:'other'}]}],
    ['duplicate policy',{actions:[{id:'CN_SUBSIDY',target:'design'},{id:'CN_SUBSIDY',target:'design'}]}],
    ['hold with action',{actions:[{id:'HOLD'},{id:'CN_SUBSIDY',target:'design'}]}],
    ['state mutation',{actions:[],technology:100}],
    ['unknown action field',{actions:[{id:'HOLD',money:999}]}],
    ['overlong reason',{actions:[],rationale:'x'.repeat(801)}],
  ])('rejects %s model response',async(_,decision)=>{
    const model=vi.fn(async()=>provider(decision));const app=await boot({env:enabled,fetchImpl:model});expect((await (await app.post()).json()).fallback).toBe(true);expect(model).toHaveBeenCalledTimes(2);
  });
  it('permits independent ga and ge license targets',async()=>{
    const app=await boot({env:enabled,fetchImpl:vi.fn(async()=>provider({actions:[{id:'CN_MATERIAL_LICENSE',target:'ga',level:2},{id:'CN_MATERIAL_LICENSE',target:'ge',level:2}]}))});expect((await (await app.post()).json()).fallback).toBe(false);
  });
  it('rejects aggregate AP and budget violations',async()=>{
    const model=vi.fn(async()=>provider({actions:[{id:'CN_SUBSIDY',target:'design'},{id:'CN_INDUSTRY_COORD'}]}));const app=await boot({env:enabled,fetchImpl:model});
    const scarce=observation();scarce.privateState.cash=25;expect((await (await app.post(wire(scarce))).json()).fallback).toBe(true);
    scarce.privateState.cash=100;scarce.privateState.ap=1;expect((await (await app.post(wire(scarce))).json()).fallback).toBe(true);
  });
  it('does not retry upstream 429 or expose the upstream response',async()=>{
    const model=vi.fn(async()=>new Response('sensitive provider details',{status:429}));const app=await boot({env:enabled,fetchImpl:model});
    expect(await (await app.post()).json()).toEqual({decision:null,fallback:true,reason:'upstream_rate_limit'});expect(model).toHaveBeenCalledTimes(1);
  });
  it.each([500,401,503])('handles upstream %s safely',async(status)=>{
    const model=vi.fn(async()=>new Response('details',{status}));const app=await boot({env:enabled,fetchImpl:model});expect(await (await app.post()).json()).toEqual({decision:null,fallback:true,reason:'upstream_unavailable'});expect(model).toHaveBeenCalledTimes(1);
  });
  it('handles empty output with a single retry',async()=>{
    const model=vi.fn(async()=>provider(''));const app=await boot({env:enabled,fetchImpl:model});expect((await (await app.post()).json()).reason).toBe('empty_response');expect(model).toHaveBeenCalledTimes(2);
  });
  it('handles model/network crash without logging or leaking details',async()=>{
    const model=vi.fn(async()=>{throw new Error('private detail');});const app=await boot({env:enabled,fetchImpl:model});expect(await (await app.post()).json()).toEqual({decision:null,fallback:true,reason:'upstream_unavailable'});expect(model).toHaveBeenCalledTimes(1);
  });
  it('times out even a provider implementation which ignores AbortSignal',async()=>{
    const app=await boot({env:{...enabled,LLM_TIMEOUT_MS:'25'},fetchImpl:vi.fn(()=>new Promise<Response>(()=>{}))});expect((await (await app.post()).json()).reason).toBe('timeout');
  });
  it('limits per-IP calls without trusting forwarded addresses',async()=>{
    const model=vi.fn(async()=>provider({actions:[]}));const app=await boot({env:{...enabled,LLM_PER_IP_LIMIT:'1'},fetchImpl:model});
    expect((await app.post()).status).toBe(200);const response=await app.post(wire(),{'X-Forwarded-For':'new-fake-ip'});expect(response.status).toBe(429);expect((await response.json()).reason).toBe('rate_limit');expect(model).toHaveBeenCalledTimes(1);
  });
  it('caps total provider requests, including format retries, and resets next UTC day',async()=>{
    let time=0;const model=vi.fn(async()=>provider('bad'));const app=await boot({env:{...enabled,LLM_DAILY_LIMIT:'1'},fetchImpl:model,now:()=>time});
    expect((await (await app.post()).json()).reason).toBe('daily_limit');expect(model).toHaveBeenCalledTimes(1);
    expect((await (await app.post()).json()).reason).toBe('daily_limit');expect(model).toHaveBeenCalledTimes(1);
    time=86400000;await app.post();expect(model).toHaveBeenCalledTimes(2);
  });
  it('zero daily budget disables the model',async()=>{
    const model=vi.fn();const app=await boot({env:{...enabled,LLM_DAILY_LIMIT:'0'},fetchImpl:model});expect((await (await app.post()).json()).reason).toBe('daily_limit');expect(model).not.toHaveBeenCalled();
  });
  it('persists only daily attempt counters and preserves the cap across server restarts',async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),'chip-wars-ledger-'));directories.push(directory);const ledger=path.join(directory,'usage.json');
    const env={...enabled,LLM_DAILY_LIMIT:'1',LLM_LEDGER_PATH:ledger};
    const model=vi.fn(async()=>provider({actions:[]}));
    const first=await boot({env,fetchImpl:model,now:()=>86400000});expect((await (await first.post()).json()).fallback).toBe(false);
    const content=await readFile(ledger,'utf8');expect(JSON.parse(content)).toEqual({day:1,calls:1});expect(content).not.toContain('test-placeholder');expect(content).not.toContain('CN_GOV');
    if(process.platform!=='win32')expect((await stat(ledger)).mode & 0o777).toBe(0o600);
    const restarted=await boot({env,fetchImpl:model,now:()=>86400000});expect((await (await restarted.post()).json()).reason).toBe('daily_limit');expect(model).toHaveBeenCalledTimes(1);
    const tomorrow=await boot({env,fetchImpl:model,now:()=>172800000});expect((await (await tomorrow.post()).json()).fallback).toBe(false);expect(JSON.parse(await readFile(ledger,'utf8'))).toEqual({day:2,calls:1});
  });
  it.each(['not JSON','{}','{"day":999999999,"calls":0}','{"day":0,"calls":-1}'])('fails closed on corrupted or invalid persistent ledger %s',async(content)=>{
    const directory=await mkdtemp(path.join(tmpdir(),'chip-wars-ledger-'));directories.push(directory);const ledger=path.join(directory,'usage.json');await writeFile(ledger,content);
    const model=vi.fn();const app=await boot({env:{...enabled,LLM_LEDGER_PATH:ledger},fetchImpl:model,now:()=>86400000});
    expect((await (await app.post()).json()).reason).toBe('quota_unavailable');expect(model).not.toHaveBeenCalled();
    expect((await (await fetch(`${app.origin}/api/health`)).json()).llm.enabled).toBe(false);expect(await readFile(ledger,'utf8')).toBe(content);
  });
  it('fails closed if the quota ledger cannot be atomically written',async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),'chip-wars-ledger-'));directories.push(directory);
    const model=vi.fn();const app=await boot({env:{...enabled,LLM_LEDGER_PATH:path.join(directory,'nonexistent','usage.json')},fetchImpl:model});
    expect((await (await app.post()).json()).reason).toBe('quota_unavailable');expect(model).not.toHaveBeenCalled();
  });
  it('bounds concurrency and releases the slot after timeout',async()=>{
    const model=vi.fn(()=>new Promise<Response>(()=>{}));const app=await boot({env:{...enabled,LLM_CONCURRENCY:'1',LLM_TIMEOUT_MS:'100'},fetchImpl:model});
    const first=app.post();await new Promise(resolve=>setTimeout(resolve,20));const second=await app.post();expect(second.status).toBe(429);expect((await second.json()).reason).toBe('busy');await first;
    expect((await app.post()).status).toBe(200);
  });
  it('rejects missing and cross-site origins before invoking a provider',async()=>{
    const model=vi.fn();const app=await boot({env:enabled,fetchImpl:model});
    expect((await app.post(wire(),{Origin:'https://foreign.test'})).status).toBe(403);
    expect((await app.post(wire(),{'Sec-Fetch-Site':'cross-site'})).status).toBe(403);
    expect((await fetch(`${app.origin}/api/agent/decide`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(wire())})).status).toBe(403);expect(model).not.toHaveBeenCalled();
  });
  it('honors a configured public origin',async()=>{
    const app=await boot({env:{PUBLIC_ORIGIN:'https://game.example'}});expect((await app.post()).status).toBe(403);expect((await app.post(wire(),{Origin:'https://game.example'})).status).toBe(200);
  });
  it('bounds body size and requires JSON',async()=>{
    const app=await boot({env:{...enabled,LLM_BODY_LIMIT:'1024'}});expect((await app.post({padding:'x'.repeat(2000)})).status).toBe(413);expect((await app.post(wire(),{'Content-Type':'text/plain'})).status).toBe(415);
  });
  it('rejects malformed JSON',async()=>{
    const app=await boot();const response=await fetch(`${app.origin}/api/agent/decide`,{method:'POST',headers:{Origin:app.origin,'Content-Type':'application/json'},body:'{'});expect(response.status).toBe(400);
  });
  it('rejects leaked full-engine state, mismatched roles and fabricated action costs',async()=>{
    const app=await boot();const hidden=wire();(hidden.observation.publicState.finance as unknown as Record<string,unknown>).firm_cash={TSMC:100};expect((await app.post(hidden)).status).toBe(400);
    const wrong=wire();wrong.legalActions[1].actor='US_GOV';expect((await app.post(wrong)).status).toBe(400);
    const cost=wire();cost.legalActions[1].money_cost=-5;expect((await app.post(cost)).status).toBe(400);
    const extra={...wire(),config:{secret:'never accepted'}};expect((await app.post(extra)).status).toBe(400);
  });
  it('rejects mismatched action lists and unknown private fields',async()=>{
    const app=await boot();const mismatch=wire();mismatch.legalActions=[hold];expect((await app.post(mismatch)).status).toBe(400);
    const leaked=wire();(leaked.observation.privateState as unknown as Record<string,unknown>).opponentWeights={};expect((await app.post(leaked)).status).toBe(400);
  });
  it('serves static assets, SPA routes, health and safe missing-asset responses',async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),'chip-wars-static-'));directories.push(directory);await mkdir(path.join(directory,'assets'));await writeFile(path.join(directory,'index.html'),'<!doctype html><title>Game</title>');await writeFile(path.join(directory,'assets','game.js'),'window.game=true');
    const app=await boot({distDir:directory});
    const page=await fetch(`${app.origin}/play`);expect(page.status).toBe(200);expect(page.headers.get('content-type')).toContain('text/html');
    const asset=await fetch(`${app.origin}/assets/game.js`);expect(asset.headers.get('content-type')).toContain('javascript');expect(asset.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${app.origin}/assets/missing.js`)).status).toBe(404);expect((await fetch(`${app.origin}/.env`)).status).toBe(404);
    expect((await fetch(`${app.origin}/%2e%2e%5cpackage.json`)).status).toBe(404);expect((await fetch(`${app.origin}/api/unknown`)).status).toBe(404);
    expect((await fetch(`${app.origin}/api/agent/decide`)).status).toBe(405);
    const head=await fetch(`${app.origin}/`,{method:'HEAD'});expect(head.status).toBe(200);expect(await head.text()).toBe('');expect(head.headers.get('content-security-policy')).toContain("connect-src 'self'");
  });
});

describe('browser model adapter',()=>{
  it('accepts a legal decision and tags it as LLM',async()=>{
    const model=vi.fn(async()=>new Response(JSON.stringify({fallback:false,decision:{actions:[{id:'HOLD'}],rationale:'等待。'}})));
    const result=await decideLLM(observation(),{fetchImpl:model});expect(result.decision?.source).toBe('llm');expect(result.fallback).toBe(false);
  });
  it.each([
    {fallback:false,decision:{actions:[{id:'US_CHIP_LICENSE',level:2}]}},
    {fallback:false,decision:{actions:[{id:'HOLD'},{id:'CN_SUBSIDY',target:'design'}]}},
    {fallback:false,decision:{actions:[{id:'HOLD',delta:100}]}},
    {fallback:false,decision:{actions:[{id:'HOLD'},{id:'HOLD'}]}},
    {fallback:true,reason:'not_configured'},
    {},
  ])('falls back on invalid or unavailable decisions',async(body)=>{
    expect((await decideLLM(observation(),{fetchImpl:vi.fn(async()=>new Response(JSON.stringify(body)))})).fallback).toBe(true);
  });
  it('falls back when response has malformed JSON or network is down',async()=>{
    expect((await decideLLM(observation(),{fetchImpl:vi.fn(async()=>new Response('{'))})).fallback).toBe(true);
    expect((await decideLLM(observation(),{fetchImpl:vi.fn(async()=>{throw new Error('network');})})).reason).toBe('network_error');
  });
  it('does not block a turn on client timeout',async()=>{
    expect((await decideLLM(observation(),{timeoutMs:20,fetchImpl:vi.fn(()=>new Promise<Response>(()=>{}))})).reason).toBe('timeout');
  });
});
