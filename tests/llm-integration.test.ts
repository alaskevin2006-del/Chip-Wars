import {it,expect} from 'vitest';
import {once} from 'node:events';
import {createEngineAdapter} from '../src/game/adapter';
import {decideLLM} from '../src/agents/llm';
import {createGameServer} from '../server/index.mjs';

it('real six-round observations pass through HTTP proxy schema and model adapter',async()=>{
  let providerCalls=0;
  const server=createGameServer({env:{DEEPSEEK_API_KEY:'unit-test-only',LLM_DAILY_LIMIT:'10'},fetchImpl:async()=>{
    providerCalls++;
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({actions:[],rationale:'保留预算，观察已公布的产业反馈。'})}}]}),{status:200});
  }});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const address=server.address() as {port:number};
  const origin=`http://127.0.0.1:${address.port}`;
  try {
    const adapter=createEngineAdapter({llmDecider:observation=>decideLLM(observation,{
      endpoint:`${origin}/api/agent/decide`,
      fetchImpl:(input,init)=>fetch(input,{...init,headers:{...init?.headers,Origin:origin}}),
    })});
    adapter.start('CN_GOV',{useLLM:true});
    for(let round=0;round<6;round++) {
      const snapshot=await adapter.play([]);
      expect(snapshot.notice).toBeUndefined();
      expect(snapshot.records.at(-1)?.decisions.US_GOV?.source).toBe('llm');
    }
    expect(providerCalls).toBe(6);
  } finally {
    await new Promise<void>((resolve,reject)=>{server.close((error:Error|undefined)=>error?reject(error):resolve());server.closeAllConnections();});
  }
});
