// ─────────────────────────────────────────────────────────────
//  Firebase writes, throttled so the free quota (20k writes/day)
//  is never hit. Old code wrote on every dashboard poll.
//  Collections: vitals, alerts, llmAnalyses
// ─────────────────────────────────────────────────────────────
const db = require("../config/firebase");
const { CONFIG } = require("../config/constants");
const { state } = require("../core/state");

state.firebase = Boolean(db);
let lastVitalsWrite = 0;

function clean(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

async function saveReading(reading, derived) {
  if (!db) return;
  const now = Date.now();
  if (now - lastVitalsWrite < CONFIG.persistIntervalMs) return;
  lastVitalsWrite = now;
  try {
    await db.collection("vitals").add(
      clean({
        ...reading,
        altitude: derived.altitude,
        psi: derived.psi,
        soldierID: reading.soldierId, // old field name kept for old records
      })
    );
  } catch (err) {
    console.error("[firebase] vitals write failed:", err.message);
  }
}

async function saveAlert(alert) {
  if (!db) return;
  try {
    const { misses, ...rest } = alert;
    await db.collection("alerts").doc(alert.id).set(clean(rest), { merge: true });
  } catch (err) {
    console.error("[firebase] alert write failed:", err.message);
  }
}

async function saveAnalysis(a) {
  if (!db) return;
  try {
    await db.collection("llmAnalyses").doc(a.id).set(clean(a));
  } catch (err) {
    console.error("[firebase] analysis write failed:", err.message);
  }
}

// Vitals history older than what is in memory (single-field index only)
async function loadHistory(sinceMs, limit = 2000) {
  if (!db) return [];
  try {
    const snap = await db.collection("vitals").where("timestamp", ">=", sinceMs).orderBy("timestamp", "asc").limit(limit).get();
    return snap.docs.map((d) => d.data());
  } catch (err) {
    console.error("[firebase] history read failed:", err.message);
    return [];
  }
}

async function loadAlertLog(limit = 300) {
  if (!db) return [];
  try {
    const snap = await db.collection("alerts").orderBy("createdAt", "desc").limit(limit).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[firebase] alert log read failed:", err.message);
    return [];
  }
}

module.exports = { saveReading, saveAlert, saveAnalysis, loadHistory, loadAlertLog };
