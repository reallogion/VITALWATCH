// ─────────────────────────────────────────────────────────────
//  TEST MODE band simulator (for development without hardware).
//  It builds real encrypted packet lines and feeds them through
//  the exact same parser/pipeline as the USB receiver, so the
//  whole software path is tested. The dashboard shows a clear
//  "TEST MODE" banner while it runs. Off by default.
// ─────────────────────────────────────────────────────────────
const { state, changed, logLine, bus } = require("../core/state");
const { handleLine, resetBand } = require("../core/pipeline");
const { buildPayload } = require("../core/packetParser");
const { encryptToHex } = require("../core/crypto");
const { CONFIG } = require("../config/constants");

const SCENARIOS = {
  normal: "Patrol at 3,500 m, all normal",
  exertion: "Heavy exertion, strain rising",
  heat: "Heat injury developing",
  hypoxia: "Oxygen falling (altitude sickness)",
  man_down: "Fall, then no movement",
  sensor_fault: "MAX30102 + body probe failed",
};

let timer = null;
let seq = 0;
let t0 = Date.now();
let pos = null;
let s = null;

const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const jit = (n) => (Math.random() - 0.5) * 2 * n;
const pressureAt = (alt) => CONFIG.seaLevelHpa * Math.pow(1 - alt / 44330, 5.255);

function reset() {
  t0 = Date.now();
  s = { hr: 88, spo2: 92, temp: 36.6, amb: 9, alt: 3500, act: 1, battery: state.band.battery ?? 86, fallPending: state.simulator.scenario === "man_down" };
  if (!pos) pos = { lat: CONFIG.baseLat, lng: CONFIG.baseLng, h: Math.random() * 6 };
}

function step() {
  const sc = state.simulator.scenario;
  const m = (Date.now() - t0) / 60000; // minutes into scenario
  let fall = false;
  const bits = { max30102: true, bodytemp: true, bmp280: true, mpu6050: true, gps: true };

  switch (sc) {
    case "exertion":
      s.act = 2;
      s.hr = lerp(s.hr, lerp(120, 172, m / 3), 0.3);
      s.temp = lerp(36.7, 38.7, m / 5);
      s.spo2 = lerp(92, 89, m / 4);
      break;
    case "heat":
      s.act = 1;
      s.amb = lerp(38, 45, m / 2);
      s.hr = lerp(s.hr, lerp(105, 150, m / 4), 0.3);
      s.temp = lerp(37.2, 39.8, m / 4);
      s.alt = 300;
      s.spo2 = lerp(s.spo2, 97, 0.5);
      break;
    case "hypoxia":
      s.act = 1;
      s.alt = lerp(3600, 4300, m / 3);
      s.spo2 = lerp(90, 79, m / 3);
      s.hr = lerp(s.hr, lerp(95, 128, m / 3), 0.3);
      break;
    case "man_down":
      if (s.fallPending) { s.act = 1; fall = true; s.fallPending = false; }
      else s.act = 0;
      s.hr = lerp(s.hr, m < 1 ? 128 : 46, 0.15);
      s.spo2 = lerp(92, 86, m / 3);
      break;
    case "sensor_fault":
      bits.max30102 = false;
      bits.bodytemp = false;
      s.act = 1;
      break;
    default: // normal
      s.act = m % 3 < 0.4 ? 0 : 1;
      s.hr = lerp(s.hr, s.act ? 96 : 74, 0.25);
      s.spo2 = lerp(s.spo2, 92, 0.2);
      s.temp = lerp(s.temp, 36.7, 0.1);
      s.amb = lerp(s.amb, 9, 0.1);
      s.alt = lerp(s.alt, 3500, 0.2);
  }

  if (s.act > 0) {
    pos.h += jit(0.35);
    const step = s.act === 2 ? 0.00009 : 0.00004;
    pos.lat += Math.cos(pos.h) * step;
    pos.lng += Math.sin(pos.h) * step;
  }
  s.battery = Math.max(5, s.battery - 0.01);

  const payload = buildPayload({
    bandId: "S001",
    seq: seq++,
    heartRate: bits.max30102 ? Math.round(s.hr + jit(2)) : null,
    spo2: bits.max30102 ? Math.round(Math.min(100, s.spo2 + jit(0.6))) : null,
    bodyTemp: bits.bodytemp ? s.temp + jit(0.05) : null,
    ambientTemp: s.amb + jit(0.2),
    pressure: pressureAt(s.alt + jit(2)),
    activity: s.act,
    fall,
    lat: pos.lat,
    lng: pos.lng,
    gpsSats: 9,
    battery: s.battery,
    sensorBits: bits,
  });
  const rssi = Math.round(-92 + jit(8));
  const snr = +(7 + jit(2)).toFixed(1);
  handleLine(`$VWE,${encryptToHex(payload)},${rssi},${snr}`, "simulator");
}

function start(scenario = "normal") {
  if (!CONFIG.allowSimulator) throw new Error("Simulator disabled (ALLOW_SIMULATOR=false)");
  if (!SCENARIOS[scenario]) scenario = "normal";
  const switching = Boolean(timer) && state.simulator.scenario !== scenario;
  state.simulator.scenario = scenario;
  if (switching) resetBand(); // each scenario starts a clean session
  reset();
  if (!timer) {
    timer = setInterval(step, 5000);
    step();
    logLine("sys", `TEST MODE simulator started: ${SCENARIOS[scenario]}`);
  } else {
    logLine("sys", `Simulator scenario: ${SCENARIOS[scenario]}`);
    step();
  }
  state.simulator.enabled = true;
  changed();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  state.simulator.enabled = false;
  pos = null;
  seq = 0;
  if (state.band.source === "simulator") resetBand();
  logLine("sys", "TEST MODE simulator stopped");
  changed();
}

bus.on("realBand", () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  state.simulator.enabled = false;
  pos = null;
  logLine("sys", "Real band detected. Test mode switched off.");
  changed();
});

module.exports = { start, stop, SCENARIOS };
