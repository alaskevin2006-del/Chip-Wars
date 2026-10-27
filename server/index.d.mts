import type { Server } from 'node:http';
export interface ServerOptions {
  env?:Record<string,string|undefined>;
  fetchImpl?:typeof fetch;
  now?:()=>number;
  distDir?:string;
}
export function createGameServer(options?:ServerOptions):Server;
