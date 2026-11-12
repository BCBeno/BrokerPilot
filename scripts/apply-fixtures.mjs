#!/usr/bin/env node
// S4b: încarcă `data/fixtures/*.json` în Supabase prin REST (cheia secretă din `.env`), fără psql și fără conexiune directă
// la baza de date. Echivalent cu `data/fixtures/seed-demo.sql` (datele relative sunt față de azi). Idempotent:
// rândurile cu același `id` sunt sărite. Presupune că `supabase/seed.sql` e deja aplicat (brokerii).
//
//   node scripts/apply-fixtures.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(join(ROOT, ".env"));
} catch {
  /* variabilele pot veni din mediu */
}
const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) {
  console.error("Lipsesc NEXT_PUBLIC_SUPABASE_URL sau SUPABASE_SERVICE_ROLE_KEY în .env.");
  process.exit(1);
}

const read = (name) => JSON.parse(readFileSync(join(ROOT, "data", "fixtures", name), "utf8"));
const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

const headers = { apikey: key, "content-type": "application/json", prefer: "resolution=ignore-duplicates,return=minimal" };

async function insert(table, rows) {
  for (let i = 0; i < rows.length; i += 50) {
    const res = await fetch(`${base}/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      headers,
      body: JSON.stringify(rows.slice(i, i + 50)),
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  console.log(`✓ ${table}: ${rows.length} rânduri trimise (cele existente sunt sărite)`);
}

const clients = read("clients.json").map(({ consent_gdpr_at_days_ago, ...c }) => ({
  ...c,
  consent_gdpr_at: consent_gdpr_at_days_ago === null ? null : ago(consent_gdpr_at_days_ago * D),
}));
const policies = read("policies.json").map(({ valid_from_days, valid_to_days, ...p }) => ({
  ...p,
  valid_from: day(valid_from_days),
  valid_to: day(valid_to_days),
}));
const { claims: rawClaims, parties: rawParties } = read("claims.json");
const claims = rawClaims.map(({ accident_hours_ago, client_a, client_b, lat, lng, ...c }) => ({
  ...c,
  lat: Number(lat.toFixed(5)),
  lng: Number(lng.toFixed(5)),
  accident_at: ago(accident_hours_ago * H),
}));
const parties = rawParties.map((p) => ({ ...p, token_expires_at: p.join_token ? ago(-D) : null }));

await insert("clients", clients);
await insert("vehicles", read("vehicles.json"));
await insert("policies", policies);
await insert("claims", claims);
await insert("claim_parties", parties);

// verificare: numărăm rândurile din fiecare tabel
for (const table of ["clients", "vehicles", "policies", "claims", "claim_parties"]) {
  const res = await fetch(`${base}/rest/v1/${table}?select=id`, { method: "HEAD", headers: { apikey: key, prefer: "count=exact" } });
  console.log(`  ${table}: ${res.headers.get("content-range")?.split("/")[1] ?? "?"} în total`);
}
