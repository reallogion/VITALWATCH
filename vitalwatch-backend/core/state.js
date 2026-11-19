// ─────────────────────────────────────────────────────────────
//  Single in-memory source of truth. Everything the dashboard
//  shows comes from here (pushed live over /api/stream).
// ─────────────────────────────────────────────────────────────
const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");
const { CONFIG, DEFAULT_SOLDIER } = require("../config/constants");

const SETTINGS_FILE = path.join(__dirname, "..", "data", "settings.json");
const bus = new EventEmitter();
bus.setMaxListeners(50);

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return {};
  }
}
const saved = loadSettings();

const state = {
  startedAt: Date.now(),
  version: "2.0.0",
  receiver: {
    status: "searching", // searching | connected | silent | disconnected | error
    port: null,
    chip: null,
    mode: CONFIG.serialPort === "auto" ? "auto" : "manual",
    baud: CONFIG.serialBaud,
    lastLineAt: null,
    lastHeartbeatAt: null,
    receiverUptime: null,
    error: null,
    hint: null,
    linesOk: 0,
    linesBad: 0,
  },
  band: {
    status: "waiting", // waiting | live | lost
    source: null, // lora | simulator
    lastPacketAt: null,
    firstPacketAt: null,
    seq: null,
    packets: 0,
    missed: 0,
    rssi: null,
    snr: null,
    battery: null,
    session: Date.now(), // changes when a session is reset (dashboard clears its charts)
  },
  simulator: { enabled: false, scenario: "normal", allowed: CONFIG.allowSimulator },
  soldier: { ...DEFAULT_SOLDIER, ...(saved.soldier || {}) },
  settings: {
    fillFailedSensors: saved.fillFailedSensors ?? CONFIG.fillFailedSensors,
    llmEnabled: saved.llmEnabled ?? CONFIG.llm.enabled,
  },
  latest: null, // latest processed reading
  derived: null, // computed metrics for latest reading
  alerts: [], // active + recent alerts (newest first)
  analysis: null, // latest AI analysis
  analyses: [], // last few analyses
  llm: { busy: false, providers: [], lastError: null, callsToday: 0, tokensToday: 0, day: null },
  firebase: false,
};

const history = []; // processed readings, oldest first
const rxLog = []; // last receiver lines for the debug console

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(
      SETTINGS_FILE,
      JSON.stringify({ soldier: state.soldier, ...state.settings }, null, 2)
    );
  } catch (err) {
    console.error("[settings] save failed:", err.message);
  }
}

function pushHistory(reading) {
  history.push(reading);
  const cutoff = Date.now() - CONFIG.historyWindowMs;
  while (history.length && history[0].timestamp < cutoff) history.shift();
}

function logLine(dir, text) {
  rxLog.push({ t: Date.now(), dir, text: String(text).slice(0, 300) });
  if (rxLog.length > 200) rxLog.shift();
  bus.emit("log", rxLog[rxLog.length - 1]);
}

// Throttled "something changed" signal for the live stream
let pending = null;
function changed() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    bus.emit("state");
  }, 150);
}

function snapshot() {
  return {
    serverTime: Date.now(),
    startedAt: state.startedAt,
    version: state.version,
    receiver: state.receiver,
    band: state.band,
    simulator: state.simulator,
    soldier: state.soldier,
    settings: state.settings,
    latest: state.latest,
    derived: state.derived,
    alerts: state.alerts.slice(0, 60),
    analysis: state.analysis,
    analyses: state.analyses.slice(0, 5),
    llm: state.llm,
    firebase: state.firebase,
  };
}

module.exports = { state, history, rxLog, bus, changed, snapshot, pushHistory, logLine, saveSettings };
