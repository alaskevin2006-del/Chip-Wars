import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
// @ts-expect-error Server-only runtime module.
import {createProvider} from '../server/diplomacy/provider.mjs';
const observation={role:{id:'USA',name:'美国政府'},round:1,rounds:4,messages:[]};
describe('explicit unlimited provider allowance',()=>{
 it.each(['unlimited','Infinity'])('%s continues above the previous cap and preserves finite audit counters across restart',async allowance=>{
  const dir=await mkdtemp(path.join(tmpdir(),'diplomacy-unlimited-'));const ledger=path.join(dir,'usage.json');let calls=0;
  const options={env:{DEEPSEEK_API_KEY:'test-key-not-real',LLM_DAILY_LIMIT:allowance,LLM_LEDGER_PATH:ledger},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}));}};
  try{
   const day=new Date().toISOString().slice(0,10);await writeFile(ledger,JSON.stringify({day,calls:60}));
   const provider=createProvider(options);expect(provider.status().enabled).toBe(true);
   for(let n=0;n<3;n++)await provider.decide(observation,()=>({valid:true}));
   await createProvider(options).decide(observation,()=>({valid:true}));
   expect(calls).toBe(4);expect(JSON.parse(await readFile(ledger,'utf8'))).toEqual({day,calls:64});
  }finally{if(!path.resolve(dir).startsWith(path.resolve(tmpdir(),'diplomacy-unlimited-')))throw Error('Unexpected test directory');await rm(dir,{recursive:true,force:true});}
 });
 it('keeps zero allowance disabled',async()=>{
  let called=false;const provider=createProvider({env:{DEEPSEEK_API_KEY:'test-key-not-real',LLM_DAILY_LIMIT:'0'},fetchImpl:async()=>{called=true;throw Error();}});
  expect(provider.status().enabled).toBe(false);await expect(provider.decide(observation,()=>({valid:true}))).rejects.toThrow('daily_limit');expect(called).toBe(false);
 });
 it('does not reset malformed audit counters even when the daily cap is removed',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'diplomacy-unlimited-'));const ledger=path.join(dir,'usage.json');let called=false;
  try{
   await writeFile(ledger,'invalid');const provider=createProvider({env:{DEEPSEEK_API_KEY:'test-key-not-real',LLM_DAILY_LIMIT:'unlimited',LLM_LEDGER_PATH:ledger},fetchImpl:async()=>{called=true;throw Error();}});
   await expect(provider.decide(observation,()=>({valid:true}))).rejects.toThrow('daily_limit');expect(called).toBe(false);expect(await readFile(ledger,'utf8')).toBe('invalid');
  }finally{if(!path.resolve(dir).startsWith(path.resolve(tmpdir(),'diplomacy-unlimited-')))throw Error('Unexpected test directory');await rm(dir,{recursive:true,force:true});}
 });
});
