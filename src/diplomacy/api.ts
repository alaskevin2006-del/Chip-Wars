import type { DiplomacyAction, Role, Snapshot } from './types';
export interface Session {id:string;token:string;snapshot:Snapshot}
async function request<T>(path:string, method='GET', body?:unknown, token?:string):Promise<T> {
  const response=await fetch(path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(typeof data?.error==='string'?data.error:typeof data?.message==='string'?data.message:`请求未完成（${response.status}），请重试。`);
  return data as T;
}
const base='/api/diplomacy/sessions';
export const api={
  health:()=>request<{status:string;llm:{enabled:boolean;model:string}}>('/api/health'),
  create:(mode:'demo'|'live',rounds:number,player:Role|null)=>request<Session>(base,'POST',{mode,rounds,player}),
  step:(s:Session,expectedVersion:number,action?:DiplomacyAction)=>request<Snapshot>(`${base}/${s.id}/step`,'POST',{expectedVersion,...(action?{action}:{})},s.token),
  control:(s:Session,command:'pause'|'resume')=>request<Snapshot>(`${base}/${s.id}/control`,'POST',{command},s.token),
  remove:(s:Session)=>request<unknown>(`${base}/${s.id}`,'DELETE',undefined,s.token),
};
