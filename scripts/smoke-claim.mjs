#!/usr/bin/env node
// Test de fum pentru fluxul amiabilei, prin API-ul aplicației (serverul de dev trebuie să ruleze):
// A creează dosarul, B trimite datele, ambii semnează, A finalizează => PDF + WF01 + Telegram.
// Folosește acte din `data/fixtures/documents.json` (fictive). La final verifică execuția n8n și rezumatul din dosar,
// apoi șterge dosarul de test (`--keep` îl păstrează).
//
//   node scripts/smoke-claim.mjs [--keep] [--base http://localhost:3000]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(join(ROOT, ".env"));
const keep = process.argv.includes("--keep");
const baseArg = process.argv.indexOf("--base");
const APP = baseArg >= 0 ? process.argv[baseArg + 1] : "http://localhost:3000";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const N8N_API = process.env.N8N_API_URL?.replace(/\/$/, "") + "/api/v1";
const N8N_KEY = process.env.N8N_API_KEY;
const WF01 = "3zdwBqSztAx77ywC";

const docs = JSON.parse(readFileSync(join(ROOT, "data", "fixtures", "documents.json"), "utf8"));
const asDoc = (obj) => ({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { value: v, confidence: 1 }])) });
const clients = JSON.parse(readFileSync(join(ROOT, "data", "fixtures", "clients.json"), "utf8"));
// Permisul include acum și datele de contact (adresă, telefon obligatoriu, e-mail opțional).
const licenseOf = (d) => {
  const c = clients.find((x) => x.id === d.client_id);
  const p = c.phone;
  return {
    ...d.license,
    birthDate: d.holder.birthDate,
    address: "Strada Test 1, București (fictiv)",
    phone: `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}`,
    email: c.email,
  };
};
const documentsOf = (d) => ({ registration: asDoc(d.registration), license: asDoc(licenseOf(d)), policy: asDoc(d.policy) });

/** PNG de semnătură (400×160, linie sinusoidală neagră pe transparent), fără dependențe. */
function signaturePng() {
  const w = 400, h = 160;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let x = 20; x < w - 20; x++) {
    const y = Math.round(80 + 35 * Math.sin(x / 18) * Math.cos(x / 70));
    for (let dy = -1; dy <= 1; dy++) {
      const o = (y + dy) * (w * 4 + 1) + 1 + x * 4;
      raw[o + 3] = 255; // alfa; RGB rămân 0 (negru)
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

let step = 0;
async function call(label, method, path, { token, body } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { "x-claim-token": token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* nu e JSON */ }
  console.log(`${++step}. ${label}: HTTP ${res.status}${res.ok ? "" : ` ${text.slice(0, 300)}`}`);
  if (!res.ok) throw new Error(`${label} a eșuat`);
  return json;
}

async function cleanup(id) {
  const h = { apikey: SB_KEY, "content-type": "application/json" };
  await fetch(`${SB}/storage/v1/object/claim-files`, {
    method: "DELETE", headers: h,
    body: JSON.stringify({ prefixes: ["signature-A.png", "signature-B.png", "constatare.pdf", "sketch.json"].map((f) => `claims/${id}/${f}`) }),
  });
  // `events` nu are cheie străină spre dosar: rândurile „client_linked” se șterg separat.
  await fetch(`${SB}/rest/v1/events?entity_type=eq.claim&entity_id=eq.${id}`, { method: "DELETE", headers: h });
  const del = await fetch(`${SB}/rest/v1/claims?id=eq.${id}`, { method: "DELETE", headers: h });
  console.log(`Dosar de test șters (HTTP ${del.status}).`);
}

let claimId = null;
try {
  const A = docs[0], B = docs[1];
  const created = await call("A creează dosarul", "POST", "/api/claims", {
    body: {
      documents: documentsOf(A),
      eligibility: { twoVehicles: true, onlyMaterialDamage: true, bothInsured: true, agreed: true },
      place: { address: "Strada Test 1, București (test de fum)", lat: 44.4268, lng: 26.1025, occurredAt: new Date().toISOString() },
    },
  });
  claimId = created.id;
  console.log(`   ref ${created.ref}`);
  const circA = { checked: [1, 12], impact: "front", damage: "Bară față ușor deformată (test)", notes: "Test de fum automat." };
  await call("A trimite circumstanțele", "PATCH", `/api/claims/${claimId}`, { token: created.aToken, body: { circumstances: circA } });
  await call("B deschide linkul", "GET", `/api/claims/join/${created.joinToken}`);
  await call("B trimite datele", "POST", `/api/claims/join/${created.joinToken}`, {
    body: { documents: documentsOf(B), circumstances: { checked: [3], impact: "rear", damage: "Bară spate (test)", notes: "" } },
  });
  const sig = signaturePng();
  await call("A semnează", "PUT", "/api/party/signature", { token: created.aToken, body: { signature: sig } });
  await call("B semnează", "PUT", "/api/party/signature", { token: created.joinToken, body: { signature: sig } });
  const fin = await call("A finalizează (PDF + n8n)", "POST", `/api/claims/${claimId}/finalize`, { token: created.aToken });
  console.log(`   webhook: ${fin.webhook}, PDF: ${fin.pdfUrl ? "generat" : "lipsește"}`);
  // Legarea daună → client (S6b): A și B din fixtures sunt clienți ai agenției, deci ambii trebuie recunoscuți.
  const parties = await (await fetch(`${SB}/rest/v1/claim_parties?select=role,client_id&claim_id=eq.${claimId}&order=role`, { headers: { apikey: SB_KEY } })).json();
  for (const p of parties) {
    const want = (p.role === "A" ? A : B).client_id;
    console.log(`   ${p.client_id === want ? "✓" : "✗"} ${p.role} legat de client: ${p.client_id ?? "nu"}`);
  }

  await new Promise((r) => setTimeout(r, 15_000)); // n8n: Telegram + rezumat
  const ex = await (await fetch(`${N8N_API}/executions?workflowId=${WF01}&limit=1`, { headers: { "X-N8N-API-KEY": N8N_KEY } })).json();
  const last = ex.data?.[0];
  console.log(`n8n: execuția ${last?.id} ${last?.status} (${last?.startedAt})`);
  if (last) {
    const e = await (await fetch(`${N8N_API}/executions/${last.id}?includeData=true`, { headers: { "X-N8N-API-KEY": N8N_KEY } })).json();
    for (const [n, r] of Object.entries(e.data?.resultData?.runData ?? {})) console.log(`   - ${n}: ${r[0].executionStatus}${r[0].error ? ` (${r[0].error.message})` : ""}`);
  }
  const row = (await (await fetch(`${SB}/rest/v1/claims?select=status,ai_summary&id=eq.${claimId}`, { headers: { apikey: SB_KEY } })).json())[0];
  console.log(`Dosar: status ${row.status}, rezumat salvat: ${row.ai_summary ? "da" : "nu"}`);
} catch (e) {
  console.error(`EȘEC: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (claimId && !keep) await cleanup(claimId);
  else if (claimId) console.log(`Dosarul ${claimId} a rămas (--keep).`);
}
