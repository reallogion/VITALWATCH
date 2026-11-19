// ─────────────────────────────────────────────────────────────
//  USB link to the receiver ESP32.
//  - Auto mode: scans every 3 s for an ESP32 USB chip and opens it.
//    Plug the receiver in at any time, in any order.
//  - Manual mode: the dashboard picks a COM port from a list.
//  - If the cable is pulled, it goes back to searching by itself.
// ─────────────────────────────────────────────────────────────
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { CONFIG, ESP32_USB_VENDORS } = require("../config/constants");
const { state, changed, logLine } = require("../core/state");
const { handleLine } = require("../core/pipeline");

let port = null;
let manualPath = CONFIG.serialPort !== "auto" ? CONFIG.serialPort : null;
let scanning = false;
let paused = false; // user pressed "Disconnect"

async function listPorts() {
  const ports = await SerialPort.list();
  return ports.map((p) => {
    const vid = (p.vendorId || "").toLowerCase();
    const chip = ESP32_USB_VENDORS[vid] || null;
    const hint = /silicon labs|cp210|wch|ch340|ch910|espressif|ftdi/i.test(`${p.manufacturer} ${p.friendlyName || ""}`);
    return {
      path: p.path,
      manufacturer: p.manufacturer || null,
      friendlyName: p.friendlyName || null,
      vendorId: vid || null,
      productId: (p.productId || "").toLowerCase() || null,
      chip: chip || (hint ? "USB serial (ESP32 likely)" : null),
      likelyEsp32: Boolean(chip || hint),
    };
  });
}

function setRx(patch) {
  Object.assign(state.receiver, patch);
  changed();
}

function explain(err) {
  const m = String(err?.message || err);
  if (/access denied|EBUSY|resource busy|being used/i.test(m))
    return "Port is busy. Close the Arduino IDE Serial Monitor (only one program can use the port).";
  if (/permission denied|EACCES/i.test(m))
    return "No permission for this port. On Linux: sudo usermod -a -G dialout $USER, then log out and in.";
  if (/file not found|cannot find|ENOENT|No such file/i.test(m))
    return "Port not found. Check the cable is a data cable and the CP210x/CH340 driver is installed.";
  return m;
}

function open(path, chip) {
  return new Promise((resolve) => {
    const p = new SerialPort({ path, baudRate: CONFIG.serialBaud, autoOpen: false });
    p.open((err) => {
      if (err) {
        setRx({ status: "error", port: path, error: err.message, hint: explain(err) });
        logLine("err", `Open ${path} failed: ${err.message}`);
        return resolve(false);
      }
      port = p;
      setRx({
        status: "connected", port: path, chip, error: null, hint: null,
        connectedAt: Date.now(), lastLineAt: null, lastHeartbeatAt: null,
      });
      logLine("sys", `Connected to ${path} @ ${CONFIG.serialBaud} baud`);
      console.log(`[receiver] connected ${path}`);

      const parser = p.pipe(new ReadlineParser({ delimiter: "\n" }));
      parser.on("data", (line) => {
        try {
          handleLine(line, "lora");
        } catch (e) {
          console.error("[receiver] line error:", e);
        }
      });
      p.on("error", (e) => logLine("err", e.message));
      p.on("close", () => {
        port = null;
        logLine("sys", `Port ${path} closed`);
        console.log("[receiver] disconnected");
        setRx({ status: paused ? "disconnected" : "searching", port: null, hint: paused ? null : "Receiver unplugged. Waiting for it to come back..." });
      });
      resolve(true);
    });
  });
}

async function scan() {
  if (scanning || port || paused) return;
  scanning = true;
  try {
    let ports = [];
    try {
      ports = await listPorts();
    } catch (e) {
      if (!manualPath) throw e; // in manual mode just try to open the given path
    }
    let target = null;
    if (manualPath) {
      target = ports.find((p) => p.path === manualPath) || { path: manualPath, chip: null };
    } else {
      const cands = ports.filter((p) => p.likelyEsp32);
      if (cands.length === 1) target = cands[0];
      else if (cands.length > 1) {
        setRx({ status: "searching", hint: `${cands.length} ESP32 boards found. Pick the receiver on the System page.` });
      } else {
        setRx({ status: "searching", error: null, hint: ports.length ? "No ESP32 found. Plug in the receiver, or pick a port manually." : "No USB serial ports. Plug in the receiver ESP32." });
      }
    }
    if (target) await open(target.path, target.chip);
  } catch (err) {
    setRx({ status: "error", error: err.message, hint: `Could not list serial ports (${err.message}). Set SERIAL_PORT in .env to the port name.` });
  } finally {
    scanning = false;
  }
}

function start() {
  state.receiver.mode = manualPath ? "manual" : "auto";
  scan();
  setInterval(scan, 3000);
}

async function connect(path) {
  paused = false;
  manualPath = path || null;
  state.receiver.mode = manualPath ? "manual" : "auto";
  if (port) await disconnect(false);
  paused = false;
  await scan();
  return state.receiver;
}

function disconnect(pause = true) {
  paused = pause;
  return new Promise((resolve) => {
    if (!port) {
      if (pause) setRx({ status: "disconnected", hint: null });
      return resolve();
    }
    port.close(() => resolve());
  });
}

module.exports = { start, listPorts, connect, disconnect };
