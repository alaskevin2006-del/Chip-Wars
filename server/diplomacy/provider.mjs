import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import {buildDiplomacyMessages} from './prompts.mjs';

export function createProvider({env = process.env, fetchImpl = globalThis.fetch, buildMessages = buildDiplomacyMessages} = {}) {
  const key = env.DEEPSEEK_API_KEY || env.LLM_API_KEY || '';
  const model = env.DEEPSEEK_MODEL || env.LLM_MODEL_NAME || 'deepseek-flash';
  const base = (env.DEEPSEEK_BASE_URL || env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const timeout = Math.max(50, Math.min(60000, Number(env.LLM_TIMEOUT_MS) || 45000));
  const maxTokens = Math.max(1000, Math.min(4000, Number(env.LLM_MAX_TOKENS) || 2200));
  const limit = env.LLM_DAILY_LIMIT?.trim().toLowerCase() === 'unlimited' ? Infinity : Math.max(0, Number(env.LLM_DAILY_LIMIT ?? 60));
  const ledgerPath = env.LLM_LEDGER_PATH || '';
  let calls = 0, day = new Date().toISOString().slice(0, 10), active = 0, queue = Promise.resolve();
  let validBase = false;
  try { const u = new URL(base); validBase = u.protocol === 'https:' && !u.username && !u.password; } catch {}
  const ready = (async () => {
    if (!ledgerPath) return;
    try { const data = JSON.parse(await readFile(ledgerPath, 'utf8')); if (!data || Object.keys(data).length !== 2 || typeof data.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.day) || !Number.isInteger(data.calls) || data.calls < 0 || data.day > day) calls = limit; else if (data.day === day) calls = data.calls; }
    catch (e) { if (e.code !== 'ENOENT') calls = limit; }
  })();
  function reserve() {
    const job = queue.then(async () => {
      await ready;
      const today = new Date().toISOString().slice(0, 10);
      if (today < day) throw new Error('quota_unavailable');
      if (today > day) { day = today; calls = 0; }
      if (calls >= limit) throw new Error('daily_limit');
      calls++;
      if (ledgerPath) {
        await mkdir(path.dirname(ledgerPath), {recursive: true});
        const temp = `${ledgerPath}.${process.pid}.tmp`;
        try { await writeFile(temp, JSON.stringify({day, calls}), {mode: 0o600}); await rename(temp, ledgerPath); }
        catch { calls = limit; throw new Error('quota_unavailable'); }
      }
    });
    queue = job.catch(() => {}); return job;
  }
  return {
    status: () => ({enabled: Boolean(key) && validBase && limit > 0, model}),
    async decide(observation, validate, externalSignal) {
      if (!key) throw new Error('not_configured');
      if (!validBase) throw new Error('invalid_configuration');
      if (active >= 2) throw new Error('provider_busy');
      active++;
      const controller = new AbortController();
      const cancel = () => controller.abort();
      externalSignal?.addEventListener('abort', cancel, {once: true});
      if (externalSignal?.aborted) cancel();
      const timer = setTimeout(cancel, timeout);
      const interrupted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error(externalSignal?.aborted ? 'cancelled' : 'timeout')), {once: true}));
      try {
        const work = async () => {
          let correction = 'Return well-formed json.';
          for (let attempt = 0; attempt < 2; attempt++) {
            if (controller.signal.aborted) throw new Error('cancelled');
            await reserve();
            if (controller.signal.aborted) throw new Error('cancelled');
            const response = await fetchImpl(`${base}/chat/completions`, {
              method: 'POST', redirect: 'error', signal: controller.signal,
              headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`},
              body: JSON.stringify({model, stream: false, max_tokens: maxTokens, thinking: {type: 'disabled'}, response_format: {type: 'json_object'},
                messages: buildMessages(observation, attempt ? correction : undefined)})
            });
            if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error(response.status === 429 ? 'upstream_rate_limit' : 'upstream_unavailable'); }
            const reader = response.body?.getReader();
            if (!reader) throw new Error('empty_response');
            let bytes = 0; const chunks = [];
            try { while (true) { const {done, value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 65536) throw new Error('response_limit'); chunks.push(Buffer.from(value)); } }
            finally { await reader.cancel().catch(() => {}); }
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              const action = JSON.parse(data?.choices?.[0]?.message?.content);
              const result = validate(action);
              if (result.valid) return action;
              correction = result.error || 'Invalid action fields, authority or visibility.';
            } catch { /* Retry only malformed output, without recording supplier content. */ }
          }
          throw new Error('invalid_model_action');
        };
        return await Promise.race([work(), interrupted]);
      } catch (error) {
        if (controller.signal.aborted) throw new Error(externalSignal?.aborted ? 'cancelled' : 'timeout');
        throw error;
      } finally {
        clearTimeout(timer); controller.abort(); externalSignal?.removeEventListener('abort', cancel); active--;
      }
    }
  };
}
