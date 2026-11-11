// Exportă workflow-urile din instanța n8n în n8n/workflows/*.json (sursa de adevăr e repo-ul).
// Necesită N8N_API_URL (fără /api/v1) și N8N_API_KEY în `.env`.   Rulare: npm run n8n:export
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = process.env.N8N_API_URL?.replace(/\/+$/, "");
const key = process.env.N8N_API_KEY;
if (!base || !key) {
  console.error("Setează N8N_API_URL și N8N_API_KEY în .env (vezi docs/SETUP.md).");
  process.exit(1);
}

const outDir = fileURLToPath(new URL("../n8n/workflows/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

let cursor;
let count = 0;
do {
  const url = new URL(`${base}/api/v1/workflows`);
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url, { headers: { "X-N8N-API-KEY": key } });
  if (!res.ok) {
    console.error(`n8n a răspuns ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const page = await res.json();
  for (const wf of page.data) {
    // doar câmpurile stabile (fără timestamp-uri/versiuni, ca diff-urile git să fie mici)
    const clean = {
      id: wf.id,
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings ?? {},
      active: wf.active ?? false,
    };
    writeFileSync(join(outDir, `${slug(wf.name)}.json`), JSON.stringify(clean, null, 2) + "\n");
    count++;
  }
  cursor = page.nextCursor;
} while (cursor);

console.log(`${count} workflow-uri exportate în n8n/workflows/.`);
