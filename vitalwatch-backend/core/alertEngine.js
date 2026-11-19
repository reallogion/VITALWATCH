// ─────────────────────────────────────────────────────────────
//  Alert engine.
//  Each condition has a stable key (e.g. "hr_high"). While the
//  condition stays true the SAME alert is updated instead of a new
//  one being created every 5 s (the old code spammed Firebase).
//  When it is false for 2 packets in a row it is auto-cleared.
//  Severity can escalate (warning -> critical) in place.
// ─────────────────────────────────────────────────────────────
const crypto = require("crypto");
const { THRESHOLDS: T, SENSORS } = require("../config/constants");
const { state, changed, bus } = require("./state");

const SEV_RANK = { info: 0, warning: 1, critical: 2 };

function spo2Limits(alt) {
  return T.spo2ByAltitude.find((b) => (alt ?? 0) < b.maxAlt);
}

// ── Rules on one processed reading ───────────────────────────
function evaluate(r, d, fillOn) {
  const out = [];
  const real = (f) => r[f] !== null && r[f] !== undefined && !r.simulated.includes(f);
  const add = (key, severity, category, title, message, value) =>
    out.push({ key, severity, category, title, message, value });

  // Heart rate
  if (real("heartRate")) {
    const hr = r.heartRate;
    const warnHigh = r.activity === 2 ? T.heartRate.warnHighRunning : T.heartRate.warnHigh;
    if (hr > T.heartRate.critHigh) add("hr_high", "critical", "vital", "Severe tachycardia", `Heart rate ${hr} bpm`, hr);
    else if (hr > warnHigh) add("hr_high", "warning", "vital", "High heart rate", `Heart rate ${hr} bpm${r.activity === 0 ? " while still" : ""}`, hr);
    if (hr < T.heartRate.critLow) add("hr_low", "critical", "vital", "Severe bradycardia", `Heart rate ${hr} bpm`, hr);
    else if (hr < T.heartRate.warnLow) add("hr_low", "warning", "vital", "Low heart rate", `Heart rate ${hr} bpm`, hr);
  }

  // SpO2, altitude-adjusted
  if (real("spo2")) {
    const lim = spo2Limits(d.altitude);
    const altTxt = d.altitude > 1500 ? ` at ${d.altitude} m` : "";
    if (r.spo2 < lim.crit) add("spo2_low", "critical", "vital", "Hypoxia", `SpO2 ${r.spo2}%${altTxt} (limit ${lim.crit}%)`, r.spo2);
    else if (r.spo2 < lim.warn) add("spo2_low", "warning", "vital", "Low oxygen", `SpO2 ${r.spo2}%${altTxt} (limit ${lim.warn}%)`, r.spo2);
  }

  // Body temperature
  if (real("bodyTemp")) {
    const t = r.bodyTemp;
    if (t >= T.bodyTemp.critHigh) add("temp_high", "critical", "vital", "Heat stroke risk", `Body temp ${t} °C`, t);
    else if (t >= T.bodyTemp.warnHigh) add("temp_high", "warning", "vital", "Heat exhaustion risk", `Body temp ${t} °C`, t);
    if (t < T.bodyTemp.critLow) add("temp_low", "critical", "vital", "Hypothermia", `Body temp ${t} °C`, t);
    else if (t < T.bodyTemp.warnLow) add("temp_low", "warning", "vital", "Cooling down", `Body temp ${t} °C`, t);
  }

  // Fall and man-down (MPU-6050)
  if (!r.simulated.includes("activity")) {
    if (d.secSinceFall !== null && d.secSinceFall <= 60) {
      if (d.secSinceFall >= T.manDownAfterFallSec && r.activity === 0)
        add("man_down", "critical", "safety", "MAN DOWN", `Fall detected ${d.secSinceFall}s ago, no movement since`, d.secSinceFall);
      else add("fall", "critical", "safety", "Fall detected", "Impact detected by motion sensor. Check soldier.", 1);
    }
    const abnormal =
      (real("heartRate") && (r.heartRate < 50 || r.heartRate > 130)) ||
      (real("spo2") && r.spo2 < spo2Limits(d.altitude).warn);
    if (d.stationaryMin >= T.stationaryAbnormalMin && abnormal)
      add("man_down", "critical", "safety", "MAN DOWN", `No movement for ${d.stationaryMin} min with abnormal vitals`, d.stationaryMin);
    else if (d.stationaryMin >= T.stationaryInfoMin)
      add("stationary", "info", "safety", "Stationary", `No movement for ${Math.floor(d.stationaryMin)} min, vitals normal`, d.stationaryMin);
  }

  // Strain index
  if (d.psi !== null && !d.psiEstimated) {
    if (d.psi >= T.psi.crit) add("psi", "critical", "vital", "Extreme physiological strain", `Strain index ${d.psi}/10`, d.psi);
    else if (d.psi >= T.psi.warn) add("psi", "warning", "vital", "High physiological strain", `Strain index ${d.psi}/10`, d.psi);
  }

  // Trends at rest
  const hrT = d.trends.heartRate.m2;
  if (hrT && r.activity === 0 && hrT.change >= T.hrRiseAtRest)
    add("hr_rising", "warning", "vital", "Heart rate rising at rest", `+${hrT.change} bpm in 2 min without movement`, hrT.change);
  const spT = d.trends.spo2.m2;
  if (spT && spT.change <= -T.spo2Drop)
    add("spo2_falling", "warning", "vital", "Oxygen falling", `SpO2 down ${Math.abs(spT.change)} points in 2 min`, spT.change);

  // Environment (BMP280)
  if (real("ambientTemp")) {
    if (r.ambientTemp >= T.ambientHot && r.activity >= 1)
      add("env_hot", "info", "environment", "Heat stress conditions", `Ambient ${r.ambientTemp} °C with activity`, r.ambientTemp);
    if (r.ambientTemp <= T.ambientCold)
      add("env_cold", "info", "environment", "Cold exposure", `Ambient ${r.ambientTemp} °C`, r.ambientTemp);
  }
  if (!d.altitudeEstimated && Math.abs(d.altitudeChange1m) >= T.rapidAltitudeM)
    add("alt_rapid", "warning", "environment", "Rapid altitude change", `${d.altitudeChange1m > 0 ? "+" : ""}${d.altitudeChange1m} m in 1 min`, d.altitudeChange1m);

  // Device
  if (r.battery !== null && r.battery !== undefined) {
    if (r.battery <= T.battery.crit) add("battery", "critical", "device", "Band battery critical", `${r.battery}% left`, r.battery);
    else if (r.battery <= T.battery.warn) add("battery", "warning", "device", "Band battery low", `${r.battery}% left`, r.battery);
  }
  if (r.rssi !== null && r.rssi !== undefined && r.rssi < T.rssiWeak)
    add("rssi", "warning", "link", "Weak LoRa signal", `RSSI ${r.rssi} dBm`, r.rssi);

  for (const s of SENSORS) {
    const st = r.sensors[s.id];
    if (st === "ok") continue;
    const what = st === "fault" ? "not detected" : st === "no-fix" ? "no satellite fix" : "no valid reading";
    add(`sensor_${s.id}`, fillOn ? "info" : "warning", "device", `${s.name}: ${what}`,
      fillOn ? `${s.role} shown as estimate (SIM)` : `${s.role} unavailable`, null);
  }

  return out;
}

