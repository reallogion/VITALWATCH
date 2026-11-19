// ─────────────────────────────────────────────────────────────
//  Decides WHEN to ask the AI, then stores the result.
//  Free tiers have daily token limits, so instead of calling
//  every 30 s no matter what, it calls when something changes:
//    - first reading of a session
//    - a new warning/critical alert
//    - a big change (HR ±15, SpO2 ±3, temp ±0.5, activity)
//    - otherwise every LLM_MAX_INTERVAL_SEC as a routine check
//  Never more often than LLM_MIN_INTERVAL_SEC.
//  If every provider fails, the offline rule engine answers.
// ─────────────────────────────────────────────────────────────
const crypto = require("crypto");
const { CONFIG } = require("../../config/constants");
const { state, changed, bus } = require("../../core/state");
const alerts = require("../../core/alertEngine");
const providers = require("./providers");
const prompt = require("./prompt");
const rules = require("./ruleEngine");
const persistence = require("../persistence");

let lastRunAt = 0;
let lastInput = null;
let alertSinceLast = false;

bus.on("alert", (a) => {
  if (a.severity !== "info" && a.scope === "reading") alertSinceLast = true;
});

function bigChange(r) {
  if (!lastInput) return true;
  return (
    Math.abs((r.heartRate ?? 0) - (lastInput.heartRate ?? 0)) >= 15 ||
    Math.abs((r.spo2 ?? 0) - (lastInput.spo2 ?? 0)) >= 3 ||
    Math.abs((r.bodyTemp ?? 0) - (lastInput.bodyTemp ?? 0)) >= 0.5 ||
    r.activity !== lastInput.activity
  );
}

function dayRollover() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.llm.day !== today) Object.assign(state.llm, { day: today, callsToday: 0, tokensToday: 0 });
}

async function run(reason = "manual") {
  const r = state.latest;
  const d = state.derived;
  if (!r || !d || state.llm.busy) return null;
  state.llm.busy = true;
  changed();
  lastRunAt = Date.now();
  lastInput = { heartRate: r.heartRate, spo2: r.spo2, bodyTemp: r.bodyTemp, activity: r.activity };
  alertSinceLast = false;
  dayRollover();

  const ctx = {
    reading: r,
    derived: d,
    soldier: state.soldier,
    activeAlerts: state.alerts.filter((a) => a.active && a.key !== "ai_risk"),
    previous: state.analysis,
  };

  let result, meta;
  try {
    if (!state.settings.llmEnabled) throw new Error("AI disabled in settings");
    const out = await providers.complete(prompt.build(ctx));
    result = prompt.parse(out.text);
    meta = { source: "ai", provider: out.providerLabel, model: out.model, ms: out.ms, tokens: out.tokens };
    state.llm.callsToday++;
    state.llm.tokensToday += out.tokens;
    state.llm.lastError = null;
  } catch (err) {
    result = rules.assess(ctx);
    meta = { source: "offline", provider: "Offline rule engine", model: null, ms: 0, tokens: 0 };
    state.llm.lastError = err.message;
  } finally {
    state.llm.busy = false;
    state.llm.providers = providers.refresh();
  }

  const analysis = {
    id: crypto.randomUUID(),
    soldierId: r.soldierId,
    createdAt: Date.now(),
    readingAt: r.timestamp,
    reason,
    ...result,
    ...meta,
    input: { heartRate: r.heartRate, spo2: r.spo2, bodyTemp: r.bodyTemp, altitude: d.altitude, psi: d.psi, activity: r.activity, simulated: r.simulated },
  };
  state.analysis = analysis;
  state.analyses.unshift(analysis);
  if (state.analyses.length > 20) state.analyses.length = 20;
  persistence.saveAnalysis(analysis);

  // AI-raised alert for HIGH / CRITICAL (cleared when risk drops)
  if (meta.source === "ai" && (result.risk === "HIGH" || result.risk === "CRITICAL")) {
    alerts.raise(
      { key: "ai_risk", severity: result.risk === "CRITICAL" ? "critical" : "warning", category: "ai", title: `AI: ${result.headline}`, message: result.assessment, value: null },
      "ai"
    );
  } else alerts.clear("ai_risk");

  console.log(`[llm] ${analysis.provider} -> ${analysis.risk}: ${analysis.headline}`);
  changed();
  return analysis;
}

// Scheduler
setInterval(() => {
  if (state.band.status !== "live" || state.llm.busy) return;
  const since = Date.now() - lastRunAt;
  if (since < CONFIG.llm.minIntervalMs) return;
  const r = state.latest;
  if (!state.analysis) return run("first reading");
  if (alertSinceLast) return run("new alert");
  if (r && bigChange(r)) return run("vitals changed");
  if (since >= CONFIG.llm.maxIntervalMs) return run("routine check");
}, 5000);

bus.on("state", () => {
  if (state.band.status !== "live") lastInput = null;
});

// Quick check that a provider answers (System page "Test AI" button)
async function test() {
  providers.resetCooldowns();
  const t = Date.now();
  try {
    const out = await providers.complete(
      [
        { role: "system", content: 'Reply with JSON only: {"ok":true,"model":"<your model name>"}' },
        { role: "user", content: "ping" },
      ],
      300
    );
    return { ok: true, provider: out.providerLabel, model: out.model, ms: Date.now() - t, reply: out.text.slice(0, 200), providers: providers.refresh() };
  } catch (err) {
    return { ok: false, error: err.message, providers: providers.refresh() };
  } finally {
    state.llm.providers = providers.refresh();
    changed();
  }
}

state.llm.providers = providers.refresh();

module.exports = { run, test };
