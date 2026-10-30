import {afterEach,describe,expect,it} from 'vitest';
import type {Server} from 'node:http';
import {createDiplomacyServer} from '../server/diplomacy-index.mjs';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r())})));});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function setup(provider:any,extra:Record<string,unknown>={}){
 const server=createDiplomacyServer({env:{},provider,seed:12345,draws:{US:0,CN:0,NL:0,AS:1},playerTimeoutMs:60000,reportDelayMs:60000,...extra});servers.push(server);
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();if(!addr||typeof addr==='string')throw Error();const origin=`http://127.0.0.1:${addr.port}`;
 return async(route:string,method='GET',body?:unknown,token?:string)=>{const r=await fetch(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
}
describe('V1.6 private autonomous HTTP integration',()=>{
 it('uses explicit deterministic goal-based actions after model failure and completes without polling',async()=>{
  const request=await setup({status:()=>({enabled:true,model:'offline-test'}),decide:async(o:any)=>{if(o.task==='action')throw Error('upstream failure');return o.task==='signing'?{responses:[]}:{messages:[],proposal:null};}},{playerTimeoutMs:15,reportDelayMs:5});
  expect((await request('/api/health')).data.rulesVersion).toBe('1.6');
  const {data}=await request('/api/diplomacy/sessions','POST',{playerRole:'US'});await sleep(1300);
  const s=(await request(`/api/diplomacy/sessions/${data.id}`,'GET',undefined,data.token)).data;
  expect(s.phase).toBe('finished');expect(s.reportHistory).toHaveLength(4);expect(s.notices.some((n:any)=>n.message.includes('确定性策略兜底'))).toBe(true);
  for(const r of s.reportHistory){expect(r.sources.CN).toBe('fallback');expect(r.sources.NL).toBe('fallback');expect(r.sources.US).toBe('timeout');expect(r.actions.CN).not.toBe('PASS');expect(r.actions.NL).not.toBe('PASS');expect(['hidden','S4']).toContain(r.actions.AS);}
  expect(s.goals).toBeUndefined();expect(s.seed).toBeUndefined();expect(s.randomRecords).toBeUndefined();expect(Object.values(s.results).every((r:any)=>typeof r.substantiveVictory==='boolean'&&typeof r.diplomaticVictory==='boolean')).toBe(true);
 });
 it('keeps private terms and AS actions out of every outsider snapshot, report and secretary input',async()=>{
  const seen:any[]=[];
  const provider={status:()=>({enabled:true,model:'offline-test'}),decide:async(o:any,validate:any)=>{
   seen.push(structuredClone(o));let value:any;
   if(o.task==='negotiation')value={messages:o.role.id==='AS'?[{content:'PRIVATE_MSG_CANARY',target:'CN'}]:[],proposal:o.role.id==='CN'?{commitments:{CN:'C3',AS:'S1'},text:'PRIVATE_DEAL_CANARY'}:null};
   if(o.task==='signing')value={responses:o.deals.filter((d:any)=>d.status==='pending'&&d.commitments?.[o.role.id]&&!d.accepted?.includes(o.role.id)).map((d:any)=>({dealId:d.id,accept:true}))};
   if(o.task==='action')value={actionId:o.role.id==='CN'?'C3':o.role.id==='NL'?'PASS':'S1'};
   if(o.task==='secretary')value={otherRequests:[],possibleMotives:[],relevantActions:['U1'],risks:['只能分析可见信息。']};
   const result=validate(value);if(!result.valid)throw Error(result.error);return value;
  }};
  const request=await setup(provider);const {data}=await request('/api/diplomacy/sessions','POST',{playerRole:'US'});const route=`/api/diplomacy/sessions/${data.id}`;let s=data.snapshot;
  async function read(){s=(await request(route,'GET',undefined,data.token)).data;const text=JSON.stringify(s);expect(text).not.toContain('PRIVATE_MSG_CANARY');expect(text).not.toContain('PRIVATE_DEAL_CANARY');return s;}
  async function write(op:string,value:any={}){for(let n=0;n<20;n++){await read();const r=await request(route+'/'+op,'POST',{expectedVersion:s.version,...value},data.token);if(r.status===409){await sleep(5);continue;}expect(r.status).toBe(200);s=r.data;return;}throw Error('stale');}
  for(let n=0;n<200&&s.phase!=='report';n++){await read();if(['negotiation','signing'].includes(s.phase)&&!s.readyRoles.includes('US'))await write('ready');else if(s.phase==='actions'&&!s.ownAction)await write('action',{actionId:'U1'});else await sleep(10);}
  await read();expect(s.phase).toBe('report');const d=s.deals[0];expect(d.participants).toEqual(['CN','AS']);expect(d.commitments).toBeUndefined();expect(d.text).toBeUndefined();expect(s.reportHistory[0].actions.AS).toBe('hidden');expect(s.reportHistory[0].sources.AS).toBeUndefined();
  expect((await request(route+'/secretary','POST',{},data.token)).status).toBe(200);
  const sec=seen.find(o=>o.task==='secretary');expect(JSON.stringify(sec)).not.toContain('PRIVATE_DEAL_CANARY');expect(JSON.stringify(sec)).not.toContain('PRIVATE_MSG_CANARY');
  const as=seen.find(o=>o.role.id==='AS'&&o.task==='action');expect(JSON.stringify(as)).toContain('PRIVATE_DEAL_CANARY');expect(JSON.stringify(as)).toContain('PRIVATE_MSG_CANARY');
 });
 it('rejects client seeds and old rules while polish remains an optional toned candidate',async()=>{
  const request=await setup({status:()=>({enabled:true,model:'offline-test'}),decide:async(o:any)=>o.task==='polish'?{candidate:o.originalText}:o.task==='action'?{actionId:'PASS'}:o.task==='signing'?{responses:[]}:{messages:[],proposal:null}});
  expect((await request('/api/diplomacy/sessions','POST',{playerRole:'US',seed:123})).status).toBe(400);
  const old=await request('/api/diplomacy/sessions','POST',{mode:'live',rounds:2,player:'China'});expect(old.status).toBe(409);expect(old.data.error).toContain('V1.6');
  const {data}=await request('/api/diplomacy/sessions','POST',{playerRole:'US'});const route=`/api/diplomacy/sessions/${data.id}`;
  expect((await request(route+'/polish','POST',{text:'合作',tone:'friendly'},data.token)).data.candidate).toBe('合作');expect((await request(route+'/polish','POST',{text:'合作',tone:'invalid'},data.token)).status).toBe(422);
  const s=(await request(route,'GET',undefined,data.token)).data;expect(s.messages.filter((m:any)=>m.from==='US')).toHaveLength(0);
 });
});
