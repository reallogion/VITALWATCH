// ─────────────────────────────────────────────────────────────
//  Backup estimator for failed sensors.
//
//  Runs ONLY on real band packets (never when nothing is connected).
//  If a sensor is missing on I2C, gives no reading, or gives an
//  impossible value, and FILL_FAILED_SENSORS is on, its value is
//  replaced with a smooth, realistic estimate and the field name is
//  added to reading.simulated[]. Alerts and the AI ignore those
//  fields; the dashboard shows a "SIM" tag on them.
//
//  When you replace the broken part, nothing needs changing: the
//  real value is used automatically as soon as it is valid.
// ─────────────────────────────────────────────────────────────
const { SENSORS, VALID_RANGE, CONFIG } = require("../config/constants");

const walk = {}; // current estimate per field
let activityState = { value: 1, until: 0 };
let patrol = null;

function drift(field, target, speed, noise, min, max) {
  const cur = walk[field] ?? target;
  let next = cur + (target - cur) * speed + (Math.random() - 0.5) * 2 * noise;
  next = Math.max(min, Math.min(max, next));
  walk[field] = next;
  return next;
}

function estimateActivity(now) {
  if (now > activityState.until) {
    const r = Math.random();
    activityState = { value: r < 0.25 ? 0 : r < 0.85 ? 1 : 2, until: now + 40000 + Math.random() * 80000 };
  }
  return activityState.value;
}

function estimatePosition(lastFix) {
  if (!patrol) {
    const base = lastFix || { lat: CONFIG.baseLat, lng: CONFIG.baseLng };
    patrol = { lat: base.lat, lng: base.lng, heading: Math.random() * Math.PI * 2 };
  }
  patrol.heading += (Math.random() - 0.5) * 0.4;
  const step = 0.00004; // ~4 m per packet
  patrol.lat += Math.cos(patrol.heading) * step;
  patrol.lng += Math.sin(patrol.heading) * step;
  return { lat: patrol.lat, lng: patrol.lng };
}

function inRange(field, v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return false;
  const r = VALID_RANGE[field];
  return r ? v >= r[0] && v <= r[1] : true;
}

/**
 * @param {object} p      parsed payload from packetParser
 * @param {object} ctx    { fill: bool, lastFix: {lat,lng}|null, altitude: number|null }
 * @returns {object}      reading with .sensors and .simulated
 */
function applyFallback(p, ctx) {
  const now = Date.now();
  const r = { ...p };
  const simulated = [];
  const sensors = {};

  // 1. Health of each sensor: fault (not detected) / no-data / ok
  for (const s of SENSORS) {
    const bit = p.sensorBits?.[s.id];
    let status = bit === false ? "fault" : "ok";
    if (status === "ok") {
      if (s.id === "gps") {
        if (p.lat === null || p.lng === null || (p.lat === 0 && p.lng === 0)) status = "no-fix";
      } else if (s.id === "mpu6050") {
        if (p.activity === null) status = "no-data";
      } else {
        const bad = s.fields.some((f) => !inRange(f, p[f]));
        if (bad) status = "no-data";
      }
    }
    sensors[s.id] = status;
  }

  if (!ctx.fill) {
    // Leave missing values empty; alerts will report the sensor fault.
    for (const s of SENSORS) {
      if (sensors[s.id] !== "ok") for (const f of s.fields) if (f !== "fall") r[f] = s.id === "gps" ? null : inRange(f, r[f]) ? r[f] : null;
    }
    return { ...r, sensors, simulated };
  }

  // 2. Fill failed ones with estimates
  const activity = sensors.mpu6050 === "ok" ? p.activity : estimateActivity(now);
  if (sensors.mpu6050 !== "ok") {
    r.activity = activity;
    r.fall = false;
    simulated.push("activity");
  }

  if (sensors.max30102 !== "ok") {
    const hrTarget = [72, 104, 142][activity] ?? 80;
    const alt = ctx.altitude ?? 0;
    const spTarget = 98 - Math.max(0, (alt - 1500) / 450);
    r.heartRate = Math.round(drift("heartRate", hrTarget, 0.15, 2.2, 55, 165));
    r.spo2 = Math.round(drift("spo2", spTarget, 0.2, 0.6, 88, 99));
    simulated.push("heartRate", "spo2");
  }

  if (sensors.bodytemp !== "ok") {
    r.bodyTemp = +drift("bodyTemp", 36.5 + activity * 0.25, 0.05, 0.04, 36.0, 37.6).toFixed(1);
    simulated.push("bodyTemp");
  }

  if (sensors.bmp280 !== "ok") {
    r.ambientTemp = +drift("ambientTemp", 18, 0.02, 0.15, -5, 35).toFixed(1);
    r.pressure = +drift("pressure", 1008, 0.02, 0.15, 990, 1020).toFixed(1);
    simulated.push("ambientTemp", "pressure");
  }

  if (sensors.gps !== "ok") {
    const pos = estimatePosition(ctx.lastFix);
    r.lat = pos.lat;
    r.lng = pos.lng;
    simulated.push("lat", "lng");
  } else {
    patrol = null; // real fix again; restart from it next time
  }

  return { ...r, sensors, simulated };
}

module.exports = { applyFallback };
