import {afterEach,describe,expect,it} from 'vitest';
import type {Server} from 'node:http';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createDiplomacyServer} from '../server/diplomacy-index.mjs';
const servers:Server[]=[];
const dirs:string[]=[];
afterEach(async()=>{
 await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r())})));
 for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});
});
const offline={status:()=>({enabled:true,model:'offline-test'}),decide:async()=>({messages:[],proposal:null,responses:[]})};
async function boot(dataDir:string){
 const server=createDiplomacyServer({env:{},provider:offline,seed:12345,draws:{US:0,CN:0,NL:0,AS:1},playerTimeoutMs:60000,reportDelayMs:60000,persist:true,dataDir} as never);
 servers.push(server);
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();if(!addr||typeof addr==='string')throw Error();const origin=`http://127.0.0.1:${addr.port}`;
 return async(route:string,method='GET',body?:unknown,token?:string,extra:Record<string,string>={})=>{const r=await fetch(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
}
const scratch=()=>{const dir=mkdtempSync(path.join(tmpdir(),'chip-persist-'));dirs.push(dir);return dir;};
describe('session persistence across restarts',()=>{
 it('keeps a session readable after the process restarts on the same store',async()=>{
  const dir=scratch();
  const first=await boot(dir);
  const {status,data}=await first('/api/diplomacy/sessions','POST',{playerRole:'US'});
  expect(status).toBe(201);
  expect(readdirSync(dir).filter(n=>n.endsWith('.json'))).toHaveLength(1);
  await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r())})));
  const second=await boot(dir);
  expect((await second('/api/health')).data.sessions).toBe(1);
  const read=await second(`/api/diplomacy/sessions/${data.id}`,'GET',undefined,data.token);
  expect(read.status).toBe(200);
  expect(read.data.id).toBe(data.id);expect(read.data.playerRole).toBe('US');expect(read.data.version).toBe(data.snapshot.version);
 });
 it('drops the store entry when the player deletes the session',async()=>{
  const dir=scratch();
  const request=await boot(dir);
  const {data}=await request('/api/diplomacy/sessions','POST',{playerRole:'CN'});
  expect(readdirSync(dir).filter(n=>n.endsWith('.json'))).toHaveLength(1);
  expect((await request(`/api/diplomacy/sessions/${data.id}`,'DELETE',undefined,data.token)).status).toBe(200);
  expect(readdirSync(dir).filter(n=>n.endsWith('.json'))).toHaveLength(0);
  expect((await request(`/api/diplomacy/sessions/${data.id}`,'GET',undefined,data.token)).status).toBe(404);
 });
 it('survives a player move and rehydrates the same version',async()=>{
  const dir=scratch();
  const first=await boot(dir);
  const {data}=await first('/api/diplomacy/sessions','POST',{playerRole:'US'});
  const moved=await first(`/api/diplomacy/sessions/${data.id}/declare`,'POST',{expectedVersion:data.snapshot.version},data.token);
  expect(moved.status).toBe(200);
  await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r())})));
  const second=await boot(dir);
  const read=await second(`/api/diplomacy/sessions/${data.id}`,'GET',undefined,data.token);
  // The NPC loop resumes after rehydration, so the disk copy may already be ahead of the response.
  expect(read.status).toBe(200);expect(read.data.version).toBeGreaterThanOrEqual(moved.data.version);
  expect(read.data.playerRole).toBe('US');
 });
});

describe('session token transport',()=>{
 // The hosted share gateway consumes the Authorization header, so the token must also
 // travel in a custom header (and as a query fallback) or every request 404s online.
 it('accepts the token from the x-session-token header when Authorization is dropped',async()=>{
  const dir=scratch();
  const request=await boot(dir);
  const {data}=await request('/api/diplomacy/sessions','POST',{playerRole:'US'});
  const read=await request(`/api/diplomacy/sessions/${data.id}`,'GET',undefined,undefined,{'x-session-token':data.token});
  expect(read.status).toBe(200);
  expect(read.data.id).toBe(data.id);
 });
 it('accepts the token as a query parameter',async()=>{
  const dir=scratch();
  const request=await boot(dir);
  const {data}=await request('/api/diplomacy/sessions','POST',{playerRole:'US'});
  const read=await request(`/api/diplomacy/sessions/${data.id}?token=${data.token}`,'GET');
  expect(read.status).toBe(200);
 });
 it('still rejects a request without any credential',async()=>{
  const dir=scratch();
  const request=await boot(dir);
  const {data}=await request('/api/diplomacy/sessions','POST',{playerRole:'US'});
  expect((await request(`/api/diplomacy/sessions/${data.id}`,'GET')).status).toBe(404);
  expect((await request(`/api/diplomacy/sessions/${data.id}`,'GET',undefined,'wrong-token')).status).toBe(404);
 });
});
