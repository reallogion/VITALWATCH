// ─────────────────────────────────────────────────────────────
//  Free LLM providers. All three speak the OpenAI chat format,
//  so one fetch() call works for each. No SDKs needed.
//  If one fails (expired key, model retired, rate limit), the
//  next one in LLM_PROVIDERS is tried automatically.
// ─────────────────────────────────────────────────────────────
const { CONFIG } = require("../../config/constants");

const DEFS = {
  groq: {
    label: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: () => process.env.GROQ_API_KEY,
    model: () => process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    extra: (model) => (model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
  },
  gemini: {
    label: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    key: () => process.env.GEMINI_API_KEY,
    model: () => process.env.GEMINI_MODEL || "gemini-2.5-flash",
    extra: () => ({}),
  },
  openrouter: {
    label: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: () => process.env.OPENROUTER_API_KEY,
    model: () => process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free",
    extra: () => ({}),
    headers: { "HTTP-Referer": "http://localhost", "X-Title": "VitalWatch" },
  },
};

// Live status per provider, shown on the System page
const status = {};
for (const id of Object.keys(DEFS)) {
  status[id] = { id, label: DEFS[id].label, configured: false, model: null, ok: null, lastError: null, lastOkAt: null, cooldownUntil: 0, calls: 0 };
}

function refresh() {
  for (const [id, d] of Object.entries(DEFS)) {
    status[id].configured = Boolean(d.key());
    status[id].model = d.model();
  }
  return CONFIG.llm.providers.filter((id) => DEFS[id]).map((id) => status[id]);
}

function explain(code, body) {
  const b = String(body).slice(0, 200);
  if (code === 401 || code === 403) return `Key rejected (${code}). Create a new API key.`;
  if (code === 404 || /model.*(not found|decommissioned|does not exist)/i.test(b)) return `Model not available (${code}). Change the model name in .env.`;
  if (code === 429) return "Rate limit reached. Will retry later.";
  return `HTTP ${code}: ${b}`;
}

async function callOne(id, messages, maxTokens) {
  const d = DEFS[id];
  const model = d.model();
  const body = { model, messages, temperature: 0.2, max_tokens: maxTokens, response_format: { type: "json_object" }, ...d.extra(model) };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.llm.timeoutMs);
  const t = Date.now();
  try {
    let res = await fetch(d.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${d.key()}`, ...(d.headers || {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    // Some models reject json mode / extra params: retry once plain
    if (res.status === 400) {
      const txt = await res.text();
      if (/response_format|json|reasoning/i.test(txt)) {
        const { response_format, reasoning_effort, ...plain } = body;
        res = await fetch(d.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${d.key()}`, ...(d.headers || {}) },
          body: JSON.stringify(plain),
          signal: ctrl.signal,
        });
      } else {
        throw Object.assign(new Error(explain(400, txt)), { code: 400 });
      }
    }
    if (!res.ok) {
      const txt = await res.text();
      throw Object.assign(new Error(explain(res.status, txt)), { code: res.status });
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || "";
    if (!text.trim()) throw new Error("Empty reply from model");
    return { text, tokens: json.usage?.total_tokens ?? 0, model, ms: Date.now() - t };
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`Timed out after ${CONFIG.llm.timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Try each configured provider in order. Returns the first success.
async function complete(messages, maxTokens = 900) {
  const list = refresh();
  const errors = [];
  for (const st of list) {
    if (!st.configured) continue;
    if (Date.now() < st.cooldownUntil) {
      errors.push(`${st.label}: cooling down`);
      continue;
    }
    try {
      const out = await callOne(st.id, messages, maxTokens);
      Object.assign(st, { ok: true, lastError: null, lastOkAt: Date.now(), calls: st.calls + 1 });
      return { ...out, provider: st.id, providerLabel: st.label };
    } catch (err) {
      const cool = err.code === 429 ? 60000 : err.code === 401 || err.code === 403 || err.code === 404 ? 10 * 60000 : 15000;
      Object.assign(st, { ok: false, lastError: err.message, cooldownUntil: Date.now() + cool });
      errors.push(`${st.label}: ${err.message}`);
      console.error(`[llm] ${st.label} failed: ${err.message}`);
    }
  }
  if (!list.some((s) => s.configured)) errors.push("No API key set in .env (GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY)");
  throw new Error(errors.join(" | "));
}

function resetCooldowns() {
  for (const s of Object.values(status)) s.cooldownUntil = 0;
}

module.exports = { complete, refresh, resetCooldowns };
