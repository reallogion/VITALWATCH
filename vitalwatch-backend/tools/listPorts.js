// npm run ports  -> lists USB serial ports and marks the likely ESP32
require("dotenv").config();
const { listPorts } = require("../services/receiver");

listPorts()
  .then((ports) => {
    if (!ports.length) return console.log("No serial ports found. Plug in the receiver ESP32 (data cable!).");
    for (const p of ports) console.log(`${p.likelyEsp32 ? "ESP32 ->" : "        "} ${p.path}  ${p.chip || p.manufacturer || ""}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
