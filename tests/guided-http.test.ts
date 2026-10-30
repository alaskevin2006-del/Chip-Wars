import {describe,it,expect} from 'vitest';
import {createDiplomacyServer} from '../server/diplomacy-index.mjs';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
describe('actual signing failure recovery',()=>{
 it('waits for player intent then sends that visible intent to NPC negotiation',async()=>{
  const observations:any[]=[];const provider={status:()=>({enabled:true,model:'fixture-only'}),decide:async(o:any)=>{observations.push(o);return o.task==='negotiation'?{messages:[],proposal:null}:o.task==='signing'?{responses:[]}:{actionId:'PASS'};}};
  const server=createDiplomacyServer({env:{},provider,playerTimeoutMs:60000});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const a=server.address();if(!a||typeof a==='string')throw Error();const origin=`http://127.0.0.1:${a.port}`;
  const post=async(url:string,body:unknown,token?:string)=>{const r=await fetch(origin+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  try{
   const {data}=await post('/api/diplomacy/sessions',{playerRole:'US'});await pause(60);expect(observations).toHaveLength(0);
   const r=await post('/api/diplomacy/sessions/'+data.id+'/message',{expectedVersion:data.snapshot.version,content:'希望荷兰配合协调，请先讨论交换。',target:null},data.token);expect(r.status).toBe(200);
   for(let n=0;n<100&&observations.length<3;n++)await pause(5);expect(observations).toHaveLength(3);
   for(const o of observations)expect(o.decisionBrief.currentMessages.some((m:any)=>m.content.includes('讨论交换'))).toBe(true);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 });
 it('executes deterministic acceptance after failed signing then preserves the promise in action fallback',async()=>{
  const provider={status:()=>({enabled:true,model:'fixture-only'}),decide:async(o:any)=>{if(['signing','action'].includes(o.task))throw Error('simulated provider failure');return {messages:[],proposal:null};}};
  const server=createDiplomacyServer({env:{},provider,draws:{US:1,CN:0,NL:0,AS:1},seed:123,reportDelayMs:60000});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();if(!addr||typeof addr==='string')throw Error();const origin=`http://127.0.0.1:${addr.port}`;let auth:any,s:any;
  const req=async(suffix='',method='GET',body?:unknown)=>{const r=await fetch(origin+'/api/diplomacy/sessions'+(auth?'/'+auth.id+suffix:''),{method,headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth.token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
  async function write(op:string,payload:any={}){for(let n=0;n<15;n++){s=(await req()).data;const r=await req('/'+op,'POST',{expectedVersion:s.version,...payload});if(r.status===409){await pause(5);continue;}expect(r.status).toBe(200);s=r.data;return;}throw Error('stale');}
  try{
   const c=await req('','POST',{playerRole:'US'});auth=c.data;s=auth.snapshot;expect(s.actionPreviews.find((p:any)=>p.actionId==='U1').branches[0].delta.E).toBe(-1);
   await write('proposal',{commitments:{US:'U3',NL:'N3'},text:'本轮互相配合协调。'});await write('ready');
   for(let n=0;n<100;n++){s=(await req()).data;if(s.phase==='signing'&&s.readyRoles.includes('NL'))break;await pause(10);}
   expect(s.deals[0].status).toBe('effective');expect(s.deals[0].accepted).toContain('NL');expect(s.notices.some((n:any)=>n.task==='signing'&&n.message.includes('确定性接受或拒绝'))).toBe(true);
   await write('ready');for(let n=0;n<100;n++){s=(await req()).data;if(s.phase==='actions'&&s.submittedRoles.length===3)break;await pause(10);}
   await write('action',{actionId:'U3'});expect(s.phase).toBe('report');expect(s.reportHistory[0].actions.NL).toBe('N3');expect(s.reportHistory[0].sources.NL).toBe('fallback');expect(s.reportHistory[0].deals[0].status).toBe('fulfilled');
   for(const k of ['T','A','E','S','P']){const r=s.reportHistory[0];const effects=r.effects.reduce((n:number,e:any)=>n+(e.delta[k]||0),0);expect(Number((r.roundStart[k]+effects+r.adjustment[k]).toFixed(2))).toBe(r.state[k]);}
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 });
});
