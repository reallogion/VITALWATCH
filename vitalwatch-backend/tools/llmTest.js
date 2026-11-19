// npm run test:llm -> checks each AI provider key in .env
require("dotenv").config();
const providers = require("../services/llm/providers");

(async () => {
  try {
    const out = await providers.complete(
      [
        { role: "system", content: 'Reply with JSON only: {"ok":true}' },
        { role: "user", content: "ping" },
      ],
      300
    );
    console.log(`OK: ${out.providerLabel} (${out.model}) answered in ${out.ms} ms`);
  } catch (e) {
    console.log("FAILED:", e.message);
  }
  for (const p of providers.refresh())
    console.log(`  ${p.label.padEnd(11)} key:${p.configured ? "yes" : "no "}  model:${p.model}  ${p.ok === true ? "OK" : p.lastError || ""}`);
  // no process.exit(): on Windows it can crash while network handles are closing
})();
