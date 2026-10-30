import type { Commitments, Role, SecretaryAdvice, Session, Snapshot, ActionId } from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export type Auth = Pick<Session, 'id'|'token'>;
async function request<T>(path: string, method = 'GET', body?: unknown, auth?: Auth): Promise<T> {
  const response = await fetch(path, {method, cache:'no-store', headers: {
    ...(body === undefined ? {} : {'Content-Type':'application/json'}),
    ...(auth ? {Authorization:`Bearer ${auth.token}`} : {}),
  }, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error?.message || (typeof data?.error === 'string' ? data.error : data?.message) || `请求失败（${response.status}）`, response.status);
  return data as T;
}
const path = (auth: Auth, suffix = '') => `/api/diplomacy/sessions/${encodeURIComponent(auth.id)}${suffix}`;
export const api = {
  health: () => request<{status:string;llm:{enabled:boolean;model:string};rulesVersion:string}>('/api/health'),
  create: (playerRole: Role) => request<Session>('/api/diplomacy/sessions','POST',{playerRole}),
  read: (auth: Auth) => request<Snapshot>(path(auth),'GET',undefined,auth),
  remove: (auth: Auth) => request<{deleted:true}>(path(auth),'DELETE',undefined,auth),
  write: (auth: Auth, operation: 'message'|'proposal'|'respond'|'ready'|'action'|'next', expectedVersion: number, payload: {content?:string;target?:Role|null;commitments?:Commitments;text?:string;dealId?:string;accept?:boolean;actionId?:ActionId} = {}) => request<Snapshot>(path(auth,`/${operation}`),'POST',{expectedVersion,...payload},auth),
  polish: (auth: Auth, text: string, tone: 'neutral'|'firm'|'friendly' = 'neutral') => request<{candidate:string}>(path(auth,'/polish'),'POST',{text,tone},auth),
  secretary: (auth: Auth) => request<{advice:SecretaryAdvice}>(path(auth,'/secretary'),'POST',{},auth),
};
