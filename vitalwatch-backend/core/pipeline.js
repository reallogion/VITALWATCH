// ─────────────────────────────────────────────────────────────
//  One path for every band packet, real or simulated:
//  parse -> fill failed sensors -> derived metrics -> alerts
//  -> store -> AI trigger -> live push to dashboard
// ─────────────────────────────────────────────────────────────
const { CONFIG } = require("../config/constants");
const { state, history, changed, pushHistory, logLine, bus } = require("./state");
const { parseLine } = require("./packetParser");
const { applyFallback } = require("./sensorFallback");
const { compute, altitudeFromPressure } = require("./derived");
const alerts = require("./alertEngine");
const persistence = require("../services/persistence");

alerts.onPersist((a) => persistence.saveAlert(a));

function lastRealFix() {
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i];
    if (r.lat && !r.simulated.includes("lat")) return { lat: r.lat, lng: r.lng };
  }
  return null;
}

// Called for every text line from the receiver (or the simulator)
function handleLine(line, source = "lora") {
  const msg = parseLine(line);
  const rx = state.receiver;
  if (msg.kind === "empty") return;
  if (source === "lora") {
    rx.lastLineAt = Date.now();
    if (rx.status === "silent") {
      rx.status = "connected";
      rx.hint = null;
      changed();
    }
  }

  // Heartbeats are not logged (one every 2 s would flood the console)
  if (msg.kind !== "heartbeat") logLine(source === "simulator" ? "sim" : "rx", line);

  if (msg.kind === "heartbeat") {
    rx.lastHeartbeatAt = Date.now();
    rx.receiverUptime = msg.uptime;
    changed();
    return;
  }
  if (msg.kind === "log") return;
  if (msg.kind === "bad") {
    rx.linesBad++;
    logLine("err", `Bad packet: ${msg.error}`);
    changed();
    return;
  }
  if (source === "lora") rx.linesOk++;
  ingest(msg, source);
}

function ingest(msg, source) {
  const now = Date.now();
  const band = state.band;
  const p = msg.payload;

  // A real band always wins over test mode
  if (source === "lora" && state.simulator.enabled) bus.emit("realBand");
  if (source === "lora" && band.source === "simulator") resetBand();

  // Packet loss from sequence numbers
  if (band.seq !== null && p.seq !== null && p.seq > band.seq + 1 && band.source === source) {
    band.missed += p.seq - band.seq - 1;
  }

  const wasLive = band.status === "live";
  band.status = "live";
  band.source = source;
  band.lastPacketAt = now;
  band.firstPacketAt = wasLive ? band.firstPacketAt : now;
  band.seq = p.seq;
  band.packets++;
  band.rssi = msg.rssi;
  band.snr = msg.snr;
  band.battery = p.battery;
  if (!wasLive) {
    alerts.clear("link_lost");
    console.log(`[band] LIVE (${source})`);
  }

  const prevAlt = state.derived?.altitude ?? null;
  const filled = applyFallback(p, {
    fill: state.settings.fillFailedSensors,
    lastFix: lastRealFix(),
    altitude: prevAlt ?? altitudeFromPressure(p.pressure),
  });

  const reading = {
    ...filled,
    sensorBits: undefined,
    timestamp: now,
    soldierId: state.soldier.id,
    rssi: msg.rssi,
    snr: msg.snr,
    encrypted: msg.encrypted,
    source,
  };
  delete reading.sensorBits;

  pushHistory(reading);
  const derived = compute(reading, history, state.soldier);
  state.latest = reading;
  state.derived = derived;

  alerts.sync(alerts.evaluate(reading, derived, state.settings.fillFailedSensors));
  derived.status = alerts.overallStatus();

  persistence.saveReading(reading, derived);
  bus.emit("reading", reading);
  changed();
}

// Watchdog: band timeout + receiver silence
setInterval(() => {
  const now = Date.now();
  const band = state.band;
  if (band.status === "live" && now - band.lastPacketAt > CONFIG.bandTimeoutMs) {
    band.status = "lost";
    alerts.raise(
      {
        key: "link_lost",
        severity: "critical",
        category: "link",
        title: "Signal lost",
        message: `No packet from band for ${Math.round((now - band.lastPacketAt) / 1000)} s`,
        value: null,
      },
      "system"
    );
    if (state.derived) state.derived.status = alerts.overallStatus();
    console.log("[band] signal LOST");
    changed();
  }
  const rx = state.receiver;
  if (rx.status === "connected" && now - (rx.lastLineAt || rx.connectedAt || now) > CONFIG.receiverSilentMs) {
    rx.status = "silent";
    rx.hint = `Port is open but the receiver sends nothing. Check the receiver firmware is flashed and uses ${rx.baud} baud.`;
    changed();
  }
}, 1000);

// After test mode stops: forget the simulated session completely
function resetBand() {
  Object.assign(state.band, {
    status: "waiting", source: null, lastPacketAt: null, firstPacketAt: null,
    seq: null, packets: 0, missed: 0, rssi: null, snr: null, battery: null, session: Date.now(),
  });
  for (const a of state.alerts) if (a.active) { a.active = false; a.clearedAt = Date.now(); }
  state.latest = null;
  state.derived = null;
  state.analysis = null;
  history.length = 0;
  changed();
}

module.exports = { handleLine, resetBand };
