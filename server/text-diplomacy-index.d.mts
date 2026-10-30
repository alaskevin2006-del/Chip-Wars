import type {Server} from 'node:http';
export function createDiplomacyServer(options?: {env?:Record<string,string|undefined>;distDir?:string;fetchImpl?:typeof fetch;provider?:{status():{enabled:boolean;model:string};decide(observation:unknown,validate:(action:unknown)=>{valid:boolean;error?:string},signal:AbortSignal):Promise<unknown>}}):Server;
