// ─────────────────────────────────────────────────────────────
//  Parses one text line coming from the receiver over USB.
//  Full protocol: see firmware/PROTOCOL.md
//
//  $HB,<uptimeSec>,<rxCount>                  receiver heartbeat (every 2 s)
//  $VW,<payload CSV>,<rssi>,<snr>             band packet, plain text
//  $VWE,<hex IV+ciphertext>,<rssi>,<snr>      band packet, AES-128 encrypted
//  anything else                              receiver debug text (logged only)
//
//  Band payload CSV (14 fields):
//  id,seq,hr,spo2,bodyTemp,ambTemp,pressure,activity,fall,lat,lng,sats,battery,sensorMask
// ─────────────────────────────────────────────────────────────
const { decryptHex } = require("./crypto");
const { SENSORS } = require("../config/constants");

const PAYLOAD_FIELDS = 14;

// Empty, "nan" or -1 means "sensor gave no reading"
function val(s) {
  if (s === undefined) return null;
  const t = String(s).trim().toLowerCase();
  if (t === "" || t === "nan" || t === "-1" || t === "null") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parsePayload(csv) {
  const p = csv.split(",");
  if (p.length < PAYLOAD_FIELDS) throw new Error(`payload has ${p.length} fields, expected ${PAYLOAD_FIELDS}`);
  const mask = val(p[13]);
  const sensorBits = {};
  for (const s of SENSORS) sensorBits[s.id] = mask === null ? null : Boolean((mask >> s.bit) & 1);
  return {
    bandId: p[0].trim() || "S001",
    seq: val(p[1]),
    heartRate: val(p[2]),
    spo2: val(p[3]),
    bodyTemp: val(p[4]),
    ambientTemp: val(p[5]),
    pressure: val(p[6]),
    activity: val(p[7]), // 0 still, 1 walking, 2 running
    fall: val(p[8]) === 1,
    lat: val(p[9]),
    lng: val(p[10]),
    gpsSats: val(p[11]),
    battery: val(p[12]),
    sensorBits,
  };
}

function parseLine(raw) {
  const line = String(raw).replace(/\r/g, "").trim();
  if (!line) return { kind: "empty" };

  if (line.startsWith("$HB")) {
    const p = line.split(",");
    return { kind: "heartbeat", uptime: val(p[1]), rxCount: val(p[2]) };
  }

  if (line.startsWith("$VWE,") || line.startsWith("$VW,")) {
    try {
      const encrypted = line.startsWith("$VWE,");
      const body = line.slice(encrypted ? 5 : 4);
      const parts = body.split(",");
      const snr = val(parts.pop());
      const rssi = val(parts.pop());
      const payloadText = encrypted ? decryptHex(parts.join("")) : parts.join(",");
      const payload = parsePayload(payloadText);
      return { kind: "band", encrypted, rssi, snr, payload, payloadText };
    } catch (err) {
      return { kind: "bad", error: err.message, line };
    }
  }

  return { kind: "log", text: line };
}

// Build a payload CSV (used by the simulator and tests)
function buildPayload(r) {
  const f = (v, d = 0) => (v === null || v === undefined ? "" : Number(v).toFixed(d));
  let mask = 0;
  for (const s of SENSORS) if (r.sensorBits?.[s.id] !== false) mask |= 1 << s.bit;
  return [
    r.bandId || "S001", r.seq ?? 0, f(r.heartRate), f(r.spo2), f(r.bodyTemp, 1), f(r.ambientTemp, 1),
    f(r.pressure, 1), r.activity ?? 0, r.fall ? 1 : 0, f(r.lat, 6), f(r.lng, 6), r.gpsSats ?? 0,
    f(r.battery), mask,
  ].join(",");
}

module.exports = { parseLine, parsePayload, buildPayload };
