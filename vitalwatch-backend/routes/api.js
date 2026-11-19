const express = require("express");
const { state, history, rxLog, bus, snapshot, changed, saveSettings } = require("../core/state");
const alerts = require("../core/alertEngine");
const receiver = require("../services/receiver");
const simulator = require("../services/simulator");
const analyzer = require("../services/llm/analyzer");
const persistence = require("../services/persistence");
const { SENSORS, THRESHOLDS, CONFIG } = require("../config/constants");

const router = express.Router();
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(500).json({ error: e.message }));

// ── Live ─────────────────────────────────────────────────────
router.get("/health", (req, res) => res.json({ ok: true, version: state.version, uptime: process.uptime() }));
router.get("/state", (req, res) => res.json(snapshot()));

// Server-Sent Events: the dashboard gets every change instantly
router.get("/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send("state", snapshot());
  const onState = () => send("state", snapshot());
  const onReading = (r) => send("reading", r);
  const onLog = (l) => send("log", l);
  bus.on("state", onState);
  bus.on("reading", onReading);
  bus.on("log", onLog);
  const ping = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    clearInterval(ping);
    bus.off("state", onState);
    bus.off("reading", onReading);
    bus.off("log", onLog);
  });
});

router.get("/history", wrap(async (req, res) => {
  const minutes = Math.min(Number(req.query.minutes) || 30, 24 * 60);
  const since = Date.now() - minutes * 60000;
  let rows = history.filter((r) => r.timestamp >= since);
  if (!rows.length || (history[0] && history[0].timestamp > since + 60000 && minutes > 120)) {
    const older = await persistence.loadHistory(since);
    if (older.length) rows = [...older.filter((r) => !rows.length || r.timestamp < rows[0].timestamp), ...rows];
  }
  res.json(rows);
}));

router.get("/export.csv", (req, res) => {
  const cols = ["timestamp", "heartRate", "spo2", "bodyTemp", "ambientTemp", "pressure", "activity", "fall", "lat", "lng", "battery", "rssi", "snr", "source"];
  const lines = [["time_iso", ...cols, "estimated_fields"].join(",")];
  for (const r of history) lines.push([new Date(r.timestamp).toISOString(), ...cols.map((c) => r[c] ?? ""), `"${r.simulated.join(" ")}"`].join(","));
  res.set({ "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="vitalwatch_${Date.now()}.csv"` });
  res.send(lines.join("\n"));
});

// ── Alerts ───────────────────────────────────────────────────
router.get("/alerts", wrap(async (req, res) => {
  const log = (await persistence.loadAlertLog()).map((a) =>
    a.title
      ? a
      : { // records saved by the old v1 backend
          ...a,
          title: a.type === "llm_analyzed" ? "AI analysis (v1)" : String(a.message || "Alert").split(":")[0],
          severity: ["critical", "warning", "info"].includes(a.severity) ? a.severity : "info",
          category: a.type === "llm_analyzed" ? "ai" : "vital",
          active: false,
          clearedAt: a.resolvedAt || null,
        }
  );
  const map = new Map(log.map((a) => [a.id, a]));
  for (const a of state.alerts) map.set(a.id, a);
  res.json([...map.values()].sort((a, b) => b.createdAt - a.createdAt));
}));
router.post("/alerts/:id/ack", (req, res) => {
  const a = alerts.acknowledge(req.params.id);
  a ? res.json(a) : res.status(404).json({ error: "not found" });
});
router.post("/alerts/ack-all", (req, res) => {
  for (const a of state.alerts) if (a.active && !a.acknowledged) alerts.acknowledge(a.id);
  res.json({ ok: true });
});

// ── Receiver (USB) ───────────────────────────────────────────
router.get("/receiver/ports", wrap(async (req, res) => res.json(await receiver.listPorts())));
router.post("/receiver/connect", wrap(async (req, res) => res.json(await receiver.connect(req.body?.path || null))));
router.post("/receiver/disconnect", wrap(async (req, res) => {
  await receiver.disconnect(true);
  res.json(state.receiver);
}));
router.get("/receiver/log", (req, res) => res.json(rxLog));

// ── Test mode ────────────────────────────────────────────────
router.get("/simulator", (req, res) => res.json({ ...state.simulator, scenarios: simulator.SCENARIOS }));
router.post("/simulator", wrap(async (req, res) => {
  const { enabled, scenario } = req.body || {};
  if (enabled === false) simulator.stop();
  else simulator.start(scenario);
  res.json({ ...state.simulator, scenarios: simulator.SCENARIOS });
}));

// ── AI ───────────────────────────────────────────────────────
router.post("/llm/analyze", wrap(async (req, res) => {
  if (!state.latest) return res.status(409).json({ error: "No band data yet" });
  res.json(await analyzer.run("manual"));
}));
router.post("/llm/test", wrap(async (req, res) => res.json(await analyzer.test())));

// ── Settings / soldier profile ───────────────────────────────
router.get("/config", (req, res) =>
  res.json({ sensors: SENSORS, thresholds: THRESHOLDS, baud: CONFIG.serialBaud, bandTimeoutSec: CONFIG.bandTimeoutMs / 1000, persistIntervalSec: CONFIG.persistIntervalMs / 1000, llmProviders: CONFIG.llm.providers })
);
router.patch("/settings", (req, res) => {
  const b = req.body || {};
  if (typeof b.fillFailedSensors === "boolean") state.settings.fillFailedSensors = b.fillFailedSensors;
  if (typeof b.llmEnabled === "boolean") state.settings.llmEnabled = b.llmEnabled;
  if (b.soldier && typeof b.soldier === "object") {
    const allowed = ["name", "rank", "unit", "serviceNo", "age", "bloodGroup", "restingHR"];
    for (const k of allowed) if (b.soldier[k] !== undefined) state.soldier[k] = ["age", "restingHR"].includes(k) ? Number(b.soldier[k]) : String(b.soldier[k]).slice(0, 40);
  }
  saveSettings();
  changed();
  res.json({ settings: state.settings, soldier: state.soldier });
});

module.exports = router;
