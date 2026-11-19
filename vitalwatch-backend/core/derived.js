// ─────────────────────────────────────────────────────────────
//  Computed metrics: altitude, baselines, trends, strain index,
//  time stationary, speed. These feed the alert rules, the AI
//  prompt and the dashboard.
// ─────────────────────────────────────────────────────────────
const { CONFIG } = require("../config/constants");

const MIN = 60 * 1000;

function altitudeFromPressure(hPa) {
  if (hPa === null || hPa === undefined) return null;
  return Math.round(44330 * (1 - Math.pow(hPa / CONFIG.seaLevelHpa, 1 / 5.255)));
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Real (non-estimated) values of one field within a time window
function series(history, field, windowMs, now) {
  return history
    .filter((r) => r.timestamp >= now - windowMs && r[field] !== null && r[field] !== undefined && !r.simulated?.includes(field))
    .map((r) => ({ t: r.timestamp, v: r[field] }));
}

function stats(pts) {
  if (pts.length < 2) return null;
  const vs = pts.map((p) => p.v);
  const n = pts.length;
  const mt = pts.reduce((s, p) => s + p.t, 0) / n;
  const mv = vs.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.t - mt) * (p.v - mv); den += (p.t - mt) ** 2; }
  const slopePerMin = den ? (num / den) * MIN : 0;
  return {
    min: Math.min(...vs),
    max: Math.max(...vs),
    avg: +mv.toFixed(1),
    slopePerMin: +slopePerMin.toFixed(2),
    change: +(vs[n - 1] - vs[0]).toFixed(1),
    n,
  };
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function compute(reading, history, soldier) {
  const now = reading.timestamp;
  const d = {};

  // Altitude from BMP280 pressure
  d.altitude = altitudeFromPressure(reading.pressure);
  d.altitudeEstimated = reading.simulated.includes("pressure");

  // Resting HR baseline: median HR while still in the last 15 min
  const still = history.filter(
    (r) => r.timestamp >= now - 15 * MIN && r.activity === 0 && r.heartRate && !r.simulated.includes("heartRate")
  );
  d.hrBaseline = median(still.map((r) => r.heartRate)) ?? soldier.restingHR ?? 70;

  // Starting body temp: median of first 2 min of this session, else 36.6
  const firstTemps = history.slice(0, 24).filter((r) => r.bodyTemp && !r.simulated.includes("bodyTemp")).map((r) => r.bodyTemp);
  d.tempBaseline = median(firstTemps) ?? 36.6;

  // Physiological Strain Index (Moran et al., 1998), 0 to 10.
  // Body probe is on the arm, so this is an approximation.
  if (reading.heartRate && reading.bodyTemp) {
    const t0 = Math.min(d.tempBaseline, 38.9);
    const hr0 = Math.min(d.hrBaseline, 170);
    const psi = 5 * ((reading.bodyTemp - t0) / (39.5 - t0)) + 5 * ((reading.heartRate - hr0) / (180 - hr0));
    d.psi = +Math.max(0, Math.min(10, psi)).toFixed(1);
    d.psiEstimated = reading.simulated.includes("heartRate") || reading.simulated.includes("bodyTemp");
  } else {
    d.psi = null;
  }

  // Heart-rate zone as % of age-predicted max
  const hrMax = 220 - (soldier.age || 26);
  d.hrMaxPct = reading.heartRate ? Math.round((reading.heartRate / hrMax) * 100) : null;

  // Trends (real values only)
  d.trends = {};
  for (const f of ["heartRate", "spo2", "bodyTemp"]) {
    d.trends[f] = {
      m2: stats(series(history, f, 2 * MIN, now)),
      m10: stats(series(history, f, 10 * MIN, now)),
    };
  }
  const altPts = history
    .filter((r) => r.timestamp >= now - MIN && r.pressure && !r.simulated.includes("pressure"))
    .map((r) => ({ t: r.timestamp, v: altitudeFromPressure(r.pressure) }));
  d.altitudeChange1m = altPts.length >= 2 ? altPts[altPts.length - 1].v - altPts[0].v : 0;

  // How long the soldier has been still
  let stillSince = now;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].activity === 0) stillSince = history[i].timestamp;
    else break;
  }
  d.stationaryMin = reading.activity === 0 ? +((now - stillSince) / MIN).toFixed(1) : 0;

  // Time since last fall event
  const lastFall = [...history].reverse().find((r) => r.fall && !r.simulated.includes("activity"));
  d.secSinceFall = lastFall ? Math.round((now - lastFall.timestamp) / 1000) : null;

  // Movement from GPS (real fixes only)
  const fixes = history.filter((r) => r.timestamp >= now - 2 * MIN && r.lat && !r.simulated.includes("lat"));
  if (fixes.length >= 2) {
    const a = fixes[0], b = fixes[fixes.length - 1];
    const m = haversine(a, b);
    d.speedKmh = +((m / ((b.timestamp - a.timestamp) / 1000)) * 3.6).toFixed(1);
  } else d.speedKmh = null;
  let dist = 0;
  const allFix = history.filter((r) => r.lat && r.lng);
  for (let i = 1; i < allFix.length; i++) dist += haversine(allFix[i - 1], allFix[i]);
  d.distanceKm = +(dist / 1000).toFixed(2);

  return d;
}

module.exports = { compute, altitudeFromPressure };