// ── Active alert bookkeeping ─────────────────────────────────
let persistAlert = () => {};
function onPersist(fn) { persistAlert = fn; }

function findActive(key) {
  return state.alerts.find((a) => a.key === key && a.active);
}

function raise(cond, scope = "reading") {
  const now = Date.now();
  const cur = findActive(cond.key);
  if (cur) {
    cur.updatedAt = now;
    cur.value = cond.value;
    cur.message = cond.message;
    cur.misses = 0;
    if (SEV_RANK[cond.severity] > SEV_RANK[cur.severity]) {
      cur.severity = cond.severity;
      cur.title = cond.title;
      cur.acknowledged = false;
      cur.escalatedAt = now;
      persistAlert(cur);
      bus.emit("alert", cur);
    }
    return cur;
  }
  const a = {
    id: crypto.randomUUID(),
    scope,
    ...cond,
    soldierId: state.soldier.id,
    createdAt: now,
    updatedAt: now,
    clearedAt: null,
    acknowledged: false,
    active: true,
    misses: 0,
  };
  state.alerts.unshift(a);
  if (state.alerts.length > 200) state.alerts.length = 200;
  persistAlert(a);
  bus.emit("alert", a);
  console.log(`[alert] ${a.severity.toUpperCase()} ${a.title}: ${a.message}`);
  changed();
  return a;
}

function clear(key) {
  const a = findActive(key);
  if (!a) return;
  a.active = false;
  a.clearedAt = Date.now();
  persistAlert(a);
  changed();
}

// Apply the result of evaluate() for one reading
function sync(conditions) {
  const keys = new Set(conditions.map((c) => c.key));
  for (const c of conditions) raise(c, "reading");
  for (const a of state.alerts) {
    if (!a.active || a.scope !== "reading" || keys.has(a.key)) continue;
    a.misses = (a.misses || 0) + 1;
    if (a.misses >= 2) clear(a.key);
  }
}

function acknowledge(id) {
  const a = state.alerts.find((x) => x.id === id);
  if (!a) return null;
  a.acknowledged = true;
  a.ackAt = Date.now();
  persistAlert(a);
  changed();
  return a;
}

function overallStatus() {
  if (state.band.status !== "live") return state.band.status === "lost" ? "NO SIGNAL" : "STANDBY";
  const active = state.alerts.filter((a) => a.active && a.category !== "device" && a.category !== "environment");
  if (active.some((a) => a.severity === "critical")) return "CRITICAL";
  if (active.some((a) => a.severity === "warning")) return "CAUTION";
  return "NOMINAL";
}

module.exports = { evaluate, sync, raise, clear, acknowledge, overallStatus, onPersist, spo2Limits };
