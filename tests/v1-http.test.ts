import {afterEach,describe,expect,it} from 'vitest';
import type {Server} from 'node:http';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createDiplomacyServer} from '../server/v1-index.mjs';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>{s.closeAllConnections();s.close(()=>resolve());})));});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function setup(extra:Parameters<typeof createDiplomacyServer>[0]={}){
 const seen:any[]=[];
 const provider={status:()=>({enabled:true,model:'test-only'}),decide:async(obs:any,validate:any)=>{
  seen.push(structuredClone(obs));let output:any;
  if(obs.task==='negotiation')output={messages:obs.role.id==='CN'?[{content:'CN_PRIVATE_CANARY',target:'AS'}]:[],proposal:obs.role.id==='NL'?{commitments:{US:'U3',NL:'N3'},text:'本轮联合项目承诺。'}:null};
  if(obs.task==='signing')output={responses:[]};
  if(obs.task==='action')output={actionId:obs.role.id==='CN'?(obs.round<=2?'C1':'C3'):obs.role.id==='NL'?'N3':'S3'};
  if(obs.task==='polish')output={candidate:obs.originalText};
  if(obs.task==='secretary')output={otherRequests:[],possibleMotives:[{text:'可能重视产业协作。',uncertain:true}],relevantActions:['U3'],risks:['承诺不等于实际履约。']};
  const result=validate(output);if(!result.valid)throw Error(result.error);return output;
 }};
 const server=createDiplomacyServer({env:{},provider,playerTimeoutMs:60000,reportDelayMs:60000,draws:{US:0,CN:0,NL:0,AS:1},...extra});servers.push(server);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();if(!addr||typeof addr==='string')throw Error('No address');const origin=`http://127.0.0.1:${addr.port}`;
 const request=async(route:string,method='GET',body?:unknown,token?:string)=>{const res=await fetch(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};
 return {request,seen,origin};
}
describe('V1 authoritative scheduling and privacy',()=>{
 it('identifies the previous page request and asks for a refresh without creating a game',async()=>{
  const {request,seen}=await setup();
  const result=await request('/api/diplomacy/sessions','POST',{mode:'live',rounds:2,player:'China'});
  expect(result.status).toBe(409);expect(result.data.error).toContain('刷新页面');expect(result.data.error).toContain('四回合 V1.0');expect(seen).toHaveLength(0);
 });
 it('never caches the HTML entry while retaining immutable fingerprinted assets',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'v1-client-version-'));
  try{
   await mkdir(path.join(dir,'assets'));await writeFile(path.join(dir,'index.html'),'<title>Chip Diplomacy V1.0</title>');await writeFile(path.join(dir,'assets','main-fingerprint.js'),'console.log("V1")');
   const {origin}=await setup({distDir:dir});
   for(const entry of ['/','/index.html','/dialogue']){const res=await fetch(origin+entry);expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('no-store');await res.text();}
   const asset=await fetch(origin+'/assets/main-fingerprint.js');expect(asset.headers.get('Cache-Control')).toContain('immutable');await asset.text();
  }finally{if(!path.resolve(dir).startsWith(path.resolve(tmpdir(),'v1-client-version-')))throw Error('Unexpected test directory');await rm(dir,{recursive:true,force:true});}
 });
 it('executes four real-rule rounds with signed agreements, secret choices, breach and joint victory',async()=>{
  const {request,seen}=await setup();const created=await request('/api/diplomacy/sessions','POST',{playerRole:'US'});expect(created.status).toBe(201);const {id,token}=created.data,route=`/api/diplomacy/sessions/${id}`;
  expect((await request(route)).status).toBe(404);
  let s=created.data.snapshot;
  const write=async(kind:string,data:Record<string,unknown>={})=>{
   for(let n=0;n<10;n++){s=(await request(route,'GET',undefined,token)).data;const result=await request(route+'/'+kind,'POST',{expectedVersion:s.version,...data},token);if(result.status===409){await sleep(5);continue;}expect(result.status).toBe(200);s=result.data;return;}throw Error('Repeated stale write');
  };
  for(let guard=0;guard<300&&s.phase!=='finished';guard++){
   s=(await request(route,'GET',undefined,token)).data;
   if(s.phase!=='finished'){expect(s.revealedGoals).toBeUndefined();expect(s.goals).toBeUndefined();expect(s.ownGoal.role).toBe('US');expect(JSON.stringify(s.messages)).not.toContain('CN_PRIVATE_CANARY');}
   if(s.phase==='negotiation'&&!s.readyRoles.includes('US'))await write('ready');
   else if(s.phase==='signing'&&!s.readyRoles.includes('US')){
    const incoming=s.deals.find((d:any)=>d.round===s.round&&d.status==='pending'&&d.commitments.US&&!d.accepted.includes('US'));
    if(incoming)await write('respond',{dealId:incoming.id,accept:true});else await write('ready');
   }else if(s.phase==='actions'&&!s.submittedRoles.includes('US')){
    expect(s.actions).toBeUndefined();expect(s.ownAction).toBeUndefined();await write('action',{actionId:s.round===2?'U1':s.round===4?'PASS':'U3'});
   }else if(s.phase==='report')await write('next');else await sleep(10);
  }
  expect(s.phase).toBe('finished');expect(s.reportHistory).toHaveLength(4);expect(s.state).toEqual({A:2,B:5,H:5,R:3});
  expect(s.results.US.won).toBe(true);expect(s.results.NL.won).toBe(true);expect(s.results.AS.won).toBe(false);expect(s.results.US.credit).toBe(1);expect(s.results.US.fulfilledDeals).toBe(2);
  expect(s.reportHistory[1].actions.US).toBe('U1');expect(s.reportHistory[1].deals.some((d:any)=>d.status==='breached')).toBe(true);
  expect(seen.some(obs=>obs.role.id==='AS'&&JSON.stringify(obs.messages).includes('CN_PRIVATE_CANARY'))).toBe(true);
  for(const obs of seen){expect(obs.goals).toBeUndefined();expect(obs.ownGoal.role).toBe(obs.role.id);if(obs.role.id!=='AS'&&obs.role.id!=='CN')expect(JSON.stringify(obs.messages)).not.toContain('CN_PRIVATE_CANARY');if(obs.task==='action')expect(obs.actions).toBeUndefined();}
 });
 it('advances without browser polling and labels timeout PASS without official wins',async()=>{
  const provider={status:()=>({enabled:true,model:'test-only'}),decide:async(obs:any)=>obs.task==='action'?{actionId:'PASS'}:obs.task==='signing'?{responses:[]}:{messages:[],proposal:null}};
  const {request}=await setup({provider,playerTimeoutMs:15,reportDelayMs:5});const {data}=await request('/api/diplomacy/sessions','POST',{playerRole:'CN'});await sleep(850);
  const s=(await request(`/api/diplomacy/sessions/${data.id}`,'GET',undefined,data.token)).data;
  expect(s.phase).toBe('finished');expect(s.reportHistory).toHaveLength(4);expect(s.reportHistory.every((r:any)=>r.sources.CN==='timeout')).toBe(true);expect(Object.values(s.results).every((r:any)=>!r.won)).toBe(true);
 });
 it('rejects mock configuration, injected goals and unavailable provider instead of returning sample decisions',async()=>{
  const {request}=await setup({env:{},provider:{status:()=>({enabled:false,model:'test-only'}),decide:async()=>{throw Error();}}});
  expect((await request('/api/diplomacy/sessions','POST',{playerRole:'US',mode:'demo'})).status).toBe(400);
  expect((await request('/api/diplomacy/sessions','POST',{playerRole:'US',goals:{US:'US_SEC'}})).status).toBe(400);
  expect((await request('/api/diplomacy/sessions','POST',{playerRole:'US'})).status).toBe(503);
 });
 it('polish only returns a candidate and secretary receives only own projection',async()=>{
  const {request,seen}=await setup();const {data}=await request('/api/diplomacy/sessions','POST',{playerRole:'US'});const route=`/api/diplomacy/sessions/${data.id}`;
  const result=await request(route+'/polish','POST',{text:'希望开展合作'},data.token);expect(result.data.candidate).toBe('希望开展合作');
  const advice=await request(route+'/secretary','POST',{},data.token);expect(advice.data.advice.possibleMotives[0].uncertain).toBe(true);
  const current=(await request(route,'GET',undefined,data.token)).data;expect(current.messages.some((m:any)=>m.from==='US')).toBe(false);
  const secretary=seen.find(o=>o.task==='secretary');expect(secretary.ownGoal.role).toBe('US');expect(secretary.goals).toBeUndefined();expect(JSON.stringify(secretary.messages)).not.toContain('CN_PRIVATE_CANARY');
 });
});
