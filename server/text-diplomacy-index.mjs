import http from 'node:http';
import path from 'node:path';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {createSimulation, getObservation, validateAction, applyAction, skipAction, getSnapshot} from './diplomacy/engine.mjs';
import {decideDemo} from './diplomacy/demo.mjs';
import {createProvider} from './diplomacy/provider.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ERRORS = {not_configured:'未配置模型密钥，无法进行真实推演。请联系维护者配置服务端模型。', invalid_configuration:'模型服务配置无效。', daily_limit:'今日模型调用额度已用完。', quota_unavailable:'模型额度记录不可用。', provider_busy:'模型服务繁忙，本次跳过。', upstream_rate_limit:'模型服务限流，本次跳过。', upstream_unavailable:'模型服务不可用，本次跳过。', timeout:'模型响应超时，本次跳过。', invalid_model_action:'模型回复两次未通过格式或权限校验，本次跳过。', response_limit:'模型响应过大，本次跳过。', empty_response:'模型返回空结果，本次跳过。'};
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json; charset=utf-8'};
function json(res, status, value) {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value));}
async function body(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('需要 JSON 请求'),{status:415});
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw Object.assign(new Error('请求过大'),{status:413}); chunks.push(chunk); }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw Object.assign(new Error('请求格式错误'),{status:400});}
}
export function createDiplomacyServer(options = {}) {
  const env = options.env ?? process.env, provider = options.provider ?? createProvider({env, fetchImpl: options.fetchImpl});
  const sessions = new Map(), ips = new Map();
  const dist = path.resolve(options.distDir || path.join(ROOT,'dist'));
  const ttl = 60 * 60 * 1000;
  function snapshot(session) {return {...getSnapshot(session.state), id:session.id, ...(session.paused && session.state.status !== 'completed' ? {status:'paused'} : {})};}
  function cleanup() {for (const [id,s] of sessions) if (Date.now() - s.touched > ttl && !s.busy) {s.controller?.abort(); sessions.delete(id);} }
  const server = http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/api/health' && req.method === 'GET') {json(res,200,{status:'ok',llm:provider.status()}); return;}
      if (pathname.startsWith('/api/')) {
        cleanup();
        if (req.method !== 'GET') {
          const expected = env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
          // Vite proxy retains Origin; allow configured development frontend on loopback only.
          const localDev = req.socket.remoteAddress?.match(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/) && ['http://127.0.0.1:3000','http://localhost:3000','http://[::1]:3000'].includes(req.headers.origin);
          if (req.headers.origin !== expected && !localDev) {json(res,403,{error:'请求来源不匹配'}); return;}
          if (req.headers['sec-fetch-site'] && !['same-origin','same-site','none'].includes(req.headers['sec-fetch-site'])) {json(res,403,{error:'请求来源不匹配'}); return;}
          const ip = req.socket.remoteAddress || ''; const now = Date.now();
          for (const [key,value] of ips) if (now > value.until) ips.delete(key);
          const rate = ips.get(ip) || {count:0,until:now+60000}; rate.count++; ips.set(ip,rate);
          if (rate.count > 120 || ips.size > 4096) {json(res,429,{error:'请求过于频繁，请稍后重试'}); return;}
        }
        if (pathname === '/api/diplomacy/sessions' && req.method === 'POST') {
          const input = await body(req);
          if (!input || Object.keys(input).some(k => !['mode','rounds','player'].includes(k)) || !['demo','live'].includes(input.mode) || !Number.isInteger(input.rounds) || input.rounds < 1 || input.rounds > 5 || (input.player !== null && !['USA','China','Netherlands','ASML'].includes(input.player))) {json(res,400,{error:'场景配置无效'}); return;}
          if (input.mode === 'demo' && env.DIPLOMACY_ALLOW_DEMO !== 'true') {json(res,403,{error:'线上仅支持 DeepSeek 真实推演，演示模式已禁用。'}); return;}
          if (input.mode === 'live' && !provider.status().enabled) {json(res,503,{error:ERRORS.not_configured}); return;}
          if (sessions.size >= 50) {json(res,429,{error:'会话已满，请稍后重试'}); return;}
          const id = randomBytes(16).toString('hex'), token = randomBytes(32).toString('hex');
          const session = {id,token,state:createSimulation(input),paused:false,busy:false,epoch:0,touched:Date.now(),controller:null};
          sessions.set(id,session); json(res,201,{id,token,snapshot:snapshot(session)}); return;
        }
        const match = pathname.match(/^\/api\/diplomacy\/sessions\/([a-f0-9]{32})(?:\/(step|control))?$/);
        if (!match) {json(res,404,{error:'接口不存在'}); return;}
        const session = sessions.get(match[1]);
        const token = (req.headers.authorization || '').replace(/^Bearer /,'');
        if (!session || token.length !== session.token.length || !timingSafeEqual(Buffer.from(token),Buffer.from(session.token))) {json(res,404,{error:'会话不存在或已过期'}); return;}
        session.touched = Date.now();
        if (!match[2] && req.method === 'GET') {json(res,200,snapshot(session)); return;}
        if (!match[2] && req.method === 'DELETE') {session.epoch++; session.controller?.abort(); sessions.delete(session.id); json(res,200,{deleted:true}); return;}
        if (match[2] === 'control' && req.method === 'POST') {
          const input = await body(req);
          if (!input || !['pause','resume'].includes(input.command) || Object.keys(input).length !== 1) {json(res,400,{error:'控制指令无效'}); return;}
          session.paused = input.command === 'pause'; session.epoch++; session.controller?.abort();
          json(res,200,snapshot(session)); return;
        }
        if (match[2] === 'step' && req.method === 'POST') {
          const input = await body(req);
          if (!input || Object.keys(input).some(k => !['expectedVersion','action'].includes(k))) {json(res,400,{error:'行动请求无效'}); return;}
          if (input.expectedVersion !== session.state.version || session.busy) {json(res,409,{error:'会话正在处理或版本已更新，请刷新记录'}); return;}
          if (session.paused || session.state.status === 'completed') {json(res,200,snapshot(session)); return;}
          const playerTurn = session.state.actor === session.state.player;
          if (playerTurn && !input.action) {json(res,200,snapshot(session)); return;}
          if (input.action && !playerTurn) {json(res,422,{error:'当前不是玩家的行动步骤'}); return;}
          if (playerTurn) {
            const validation = validateAction(session.state, input.action);
            if (!validation.valid) {json(res,422,{error:validation.error || '行动未通过权限校验'}); return;}
            session.state = applyAction(session.state,input.action,'player'); json(res,200,snapshot(session)); return;
          }
          session.busy = true; const epoch = session.epoch; session.controller = new AbortController();
          try {
            const observation = getObservation(session.state,session.state.actor);
            const action = session.state.mode === 'demo' ? decideDemo(observation) : await provider.decide(observation, a => validateAction(session.state,a),session.controller.signal);
            if (epoch === session.epoch && sessions.has(session.id)) session.state = applyAction(session.state,action,session.state.mode === 'demo' ? 'demo' : 'llm');
          } catch (error) {
            if (epoch === session.epoch && sessions.has(session.id)) session.state = skipAction(session.state, ERRORS[error.message] || '本次行动未通过校验，已跳过；未生成成功决策。');
          } finally {session.busy = false; session.controller = null;}
          json(res,200,snapshot(session)); return;
        }
        json(res,405,{error:'请求方法不支持'}); return;
      }
      if (!['GET','HEAD'].includes(req.method)) {json(res,405,{error:'请求方法不支持'}); return;}
      if (pathname.split('/').some(s => s.startsWith('.') || s.includes('\\')) || pathname.includes('\0')) {json(res,404,{error:'文件不存在'}); return;}
      let file = path.resolve(dist, `.${pathname}`);
      if (file !== dist && !file.startsWith(`${dist}${path.sep}`)) {json(res,404,{error:'文件不存在'}); return;}
      let data;
      try {if ((await stat(file)).isDirectory()) file = path.join(file,'index.html'); data = await readFile(file);}
      catch {if (path.extname(pathname) || pathname.startsWith('/assets/')) {json(res,404,{error:'文件不存在'}); return;} file = path.join(dist,'index.html'); try {data = await readFile(file);} catch {json(res,503,{error:'请先构建前端'}); return;}}
      res.writeHead(200,{'Content-Type':MIME[path.extname(file)] || 'application/octet-stream','Content-Length':data.length,'Cache-Control':pathname.startsWith('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache'}); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {if (!res.headersSent) json(res,error.status || 500,{error:error.status ? error.message : '请求处理失败，请重试'}); else res.end();}
  });
  server.requestTimeout = 75000; server.headersTimeout = 10000;
  server.on('close', () => {for (const session of sessions.values()) session.controller?.abort(); sessions.clear();});
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const env = {...process.env, LLM_LEDGER_PATH:process.env.LLM_LEDGER_PATH || path.join(ROOT,'.runtime','diplomacy-quota.json')};
  const server = createDiplomacyServer({env}); const port = Number(process.env.PORT || 5001);
  server.listen(port,process.env.HOST || '127.0.0.1',() => console.log(`Chip Diplomacy listening on port ${port}`));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,() => server.close(() => process.exit(0)));
}
