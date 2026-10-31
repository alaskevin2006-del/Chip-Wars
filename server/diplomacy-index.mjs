import http from 'node:http';
import path from 'node:path';
import {readdirSync,mkdirSync,readFileSync,renameSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import * as game from './v1/engine.mjs';
import {createGameProvider,validateEnvelope,buildDecisionBrief} from './v1/ai.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ROLES=['US','CN','NL','AS'];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json; charset=utf-8'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const error=(message,status=422)=>Object.assign(new Error(message),{status});
async function body(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw error('需要JSON请求。',415);
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw error('请求过大。',413);chunks.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw error('请求格式无效。',400);}
}
function fields(value,allowed){if(Object.keys(value).some(key=>!allowed.includes(key)))throw error('请求含不支持的字段。',400);}
const same=(a,b)=>a&&b&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createDiplomacyServer(options={}){
 const env=options.env??process.env,provider=options.provider??createGameProvider({env,fetchImpl:options.fetchImpl});
 // The browser caches the old bundle, so expose the build time that the served bundle was produced
 // with; the UI compares it with the time baked into its own script and asks for a reload.
 const buildStamp=()=>{try{return JSON.parse(readFileSync(path.join(dist,'build.json'),'utf8'));}catch{return null;}};
 const dist=path.resolve(options.distDir||path.join(ROOT,'dist')),sessions=new Map(),ips=new Map();
 // Hosted sandboxes restart (or run several workers) behind the gateway, so an in-memory only
 // map loses every session between requests. Keep a disk copy and rehydrate on demand.
 const persistEnabled=options.persist??(process.env.DIPLOMACY_PERSIST!=='0'&&process.env.NODE_ENV!=='test');
 const dataDir=path.resolve(options.dataDir||process.env.DIPLOMACY_DATA_DIR||path.join(tmpdir(),'chip-diplomacy-sessions'));
 const storeFile=id=>path.join(dataDir,`${id}.json`);
 function persist(s){
  if(!persistEnabled||s.cancelled)return;
  try{
   mkdirSync(dataDir,{recursive:true});
   const file=storeFile(s.id),tmp=`${file}.${process.pid}.tmp`;
   writeFileSync(tmp,JSON.stringify({id:s.id,token:s.token,playerRole:s.playerRole,created:s.created,touched:s.touched,notices:s.notices.slice(-100),state:s.state,phaseKey:s.phaseKey,deadlineAt:s.deadlineAt,halted:!!s.halted}));
   renameSync(tmp,file);
  }catch(e){console.warn('[diplomacy] 会话写入失败:',e.message);}
 }
 function forget(id){try{unlinkSync(storeFile(id));}catch{}}
 function restore(id){
  if(!persistEnabled)return null;
  try{
   const d=JSON.parse(readFileSync(storeFile(id),'utf8'));
   if(!d||d.id!==id||!d.state||typeof d.token!=='string')return null;
   if(Date.now()-(d.touched||0)>7200000){forget(id);return null;}
   const s={...d,notices:d.notices||[],epoch:0,busy:false,timer:null,controller:null,assists:new Set(),cancelled:false};
   sessions.set(s.id,s);
   if(!s.halted&&s.state.phase!=='finished')setTimeout(()=>void kick(s),0).unref?.();
   return s;
  }catch{return null;}
 }
 function restoreAll(){
  if(!persistEnabled)return;
  try{
   mkdirSync(dataDir,{recursive:true});
   for(const name of readdirSync(dataDir)){
    const id=/^([a-f0-9]{32})\.json$/.exec(name)?.[1];
    if(id&&!sessions.has(id))restore(id);
   }
  }catch{}
 }
 const playerTimeout=options.playerTimeoutMs??300000,reportDelay=options.reportDelayMs??20000;
 const draw=options.draws??(()=>Object.fromEntries(ROLES.map(role=>[role,randomInt(2)])));
 const seed=options.seed??(()=>randomBytes(4).readUInt32LE(0));
 // The deadline belongs to a window, not to the whole phase: each new actor resets the clock, so a
 // player never loses thinking time to the LLM calls of the windows before theirs.
 const phaseKey=s=>`${s.state.round}:${s.state.phase}:${s.state.phase==='actions'?(game.currentActor(s.state)??'done'):'-'}`;
 function synchronize(s){const key=phaseKey(s);if(key!==s.phaseKey){s.phaseKey=key;s.deadlineAt=Date.now()+(s.state.phase==='report'?reportDelay:playerTimeout);}}
 function snapshot(s){synchronize(s);persist(s);return {...game.getSnapshot(s.state,s.playerRole),id:s.id,deadlineAt:s.state.phase==='finished'?undefined:s.deadlineAt,aiStatus:{busy:s.busy,...(s.workerRole?{role:s.workerRole,task:s.workerTask}:{})},notices:structuredClone(s.notices)};}
 function notice(s,role,task,message){s.notices.push({round:s.state.round,role,task,message});if(s.notices.length>100)s.notices.shift();}
 function release(s){s.cancelled=true;s.epoch++;clearTimeout(s.timer);s.controller?.abort();for(const controller of s.assists||[])controller.abort();}
 function discard(s){release(s);sessions.delete(s.id);forget(s.id);}
 function cleanup(){
  for(const s of sessions.values())if(Date.now()-s.created>7200000||(s.state.phase==='finished'&&Date.now()-s.touched>3600000))discard(s);
  if(!persistEnabled)return;
  const now=Date.now();let mtime=0;
  try{for(const name of readdirSync(dataDir)){const id=/^([a-f0-9]{32})\.json$/.exec(name)?.[1];if(!id||sessions.has(id))continue;try{mtime=statSync(storeFile(id)).mtimeMs;}catch{continue;}if(now-mtime>7200000)forget(id);}}catch{}
 }
 function project(state,role,task,output){
  if(task==='declare')return game.declare(state,role,output,'llm');
  if(task==='negotiation'){for(const m of output.messages)state=game.sendMessage(state,role,{content:m.content,target:m.target},'llm');if(output.proposal)state=game.proposeDeal(state,role,output.proposal);return game.ready(state,role);}
  if(task==='signing'){for(const response of output.responses)state=game.respondDeal(state,role,response);return game.ready(state,role);}
  return game.submitAction(state,role,output.actionId,'llm');
 }
 function taskObservation(s,role,task){const projected={...game.getObservation(s.state,role),task};return {...projected,decisionBrief:buildDecisionBrief(projected)};}
 async function kick(s){
  if(s.busy||s.cancelled)return;clearTimeout(s.timer);s.busy=true;
  try{
   while(!s.cancelled&&s.state.phase!=='finished'){
    synchronize(s);let phase=s.state.phase;persist(s);
    if(phase==='report'){
     if(Date.now()>=s.deadlineAt){s.state=game.advanceRound(s.state);continue;}
     break;
    }
    if(Date.now()>=s.deadlineAt){
     if(phase==='actions'&&game.currentActor(s.state)===s.playerRole){s.state=game.submitAction(s.state,s.playerRole,'PASS','timeout');notice(s,s.playerRole,'action','玩家未在时限内提交，后端以PASS兜底。');continue;}
     if(phase==='announcement'&&!Object.hasOwn(s.state.statements,s.playerRole)&&(s.playerRole==='US'||Object.hasOwn(s.state.statements,'US'))){s.state=game.declare(s.state,s.playerRole,null,'timeout');notice(s,s.playerRole,'declare','玩家表态超时，按保持静默处理。');continue;}
     if(['negotiation','signing'].includes(phase)&&!s.state.readyRoles.includes(s.playerRole)){s.state=game.ready(s.state,s.playerRole);notice(s,s.playerRole,phase,'玩家等待时间已到，结束本阶段；未接受的协议不会自动生效。');continue;}
    }
    // The US speaks first: if the player is the US, NPCs wait for the player's statement.
    if(phase==='announcement'&&!Object.hasOwn(s.state.statements,'US')&&s.playerRole==='US')break;
    // Let the player see the actions and state an intent before NPCs finish talking.
    // Closing the page still advances after the same backend-owned deadline.
    if(phase==='negotiation'&&!s.state.readyRoles.includes(s.playerRole)
      &&!s.state.messages.some(m=>m.round===s.state.round&&m.from===s.playerRole)
      &&!s.state.deals.some(d=>d.round===s.state.round&&d.proposer===s.playerRole))break;
    // In the actions phase only the role whose window is open may move; everyone else is waiting
    // for a fact, and the loop breaks when that fact has to come from the player.
    const role=phase==='actions'
      ?(actor=>actor&&actor!==s.playerRole?actor:null)(game.currentActor(s.state))
      :ROLES.find(role=>role!==s.playerRole&&(phase==='announcement'?!Object.hasOwn(s.state.statements,role):!s.state.readyRoles.includes(role)));
    if(!role)break;
    const task=phase==='actions'?'action':phase==='announcement'?'declare':phase,epoch=s.epoch,key=phaseKey(s);
    s.workerRole=role;s.workerTask=task;
    const observation=taskObservation(s,role,task);
    if(task==='signing'&&!observation.deals.some(d=>d.round===s.state.round&&d.status==='pending'&&d.commitments&&role in d.commitments&&!d.accepted?.includes(role))){s.state=game.ready(s.state,role);continue;}
    s.controller=new AbortController();
    try{
     const output=await provider.decide(observation,value=>{
      const envelope=validateEnvelope(task,value,observation);if(!envelope.valid)return envelope;
      try{project(s.state,role,task,value);return {valid:true};}catch(e){return {valid:false,error:e.message};}
     },s.controller.signal,()=>{if(s.cancelled||epoch!==s.epoch||key!==phaseKey(s))throw Error('stage_changed');return taskObservation(s,role,task);});
     if(s.cancelled||epoch!==s.epoch||key!==phaseKey(s))continue;
     s.state=project(s.state,role,task,output);
    }catch(e){
     if(s.cancelled||epoch!==s.epoch||key!==phaseKey(s))continue;
     if(task==='action'){
      notice(s,role,task,'模型决策未成功，已按V1.6使用确定性策略兜底；优先履行合法协议，否则评估本方目标。');
      s.state=game.submitAction(s.state,role,game.chooseFallbackAction(s.state,role),'fallback');
     }else if(task==='declare'){
      s.state=game.declare(s.state,role,game.chooseFallbackStatement(s.state,role),'fallback');
      notice(s,role,task,'表态模型未成功，已按确定性策略就本方最可能的行动方向如实表态或保持静默。');
     }else if(task==='signing'){
      s.state=project(s.state,role,'signing',{responses:game.chooseFallbackResponses(s.state,role)});
      notice(s,role,task,'安排决策模型未成功，已按可见条款、本方目标和安排冲突执行确定性接受或拒绝；未伪造模型回复。');
     }else{
      s.state=game.ready(s.state,role);notice(s,role,task,'磋商模型未成功，确定性处理为保留现有提案并结束发言；未生成替代示例消息。');
     }
    }finally{s.controller=null;s.workerRole=null;s.workerTask=null;}
   }
  }catch(e){notice(s,undefined,'system','调度遇到错误，请重新开局。');s.halted=true;}
  finally{
   s.busy=false;s.workerRole=null;s.workerTask=null;persist(s);
   if(!s.cancelled&&!s.halted&&s.state.phase!=='finished'){
    synchronize(s);s.timer=setTimeout(()=>void kick(s),Math.max(10,s.deadlineAt-Date.now()+5));s.timer.unref?.();
   }
  }
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try{
   const url=new URL(req.url,'http://localhost');
   const pathname=decodeURIComponent(url.pathname);
   if(pathname==='/api/health'&&req.method==='GET'){json(res,200,{status:'ok',llm:provider.status(),rulesVersion:'1.6',pid:process.pid,uptime:Math.round(process.uptime()),sessions:sessions.size,store:persistEnabled?dataDir:null,build:buildStamp(),auth:{bearer:!!req.headers.authorization,custom:!!req.headers['x-session-token']},proxy:{host:req.headers.host||'',forwardedHost:req.headers['x-forwarded-host']||'',forwardedProto:req.headers['x-forwarded-proto']||'',expected:env.PUBLIC_ORIGIN||null}});return;}
   if(pathname.startsWith('/api/')){
    cleanup();
    if(req.method!=='GET'){
     const forwardedHost=req.headers['x-forwarded-host']?String(req.headers['x-forwarded-host']).split(',')[0].trim():'';
     const forwardedProto=req.headers['x-forwarded-proto']?String(req.headers['x-forwarded-proto']).split(',')[0].trim():'http';
     const host=forwardedHost||req.headers.host||'';
     const expected=env.PUBLIC_ORIGIN||`${forwardedProto}://${host}`;
     const originHost=(()=>{try{return new URL(req.headers.origin||'').host;}catch{return '';}})();
     const publicHost=(()=>{try{return env.PUBLIC_ORIGIN?new URL(env.PUBLIC_ORIGIN).host:'';}catch{return '';}})();
     const sameHost=!!originHost&&[host,req.headers.host,publicHost].includes(originHost);
     const hosted=!!originHost&&(env.HOSTED_ORIGIN_SUFFIX||'.workbuddy.host').split(',').some(s=>s&&originHost.endsWith(s.trim()));
     const local=req.socket.remoteAddress?.match(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/)&&['http://127.0.0.1:3000','http://localhost:3000','http://[::1]:3000','http://127.0.0.1:5001','http://localhost:5001'].includes(req.headers.origin);
     if(req.headers.origin&&req.headers.origin!==expected&&!sameHost&&!hosted&&!local)throw error('请求来源不匹配。',403);
     if(req.headers['sec-fetch-site']&&!['same-origin','same-site','none'].includes(req.headers['sec-fetch-site']))throw error('请求来源不匹配。',403);
     const now=Date.now();for(const [key,value]of ips)if(now>value.until)ips.delete(key);
     const ip=req.socket.remoteAddress||'',rate=ips.get(ip)||{count:0,until:now+60000};rate.count++;ips.set(ip,rate);if(rate.count>120||ips.size>4096)throw error('请求过于频繁。',429);
    }
    if(pathname==='/api/diplomacy/sessions'&&req.method==='POST'){
     const input=await body(req);
     if(!Object.hasOwn(input,'playerRole')&&['mode','rounds','player'].some(key=>Object.hasOwn(input,key)))throw error('页面版本已更新为四回合 V1.6。请刷新页面后重新选择角色并开局。',409);
     fields(input,['playerRole']);if(!ROLES.includes(input.playerRole))throw error('请选择四方中的一个角色。',400);
     if(!provider.status().enabled)throw error('DeepSeek尚未配置，无法真实推演。',503);
     if(sessions.size>=30)throw error('会话已满，请稍后重试。',429);
     const s={id:randomBytes(16).toString('hex'),token:randomBytes(32).toString('hex'),state:game.createGame(typeof draw==='function'?draw():draw,typeof seed==='function'?seed():seed),playerRole:input.playerRole,created:Date.now(),touched:Date.now(),notices:[],epoch:0,busy:false,timer:null,controller:null,assists:new Set(),cancelled:false,phaseKey:null};
     sessions.set(s.id,s);persist(s);json(res,201,{id:s.id,token:s.token,snapshot:snapshot(s)});setTimeout(()=>void kick(s),0).unref?.();return;
    }
    const match=pathname.match(/^\/api\/diplomacy\/sessions\/([a-f0-9]{32})(?:\/(message|proposal|respond|ready|action|next|polish|secretary|declare|statement|newscast|brief))?$/);
    if(!match)throw error('接口不存在。',404);
    const s=sessions.get(match[1])||restore(match[1]);
    const token=(req.headers['x-session-token']||req.headers.authorization||'').replace(/^Bearer /,'').trim()||url.searchParams.get('token')||'';
    if(!s||!same(s.token,token))throw error('会话不存在或已过期。',404);s.touched=Date.now();
    if(!match[2]&&req.method==='GET'){json(res,200,snapshot(s));return;}
    if(!match[2]&&req.method==='DELETE'){discard(s);json(res,200,{deleted:true});return;}
    if(req.method!=='POST'||!match[2])throw error('请求方法不支持。',405);
    const input=await body(req),route=match[2];
    if(route==='polish'||route==='secretary'){
     fields(input,route==='polish'?['text','tone']:[]);
     if(route==='polish'&&input.tone!==undefined&&!['neutral','firm','friendly'].includes(input.tone))throw error('请选择有效语气。');
     if(route==='polish'&&(s.state.phase!=='negotiation'||s.state.readyRoles.includes(s.playerRole)))throw error('当前阶段不能润色或发送新声明。');
     if(route==='polish'&&(typeof input.text!=='string'||!input.text.trim()||[...input.text].length>100))throw error('请输入1–100字的原文。');
     const observation={...taskObservation(s,s.playerRole,route),...(route==='polish'?{originalText:input.text,tone:input.tone||'neutral'}:{})};
     const controller=new AbortController(),epoch=s.epoch;s.assists.add(controller);
     let output;try{output=await provider.decide(observation,value=>validateEnvelope(route,value,observation),controller.signal);if(!validateEnvelope(route,output,observation).valid)throw Error();}catch{throw error('AI服务未成功返回有效建议，请稍后重试；未生成示例内容。',503);}finally{s.assists.delete(controller);}
     if(s.cancelled||epoch!==s.epoch)throw error('会话已重开，请重新请求。',409);
     json(res,200,route==='polish'?{candidate:output.candidate,source:output.candidate===input.text?'original':'llm'}:{advice:output});return;
    }
    if(route==='statement'){
     fields(input,['text']);
     if(s.state.phase!=='announcement')throw error('当前阶段不能发表公开宣示。');
     if(Object.hasOwn(s.state.statements,s.playerRole))throw error('本轮已发表过公开宣示。');
     if(s.playerRole!=='US'&&!Object.hasOwn(s.state.statements,'US'))throw error('须等待美方先发表公开宣示。');
     if(typeof input.text!=='string'||[...input.text].length>100)throw error('表态原文最多100字；留白则由幕僚代拟。');
     const original=input.text.trim();
     const controller=new AbortController(),epoch=s.epoch;s.assists.add(controller);
     let output;
     try{
      // A blank draft asks the aide to propose a stance outright; the prompt branch is chosen by originalText.
      const observation={...taskObservation(s,s.playerRole,'declare'),...(original?{originalText:original}:{}),issues:game.ISSUE_IDS};
      output=await provider.decide(observation,value=>validateEnvelope('declare',value,observation),controller.signal);
      if(!validateEnvelope('declare',output,observation).valid)throw Error();
     }catch{throw error('幕僚未能判定出有效立场，可直接保持静默或换一种说法后重试；未生成示例内容。',503);}finally{s.assists.delete(controller);}
     if(s.cancelled||epoch!==s.epoch)throw error('会话已重开，请重新请求。',409);
     // reason is advice for the player, never part of the recorded statement the engine stores.
     json(res,200,{statement:{issue:output.issue,tone:output.tone,level:output.level,target:output.target??null,text:output.text},reason:output.reason||'',drafted:!original,source:'llm'});return;
    }
    const allowed={declare:['issue','tone','level','target','text'],newscast:[],brief:[],message:['content','target'],proposal:['commitments','text'],respond:['dealId','accept'],ready:[],action:['actionId'],next:[]};fields(input,['expectedVersion',...allowed[route]]);
    if(!Number.isInteger(input.expectedVersion)||input.expectedVersion!==s.state.version)throw error('状态已更新，请同步后重试；草稿可保留。',409);
    if(route==='brief'){
     const brief=game.reportBrief(s.state,s.playerRole);
     if(!brief){json(res,200,{brief:null});return;}
     // Measures are public once settled, so the brief may name those; anything not yet disclosed stays banned.
     const disclosed=[...brief.moves.map(m=>m.measure),...brief.backing.map(b=>b.measure)];
     const observation={...taskObservation(s,s.playerRole,'brief'),report:brief,banned:game.NEWS_BANNED_TERMS.filter(name=>!disclosed.includes(name))};
     const controller=new AbortController();s.assists.add(controller);
     let output=null;
     try{const candidate=await provider.decide(observation,value=>validateEnvelope('brief',value,observation),controller.signal);if(validateEnvelope('brief',candidate,observation).valid)output=candidate;}catch{output=null;}finally{s.assists.delete(controller);}
     const fallback=game.renderBriefFallback(s.state,s.playerRole);
     const noDigits=output&&!/[0-9]/.test(output.summary+output.moves+output.watch);
     json(res,200,{brief:noDigits?{...fallback,summary:output.summary,moves:output.moves,watch:output.watch,source:'llm'}:fallback});return;
    }
    if(route==='newscast'){
     const subjects=game.newsSubjects(s.state);
     if(!subjects.length){json(res,200,{items:[]});return;}
     const observation={...taskObservation(s,s.playerRole,'newscast'),announcements:subjects,banned:[...game.NEWS_BANNED_TERMS]};
     const controller=new AbortController();s.assists.add(controller);
     let output=null;
     try{const candidate=await provider.decide(observation,value=>validateEnvelope('newscast',value,observation),controller.signal);if(validateEnvelope('newscast',candidate,observation).valid)output=candidate;}catch{output=null;}finally{s.assists.delete(controller);}
     const byId=Object.fromEntries(game.renderNewsFallback(s.state).map(item=>[item.id,item]));
     if(output)for(const item of output.items)if(byId[item.id]&&!/[0-9]/.test(item.headline+item.body))byId[item.id]={...byId[item.id],headline:item.headline,body:item.body,source:'llm'};
     json(res,200,{items:subjects.map(subject=>byId[subject.id])});return;
    }
    try{
     if(route==='declare')s.state=game.declare(s.state,s.playerRole,input.issue?{issue:input.issue,tone:input.tone,level:input.level,target:input.target??null,text:input.text}:null,'player');
     if(route==='message')s.state=game.sendMessage(s.state,s.playerRole,{content:input.content,target:input.target},'player');
     if(route==='proposal')s.state=game.proposeDeal(s.state,s.playerRole,{commitments:input.commitments,text:input.text});
     if(route==='respond')s.state=game.respondDeal(s.state,s.playerRole,{dealId:input.dealId,accept:input.accept});
     if(route==='ready')s.state=game.ready(s.state,s.playerRole);
     if(route==='action')s.state=game.submitAction(s.state,s.playerRole,input.actionId,'player');
     if(route==='next')s.state=game.advanceRound(s.state);
    }catch(e){throw error(e.message);}
    synchronize(s);json(res,200,snapshot(s));setTimeout(()=>void kick(s),0).unref?.();return;
   }
   if(!['GET','HEAD'].includes(req.method))throw error('请求方法不支持。',405);
   if(pathname.split('/').some(v=>v.startsWith('.')||v.includes('\\'))||pathname.includes('\0'))throw error('文件不存在。',404);
   let file=path.resolve(dist,`.${pathname}`);if(file!==dist&&!file.startsWith(dist+path.sep))throw error('文件不存在。',404);
   let data;try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');data=await readFile(file);}catch{if(path.extname(pathname)||pathname.startsWith('/assets/'))throw error('文件不存在。',404);file=path.join(dist,'index.html');try{data=await readFile(file);}catch{throw error('请先构建前端。',503);}}
   res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':path.extname(file)==='.html'?'no-store':pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'服务暂时不可用，请重试。'});else res.end();}
 });
 restoreAll();
 server.requestTimeout=75000;server.headersTimeout=10000;server.on('close',()=>{for(const s of [...sessions.values()])release(s);});return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const server=createDiplomacyServer({env:{...process.env,LLM_LEDGER_PATH:process.env.LLM_LEDGER_PATH||path.join(ROOT,'.runtime','diplomacy-quota.json')}});server.listen(Number(process.env.PORT||5001),process.env.HOST||'0.0.0.0',()=>console.log('Chip Diplomacy V1.6 listening'));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
