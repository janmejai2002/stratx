'use strict';

const { resolveKey, resolveModel, readConfig } = require('./config');

/**
 * One call surface over two providers. The key's shape decides which, so a
 * user never has to declare a provider - they paste a key and it works.
 */

// Indicative USD per million tokens, used only for the running spend estimate
// shown to the user. Deliberately approximate; the ledger records real token
// counts so a wrong price here never corrupts the underlying data.
const PRICE_HINT = {
  'anthropic/claude-haiku-4.5': { in: 1.0, out: 5.0 },
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 },
  _default: { in: 1.0, out: 5.0 },
};

function estimateCost(model, usage) {
  const p = PRICE_HINT[model] || PRICE_HINT._default;
  const i = (usage.input_tokens || 0) / 1e6 * p.in;
  const o = (usage.output_tokens || 0) / 1e6 * p.out;
  return Number((i + o).toFixed(6));
}

async function complete(cwd, { system, prompt, maxTokens = 1600, temperature = 0, model }) {
  const auth = resolveKey(cwd);
  if (!auth) {
    const err = new Error(
      'No API key found. Set STRATX_API_KEY (or OPENROUTER_API_KEY / ANTHROPIC_API_KEY), ' +
      'add it to a .env file next to your project, or run: stratx config set-key'
    );
    err.code = 'ENOKEY';
    throw err;
  }

  const useModel = model || resolveModel(cwd, auth.provider);
  const started = Date.now();

  const res = auth.provider === 'anthropic'
    ? await callAnthropic(auth.key, useModel, { system, prompt, maxTokens, temperature })
    : await callOpenRouter(auth.key, useModel, { system, prompt, maxTokens, temperature });

  return {
    ...res,
    model: useModel,
    provider: auth.provider,
    ms: Date.now() - started,
    cost_usd: estimateCost(useModel, res.usage),
  };
}

async function callAnthropic(key, model, { system, prompt, maxTokens, temperature }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw providerError('anthropic', r.status, body);
  return {
    text: (body.content || []).filter(c => c.type === 'text').map(c => c.text).join(''),
    usage: {
      input_tokens: body.usage ? body.usage.input_tokens : 0,
      output_tokens: body.usage ? body.usage.output_tokens : 0,
    },
  };
}

async function callOpenRouter(key, model, { system, prompt, maxTokens, temperature }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://github.com/janmejai2002/stratx',
      'X-Title': 'stratx',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw providerError('openrouter', r.status, body);

  const choice = (body.choices || [])[0] || {};
  return {
    text: (choice.message && choice.message.content) || '',
    usage: {
      input_tokens: body.usage ? body.usage.prompt_tokens || 0 : 0,
      output_tokens: body.usage ? body.usage.completion_tokens || 0 : 0,
    },
  };
}

function providerError(provider, status, body) {
  const detail =
    (body && body.error && (body.error.message || body.error)) ||
    (body && body.message) ||
    JSON.stringify(body).slice(0, 300);
  let hint = '';
  if (status === 401) hint = ' - the key was rejected. Check it with: stratx doctor';
  if (status === 402) hint = ' - out of credits on this key. Add credits or switch keys.';
  if (status === 404) hint = ' - model id not found. Set a valid one with: stratx config set model <id>';
  if (status === 429) hint = ' - rate limited. Wait a moment and retry.';
  const err = new Error(`${provider} returned ${status}${hint}\n${detail}`);
  err.code = 'EPROVIDER';
  err.status = status;
  return err;
}

/** Extract the first JSON value in a model response, tolerating fenced output. */
function parseJson(text) {
  if (!text) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fence ? fence[1] : text;
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const open = candidate[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(candidate.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

module.exports = { complete, parseJson, estimateCost, readConfig };
