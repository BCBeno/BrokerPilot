// Importă (creează sau actualizează după nume) un workflow din n8n/workflows/ în instanța n8n și îl publică.
// Rulare: npm run n8n:import -- WF02-vapi-tools.json
// Necesită N8N_API_URL (fără /api/v1) și N8N_API_KEY. În JSON-ul din repo rămân placeholdere:
//  - credentials cu id "REPLACE_ME": se iau din alt workflow deja importat care folosește același tip de credențial;
//  - __SUPABASE_URL__ și __APP_URL__ în Code: se înlocuiesc doar în copia trimisă la n8n (din NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_APP_URL).
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const base = process.env.N8N_API_URL?.replace(/\/+$/, "");
const key = process.env.N8N_API_KEY;
const file = process.argv[2];
if (!base || !key || !file) {
  console.error("Folosire: npm run n8n:import -- <fișier din n8n/workflows>  (cu N8N_API_URL și N8N_API_KEY în .env)");
  process.exit(1);
}
const api = async (path, init = {}) => {
  const res = await fetch(`${base}/api/v1${path}`, { ...init, headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json", ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
};

const src = readFileSync(resolve("n8n/workflows", basename(file)), "utf8");
const subs = { __SUPABASE_URL__: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, ""), __APP_URL__: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") };
let text = src;
for (const [k, v] of Object.entries(subs)) {
  if (text.includes(k)) {
    if (!v) throw new Error(`Lipsește valoarea pentru ${k} în .env`);
    text = text.replaceAll(k, v);
  }
}
const wf = JSON.parse(text);

// credențiale: id-uri reale din workflow-urile existente
const all = (await api("/workflows?limit=100")).data;
const known = new Map();
for (const w of all) for (const n of w.nodes ?? []) for (const [type, c] of Object.entries(n.credentials ?? {})) if (c.id && c.id !== "REPLACE_ME") known.set(type, c);
for (const n of wf.nodes) for (const [type, c] of Object.entries(n.credentials ?? {})) {
  if (c.id === "REPLACE_ME") {
    const real = known.get(type);
    if (!real) throw new Error(`Nu găsesc o credențială „${type}” într-un workflow existent; alege-o o dată în editorul n8n.`);
    n.credentials[type] = real;
  }
}
// errorWorkflow: numele din repo se transformă în id dacă există, altfel se scoate
const err = all.find((w) => w.name === wf.settings?.errorWorkflow || w.name.startsWith(`${wf.settings?.errorWorkflow} `));
if (wf.settings?.errorWorkflow) {
  if (err) wf.settings.errorWorkflow = err.id;
  else { console.warn(`! ${wf.settings.errorWorkflow} nu există încă în n8n: errorWorkflow lăsat nelegat.`); delete wf.settings.errorWorkflow; }
}

const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings ?? {} };
const existing = all.find((w) => w.name === wf.name);
const saved = existing ? await api(`/workflows/${existing.id}`, { method: "PUT", body: JSON.stringify(body) }) : await api("/workflows", { method: "POST", body: JSON.stringify(body) });
await api(`/workflows/${saved.id}/activate`, { method: "POST", body: "{}" });
console.log(`${existing ? "actualizat" : "creat"} și publicat: ${wf.name} (id ${saved.id})`);
