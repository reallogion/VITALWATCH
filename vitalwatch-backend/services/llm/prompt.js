// ─────────────────────────────────────────────────────────────
//  Prompt for the AI field medic. The model gets trends,
//  baselines and context (not one isolated reading) and must
//  answer in strict JSON so the dashboard can show it cleanly.
// ─────────────────────────────────────────────────────────────
const { spo2Limits } = require("../../core/alertEngine");

const SYSTEM = `You are VITALWATCH-AI, decision support for an Indian Army medic who monitors a soldier remotely through a bicep-worn sensor band (LoRa link).

How to judge:
- Use trends, baseline and context, never a single reading on its own.
- Exertion: HR 140-170 bpm is expected while running; the same HR while still is a concern.
- Altitude: SpO2 of 88-92% is normal at 3000-4500 m. Judge SpO2 against the altitude limits given.
- Body temperature comes from an arm skin probe and reads about 0.5-1 °C below core.
- Strain index (PSI) 0-10: below 4 low, 4-6 moderate, 7-8 high, 9-10 very high.
- Fields marked ESTIMATED come from a backup estimator because that sensor failed. Never base a medical conclusion on them; lower your confidence if they matter.
- Never invent readings. If data is not enough to judge, say so.

Risk scale: LOW (fit to continue), MODERATE (needs attention soon), HIGH (act now), CRITICAL (life threat, immediate response or CASEVAC).

Actions must be short, concrete field actions for a medic or section commander (for example: halt and rest 10 min, hydrate 500 ml, move to shade, buddy check now, descend 300-500 m, give oxygen, check airway and bleeding, prepare CASEVAC).

Reply with ONLY one JSON object, no markdown:
{"risk":"LOW|MODERATE|HIGH|CRITICAL","headline":"max 6 words","assessment":"max 45 words","concerns":["max 12 words each, 0-3 items"],"actions":["imperative, max 12 words each, 1-3 items"],"watch":"what to monitor next, max 15 words","confidence":0.0,"next_check_min":5}`;

const f = (v, d = 0) => (v === null || v === undefined ? "n/a" : Number(v).toFixed(d));
const trend = (t, unit) => (t ? `${t.change >= 0 ? "+" : ""}${t.change}${unit} (range ${t.min}-${t.max})` : "not enough data");
const ACT = ["still", "walking", "running"];

function build({ reading: r, derived: d, soldier, activeAlerts, previous }) {
  const est = (field) => (r.simulated.includes(field) ? " [ESTIMATED]" : "");
  const lim = spo2Limits(d.altitude);
  const sensorsBad = Object.entries(r.sensors).filter(([, s]) => s !== "ok").map(([k, s]) => `${k}:${s}`);
  const lines = [
    `SOLDIER: ${soldier.rank} ${soldier.name}, age ${soldier.age}, unit ${soldier.unit}, resting HR ${soldier.restingHR}.`,
    "",
    "CURRENT READING:",
    `- Heart rate: ${f(r.heartRate)} bpm${est("heartRate")} (baseline ${f(d.hrBaseline)}, ${f(d.hrMaxPct)}% of max)`,
    `- SpO2: ${f(r.spo2)}%${est("spo2")} (limits at this altitude: warn <${lim.warn}, critical <${lim.crit})`,
    `- Body temp (arm probe): ${f(r.bodyTemp, 1)} °C${est("bodyTemp")} (session start ${f(d.tempBaseline, 1)})`,
    `- Strain index PSI: ${f(d.psi, 1)}/10${d.psiEstimated ? " [ESTIMATED]" : ""}`,
    `- Activity: ${ACT[r.activity] ?? "unknown"}${est("activity")}; still for ${f(d.stationaryMin, 1)} min; fall: ${d.secSinceFall !== null && d.secSinceFall < 120 ? `${d.secSinceFall}s ago` : "none"}`,
    "",
    "TRENDS (last 2 min | last 10 min):",
    `- HR: ${trend(d.trends.heartRate.m2, "")} | ${trend(d.trends.heartRate.m10, "")}`,
    `- SpO2: ${trend(d.trends.spo2.m2, "")} | ${trend(d.trends.spo2.m10, "")}`,
    `- Body temp: ${trend(d.trends.bodyTemp.m2, "")} | ${trend(d.trends.bodyTemp.m10, "")}`,
    "",
    "ENVIRONMENT (BMP280, no humidity sensor):",
    `- Ambient: ${f(r.ambientTemp, 1)} °C${est("ambientTemp")}; pressure ${f(r.pressure, 1)} hPa; altitude ${f(d.altitude)} m${d.altitudeEstimated ? " [ESTIMATED]" : ""}; altitude change 1 min ${d.altitudeChange1m} m`,
    `- Speed ${f(d.speedKmh, 1)} km/h; distance this session ${f(d.distanceKm, 2)} km`,
    "",
    `DEVICE: battery ${f(r.battery)}%, LoRa RSSI ${f(r.rssi)} dBm. Sensor problems: ${sensorsBad.length ? sensorsBad.join(", ") : "none"}.`,
    `ACTIVE ALERTS: ${activeAlerts.length ? activeAlerts.map((a) => `${a.severity.toUpperCase()} ${a.title} (${a.message})`).join("; ") : "none"}`,
    previous
      ? `PREVIOUS ASSESSMENT ${Math.round((Date.now() - previous.createdAt) / 60000)} min ago: ${previous.risk}, "${previous.headline}".`
      : "PREVIOUS ASSESSMENT: none (first of this session).",
  ];
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: lines.join("\n") },
  ];
}

// Pull the JSON object out of the reply and sanity-check it
function parse(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Reply had no JSON");
  const o = JSON.parse(m[0]);
  const risk = String(o.risk || "").toUpperCase();
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 3) : []);
  return {
    risk: ["LOW", "MODERATE", "HIGH", "CRITICAL"].includes(risk) ? risk : "MODERATE",
    headline: String(o.headline || "Assessment").slice(0, 60),
    assessment: String(o.assessment || "").slice(0, 400),
    concerns: arr(o.concerns),
    actions: arr(o.actions),
    watch: String(o.watch || "").slice(0, 140),
    confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0.6)),
    nextCheckMin: Math.max(1, Math.min(60, parseInt(o.next_check_min, 10) || 5)),
  };
}

module.exports = { build, parse, SYSTEM };
