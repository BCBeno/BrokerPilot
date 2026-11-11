// Validează fișierele n8n/workflows/*.json: JSON valid + forma minimă a unui export n8n.
// Folosit în CI și local (`npm run validate:n8n`). Un folder gol e valid.
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = fileURLToPath(new URL("../n8n/workflows/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
let errors = 0;

for (const file of files) {
  try {
    const wf = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const problems = [];
    if (typeof wf.name !== "string" || !wf.name) problems.push("lipsește `name`");
    if (!Array.isArray(wf.nodes) || wf.nodes.length === 0) problems.push("`nodes` lipsește sau e gol");
    if (typeof wf.connections !== "object" || wf.connections === null) problems.push("lipsește `connections`");
    if (JSON.stringify(wf).match(/(sk-or-|gsk_|AIza[0-9A-Za-z_-]{20,}|\d{8,10}:AA[0-9A-Za-z_-]{30,})/)) {
      problems.push("pare să conțină o cheie API hardcodată");
    }
    if (problems.length) {
      errors++;
      console.error(`✗ ${file}: ${problems.join("; ")}`);
    } else {
      console.log(`✓ ${file}`);
    }
  } catch (e) {
    errors++;
    console.error(`✗ ${file}: JSON invalid (${e.message})`);
  }
}

console.log(`${files.length} workflow-uri verificate, ${errors} erori.`);
process.exit(errors ? 1 : 0);
