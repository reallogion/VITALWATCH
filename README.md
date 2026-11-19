# VitalWatch v2

Bicep-worn soldier health band. Data goes band → LoRa → receiver ESP32 → USB → this laptop → dashboard.

```
vitalwatch/
├── vitalwatch-backend/     Node server: USB receiver, alerts, AI, live stream
├── vitalwatch-dashboard/   React dashboard (military minimalist UI)
└── firmware/
    ├── PROTOCOL.md         exact packet format (band + receiver)
    ├── receiver/           flash to the base-camp ESP32
    └── band_packet_test/   radio test for the band before sensors are wired
```

## First run

**1. Backend**
```
cd vitalwatch-backend
copy .env.example .env      (Windows)   or   cp .env.example .env
npm install
npm start
```
Put your keys into `.env`. Your **old .env still works**: keep the Firebase lines, and add the new lines from `.env.example` (AI keys, `SERIAL_PORT=auto`, `SERIAL_BAUD=115200`, and the rest).

**2. Dashboard** (second terminal)
```
cd vitalwatch-dashboard
npm install
npm run dev
```
Open http://localhost:5173

**3. Hardware.** Plug in the receiver by USB, then switch on the band. Any order works. The dashboard shows each step.

**Without hardware:** go to *Link and settings*, then *Test mode*, and pick a scenario.

## One-command mode (optional)

```
cd vitalwatch-dashboard && npm run build
cd ../vitalwatch-backend && npm start
```
Then open http://localhost:5000. The backend serves the built dashboard itself.

## Useful commands (in vitalwatch-backend)

| Command | What it does |
|---|---|
| `npm run ports` | lists USB ports and marks the ESP32 |
| `npm run test:llm` | checks your AI keys and models |
| `npm run test:crypto` | encrypt → decrypt round trip |

## AI keys (free)

- Groq: https://console.groq.com/keys (model `openai/gpt-oss-120b`)
- Gemini: https://aistudio.google.com/apikey (model `gemini-2.5-flash`)
- OpenRouter (backup): https://openrouter.ai/keys

The old model `llama-3.3-70b-versatile` was shut down by Groq on 16 Aug 2026. That is why the AI stopped working.
If a model is retired again, change only `GROQ_MODEL` / `GEMINI_MODEL` in `.env`.
If no provider answers (no internet), the offline rule engine still gives an assessment.

## Troubleshooting

| Dashboard says | Fix |
|---|---|
| Server not running | `npm start` in vitalwatch-backend |
| Receiver: searching | Plug in the receiver with a **data** cable. Install the CP210x or CH340 driver. |
| Port is busy | Close the Arduino IDE Serial Monitor |
| No data on port | Flash `firmware/receiver/receiver.ino`. Baud must be 115200. |
| Band: waiting | Band powered? Antennas fitted? Same frequency, sync word and AES key? |
| Values tagged SIM | That sensor failed or is missing; an estimate is shown. Turn this off in Settings for real use. |
