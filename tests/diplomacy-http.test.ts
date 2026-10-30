import {afterEach, describe, expect, it} from 'vitest';
import type {Server} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createDiplomacyServer} from '../server/text-diplomacy-index.mjs';
// @ts-expect-error Runtime module is intentionally plain Node JavaScript.
import {createProvider} from '../server/diplomacy/provider.mjs';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})));});
async function setup(options:Parameters<typeof createDiplomacyServer>[0]={}) {
  const server=createDiplomacyServer({...options,env:{DIPLOMACY_ALLOW_DEMO:'true',...options?.env}});servers.push(server);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('no address');
  const origin=`http://127.0.0.1:${address.port}`;
  const request=async(route:string,method='GET',data?:unknown,token?:string)=>{
    const res=await fetch(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});return {status:res.status,data:await res.json()};
  };
  return {request,origin};
}
describe('authoritative diplomacy HTTP sessions',()=>{
  it('rejects demo sessions by default and cannot replace unavailable live calls with scripts',async()=>{
    const {request}=await setup({env:{DIPLOMACY_ALLOW_DEMO:'false'}});
    const denied=await request('/api/diplomacy/sessions','POST',{mode:'demo',rounds:3,player:null});
    expect(denied.status).toBe(403);expect(denied.data.error).toContain('真实推演');
    expect((await request('/api/diplomacy/sessions','POST',{mode:'live',rounds:3,player:null})).status).toBe(503);
  });
  it('completes three demo rounds with four traceable decisions and rejects stolen sessions',async()=>{
    const {request}=await setup({env:{}});
    const created=await request('/api/diplomacy/sessions','POST',{mode:'demo',rounds:3,player:null});expect(created.status).toBe(201);
    const {id,token}=created.data;const route=`/api/diplomacy/sessions/${id}`;
    expect((await request(route)).status).toBe(404);
    let snapshot=created.data.snapshot;
    for(let i=0;i<12;i++){const res=await request(route+'/step','POST',{expectedVersion:snapshot.version},token);expect(res.status).toBe(200);snapshot=res.data;}
    expect(snapshot.status).toBe('completed');expect(Object.keys(snapshot.decisions)).toHaveLength(4);
    expect(snapshot.messages).toHaveLength(12);expect(snapshot.messages.every((m:{source:string})=>m.source==='demo')).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('private_notes');
    expect((await request(route+'/step','POST',{expectedVersion:0},token)).status).toBe(409);
    expect((await request(route,'DELETE',undefined,token)).status).toBe(200);expect((await request(route,'GET',undefined,token)).status).toBe(404);
  });
  it('validates player actions and controls pause/resume without advancing',async()=>{
    const {request}=await setup({env:{}});const {data}=await request('/api/diplomacy/sessions','POST',{mode:'demo',rounds:3,player:'USA'});
    const route=`/api/diplomacy/sessions/${data.id}`,token=data.token;expect(data.snapshot.status).toBe('awaiting_player');
    const bad=await request(route+'/step','POST',{expectedVersion:0,action:{agent:'ASML',action:'decision'}},token);expect(bad.status).toBe(422);
    const paused=await request(route+'/control','POST',{command:'pause'},token);expect(paused.data.status).toBe('paused');
    expect((await request(route+'/step','POST',{expectedVersion:0},token)).data.version).toBe(0);
    await request(route+'/control','POST',{command:'resume'},token);
    const valid=await request(route+'/step','POST',{expectedVersion:0,action:{agent:'USA',action:'message',target:'Netherlands',content:'希望先讨论许可范围，不要求荷方自动改变法律。',proposal_id:null,reason:'玩家提出磋商。',is_public:false}},token);
    expect(valid.status).toBe(200);expect(valid.data.version).toBe(1);expect(valid.data.messages[0].source).toBe('player');
  });
  it('does not silently switch live simulations to demo when credentials are absent',async()=>{
    const {request,origin}=await setup({env:{}});const health=await request('/api/health');expect(health.data.llm.enabled).toBe(false);
    expect((await request('/api/diplomacy/sessions','POST',{mode:'live',rounds:3,player:null})).status).toBe(503);
    const res=await fetch(origin+'/api/diplomacy/sessions',{method:'POST',headers:{Origin:'http://evil.example','Content-Type':'application/json'},body:'{}'});expect(res.status).toBe(403);
  });
  it('pause and duplicate requests cannot commit a stale model action',async()=>{
    let release:((x:unknown)=>void)|undefined;
    const provider={status:()=>({enabled:true,model:'test'}),decide:()=>new Promise<unknown>(resolve=>{release=resolve;})};
    const {request}=await setup({provider,env:{}});const {data}=await request('/api/diplomacy/sessions','POST',{mode:'live',rounds:3,player:null});const route=`/api/diplomacy/sessions/${data.id}`,token=data.token;
    const running=request(route+'/step','POST',{expectedVersion:0},token);
    for(let i=0;i<30&&!release;i++)await new Promise(resolve=>setTimeout(resolve,5));
    expect(release).toBeDefined();expect((await request(route+'/step','POST',{expectedVersion:0},token)).status).toBe(409);
    await request(route+'/control','POST',{command:'pause'},token);
    release!({agent:'USA',action:'statement',target:null,content:'stale',proposal_id:null,reason:'',is_public:true});
    const res=await running;expect(res.data.version).toBe(0);expect(res.data.status).toBe('paused');expect(res.data.messages).toHaveLength(0);
  });
  it('records provider failure and never fabricates final decisions',async()=>{
    const provider={status:()=>({enabled:true,model:'test'}),decide:async()=>{throw Error('timeout');}};
    const {request}=await setup({provider,env:{}});const {data}=await request('/api/diplomacy/sessions','POST',{mode:'live',rounds:1,player:null});const route=`/api/diplomacy/sessions/${data.id}`;let snapshot=data.snapshot;
    for(let i=0;i<4;i++)snapshot=(await request(route+'/step','POST',{expectedVersion:snapshot.version},data.token)).data;
    expect(snapshot.status).toBe('completed');expect(Object.keys(snapshot.decisions)).toHaveLength(0);expect(snapshot.errors).toHaveLength(4);expect(snapshot.messages).toHaveLength(0);
  });
});
describe('DeepSeek structured output adapter',()=>{
  const env={DEEPSEEK_API_KEY:'test-key-not-real',LLM_TIMEOUT_MS:'100',LLM_DAILY_LIMIT:'10'};
  it('retries invalid JSON once, sends only supplied observation and returns validated action',async()=>{
    const requests:string[]=[];let calls=0;const action={agent:'USA',action:'statement',target:null,content:'磋商',proposal_id:null,reason:'公开理由',is_public:true};
    const provider=createProvider({env,fetchImpl:async(_url:string,init:RequestInit)=>{requests.push(String(init.body));calls++;return new Response(JSON.stringify({choices:[{message:{content:calls===1?'not-json':JSON.stringify(action),reasoning_content:'DO NOT SAVE'}}]}));}});
    const result=await provider.decide({role:{id:'USA',name:'美国政府'},round:1,rounds:3,messages:[]},(a:unknown)=>({valid:JSON.stringify(a)===JSON.stringify(action)}));expect(result).toEqual(action);expect(calls).toBe(2);expect(requests[0]).not.toContain('DO NOT SAVE');expect(requests[0]).toContain('json_object');
  });
  it('rejects persistent invalid actions and bounds a noncooperating fetch timeout',async()=>{
    const invalid=createProvider({env,fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}))});await expect(invalid.decide({role:{id:'USA'}},()=>({valid:false}))).rejects.toThrow('invalid_model_action');
    const timeout=createProvider({env,fetchImpl:()=>new Promise(()=>{})});await expect(timeout.decide({role:{id:'USA'}},()=>({valid:true}))).rejects.toThrow('timeout');
  });
  it('persists quota across provider restarts and fails closed on malformed ledger',async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),'diplomacy-quota-'));const ledger=path.join(dir,'usage.json');let calls=0;
    const options={env:{...env,LLM_DAILY_LIMIT:'1',LLM_LEDGER_PATH:ledger},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}));}};
    try {
      await createProvider(options).decide({role:{id:'USA'}},()=>({valid:true}));
      await expect(createProvider(options).decide({role:{id:'USA'}},()=>({valid:true}))).rejects.toThrow('daily_limit');
      await writeFile(ledger,JSON.stringify({calls:0}));
      await expect(createProvider(options).decide({role:{id:'USA'}},()=>({valid:true}))).rejects.toThrow('daily_limit');expect(calls).toBe(1);
    } finally {if(!path.resolve(dir).startsWith(path.resolve(tmpdir(),'diplomacy-quota-')))throw Error('Unexpected temporary directory');await rm(dir,{recursive:true,force:true});}
  });
});
