// ─────────────────────────────────────────────────────────────
//  Offline assessment, used when no AI provider is reachable
//  (no internet at base camp, keys expired, rate limit).
//  Same output shape as the AI, built from the alert rules.
// ─────────────────────────────────────────────────────────────
const ACTIONS = {
  man_down: ["Send nearest buddy to soldier now", "Check airway, breathing and bleeding", "Prepare CASEVAC"],
  fall: ["Call soldier on radio, confirm status", "Send buddy check if no response"],
  hr_high: ["Halt and rest 10 min", "Check for injury or bleeding if at rest"],
  hr_low: ["Check responsiveness immediately", "Buddy check now"],
  spo2_low: ["Halt ascent and rest", "Give oxygen if available", "Descend 300-500 m if not improving"],
  spo2_falling: ["Halt ascent, recheck in 2 min"],
  temp_high: ["Move to shade, remove load", "Cool with water, hydrate 500 ml"],
  temp_low: ["Insulate, add dry layers", "Warm fluids, keep moving if able"],
  psi: ["Reduce pace or rest 10 min", "Hydrate 500 ml"],
  hr_rising: ["Check soldier for pain, bleeding or shock"],
  link_lost: ["Try radio contact", "Check last known position on map"],
};

const RISK_BY_SEV = { critical: "CRITICAL", warning: "MODERATE", info: "LOW" };

function assess({ reading: r, derived: d, activeAlerts }) {
  const relevant = activeAlerts.filter((a) => a.category !== "device" && a.category !== "environment");
  const crit = relevant.filter((a) => a.severity === "critical");
  const warn = relevant.filter((a) => a.severity === "warning");
  let risk = crit.length ? "CRITICAL" : warn.length >= 2 ? "HIGH" : warn.length ? "MODERATE" : "LOW";
  if (risk === "CRITICAL" && !crit.some((a) => ["man_down", "fall", "link_lost"].includes(a.key)) && crit.length === 1) risk = "HIGH";

  const top = crit[0] || warn[0];
  const actions = [];
  for (const a of [...crit, ...warn]) for (const x of ACTIONS[a.key] || []) if (!actions.includes(x)) actions.push(x);

  const est = r.simulated.filter((x) => ["heartRate", "spo2", "bodyTemp"].includes(x));
  return {
    risk,
    headline: top ? top.title : "Soldier stable",
    assessment: top
      ? `${[...crit, ...warn].map((a) => a.message.replace(/\.$/, "")).join(". ")}.`
      : `Vitals within limits for ${d.altitude ?? "?"} m altitude and current activity. Strain index ${d.psi ?? "n/a"}/10.`,
    concerns: [...crit, ...warn].slice(0, 3).map((a) => a.title),
    actions: actions.slice(0, 3).length ? actions.slice(0, 3) : ["Continue mission, routine monitoring"],
    watch: est.length ? `${est.map((x) => ({ heartRate: "heart rate", spo2: "SpO2", bodyTemp: "body temp" })[x]).join(", ")} are estimates. Replace the failed sensor` : "HR and SpO2 trend over next 10 min",
    confidence: est.length ? 0.5 : 0.7,
    nextCheckMin: risk === "LOW" ? 10 : 2,
  };
}

module.exports = { assess };
