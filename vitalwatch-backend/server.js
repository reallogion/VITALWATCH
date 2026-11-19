// ─────────────────────────────────────────────────────────────
//  VitalWatch base-camp server
//  Band --LoRa--> Receiver ESP32 --USB--> this server --> dashboard
// ─────────────────────────────────────────────────────────────
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { CONFIG } = require("./config/constants");
const receiver = require("./services/receiver");
require("./services/llm/analyzer"); // starts the AI scheduler

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", require("./routes/api"));

// If the dashboard has been built (npm run build), serve it from here too
const dist = path.join(__dirname, "..", "vitalwatch-dashboard", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  app.get("/", (req, res) => res.send("VitalWatch backend running. Open the dashboard (npm run dev) at http://localhost:5173"));
}

app.listen(CONFIG.port, () => {
  console.log("────────────────────────────────────────────");
  console.log(` VITALWATCH backend  http://localhost:${CONFIG.port}`);
  console.log(` Receiver port: ${CONFIG.serialPort} @ ${CONFIG.serialBaud} baud`);
  console.log(` AI providers:  ${CONFIG.llm.providers.join(" -> ")}`);
  console.log("────────────────────────────────────────────");
  receiver.start();
});
