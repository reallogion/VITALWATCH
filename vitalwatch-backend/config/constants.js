// ─────────────────────────────────────────────────────────────
//  All tunable numbers live here.
// ─────────────────────────────────────────────────────────────
const num = (v, d) => (v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === "" ? d : String(v).toLowerCase() === "true");

const CONFIG = {
  port: num(process.env.PORT, 5000),
  serialPort: process.env.SERIAL_PORT || "auto",
  serialBaud: num(process.env.SERIAL_BAUD, 115200),
  aesKey: process.env.AES_KEY || "VitalWatch12345!",
  bandTimeoutMs: num(process.env.BAND_TIMEOUT_SEC, 20) * 1000,
  receiverSilentMs: 8000, // port open but no heartbeat from receiver firmware
  fillFailedSensors: bool(process.env.FILL_FAILED_SENSORS, true),
  allowSimulator: bool(process.env.ALLOW_SIMULATOR, true),
  seaLevelHpa: num(process.env.SEA_LEVEL_HPA, 1013.25),
  baseLat: num(process.env.BASE_LAT, 34.1526),
  baseLng: num(process.env.BASE_LNG, 77.5771),
  persistIntervalMs: num(process.env.PERSIST_INTERVAL_SEC, 10) * 1000,
  historyWindowMs: 2 * 60 * 60 * 1000, // keep 2 h of readings in memory
  llm: {
    enabled: bool(process.env.LLM_ENABLED, true),
    providers: (process.env.LLM_PROVIDERS || "groq,gemini,openrouter")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    minIntervalMs: num(process.env.LLM_MIN_INTERVAL_SEC, 20) * 1000,
    maxIntervalMs: num(process.env.LLM_MAX_INTERVAL_SEC, 180) * 1000,
    timeoutMs: 20000,
  },
};

// Known USB-serial chips used on ESP32 boards (vendor IDs, lowercase hex)
const ESP32_USB_VENDORS = {
  "10c4": "Silicon Labs CP210x",
  "1a86": "WCH CH340/CH9102",
  "0403": "FTDI",
  "303a": "Espressif native USB",
  "067b": "Prolific",
};

// Sensors on the band, in the bit order of the packet's sensor mask
const SENSORS = [
  { id: "max30102", bit: 0, name: "MAX30102", role: "Heart rate + SpO2", fields: ["heartRate", "spo2"] },
  { id: "bodytemp", bit: 1, name: "Body temp probe", role: "Skin temperature", fields: ["bodyTemp"] },
  { id: "bmp280", bit: 2, name: "BMP280", role: "Ambient temp + pressure", fields: ["ambientTemp", "pressure"] },
  { id: "mpu6050", bit: 3, name: "MPU-6050", role: "Motion + fall", fields: ["activity", "fall"] },
  { id: "gps", bit: 4, name: "GPS", role: "Position fix", fields: ["lat", "lng"] },
];

// Physically possible ranges. Outside these = sensor glitch, not a reading.
const VALID_RANGE = {
  heartRate: [25, 230],
  spo2: [50, 100],
  bodyTemp: [28, 43],
  ambientTemp: [-40, 70],
  pressure: [300, 1100],
  battery: [0, 100],
};

// Alert thresholds. SpO2 limits drop with altitude (normal physiology).
const THRESHOLDS = {
  heartRate: { critHigh: 180, warnHigh: 150, warnHighRunning: 170, warnLow: 50, critLow: 40 },
  bodyTemp: { critHigh: 39.5, warnHigh: 38.5, warnLow: 36.0, critLow: 35.0 },
  spo2ByAltitude: [
    { maxAlt: 1500, warn: 94, crit: 90 },
    { maxAlt: 3000, warn: 92, crit: 88 },
    { maxAlt: 4500, warn: 88, crit: 83 },
    { maxAlt: Infinity, warn: 85, crit: 80 },
  ],
  psi: { warn: 7, crit: 9 },
  battery: { warn: 20, crit: 10 },
  rssiWeak: -115,
  stationaryInfoMin: 10,
  stationaryAbnormalMin: 5,
  manDownAfterFallSec: 20,
  rapidAltitudeM: 150, // metres within 60 s
  hrRiseAtRest: 15, // bpm per 2 min while still
  spo2Drop: 4, // points per 2 min
  ambientHot: 40,
  ambientCold: 0,
};

const DEFAULT_SOLDIER = {
  id: "soldier_001",
  name: "Arjun Sharma",
  rank: "Sgt",
  unit: "Alpha Coy",
  serviceNo: "IC-00001",
  age: 26,
  bloodGroup: "B+",
  restingHR: 70,
};

module.exports = { CONFIG, ESP32_USB_VENDORS, SENSORS, VALID_RANGE, THRESHOLDS, DEFAULT_SOLDIER };
