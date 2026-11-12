#!/usr/bin/env node
// Creează (sau actualizează) contul de autentificare pentru brokerul demo și îl leagă de `brokers.auth_user_id`.
// Folosește cheia secretă Supabase din `.env` (doar local). Idempotent: rulat din nou, resetează parola la valoarea din `.env`.
//   npm run broker:create                 # brokerul 10000000-…-0001 (Andrei Popescu, fictiv)
//   npm run broker:create -- --broker <uuid>
// Dacă `.env` nu are BROKER_DEMO_EMAIL / BROKER_DEMO_PASSWORD, le generează și le adaugă în `.env` (ignorat de git).
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = join(ROOT, ".env");
if (existsSync(ENV)) process.loadEnvFile(ENV);

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) {
  console.error("Lipsesc NEXT_PUBLIC_SUPABASE_URL sau SUPABASE_SERVICE_ROLE_KEY în .env.");
  process.exit(1);
}

const argIdx = process.argv.indexOf("--broker");
const brokerId = argIdx > -1 ? process.argv[argIdx + 1] : "10000000-0000-4000-8000-000000000001";

let email = process.env.BROKER_DEMO_EMAIL;
let password = process.env.BROKER_DEMO_PASSWORD;
const added = [];
if (!email) {
  email = "broker.demo@brokerpilot.test";
  added.push(`BROKER_DEMO_EMAIL=${email}`);
}
if (!password) {
  password = randomBytes(12).toString("base64url");
  added.push(`BROKER_DEMO_PASSWORD=${password}`);
}
if (added.length) appendFileSync(ENV, `\n# Cont demo pentru dashboardul brokerului (scripts/create-broker-user.mjs)\n${added.join("\n")}\n`);

const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
const call = async (path, init = {}) => {
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
};

const broker = await call(`/rest/v1/brokers?id=eq.${brokerId}&select=id,name,auth_user_id`);
if (!broker.ok || !broker.body?.length) {
  console.error(`Brokerul ${brokerId} nu există (${broker.status}). Aplică întâi supabase/seed.sql.`);
  process.exit(1);
}

let userId = broker.body[0].auth_user_id;
const created = await call("/auth/v1/admin/users", {
  method: "POST",
  body: JSON.stringify({ email, password, email_confirm: true }),
});
if (created.ok) {
  userId = created.body.id;
} else if (created.status === 422 || created.body?.error_code === "email_exists") {
  // Contul există: îl găsim după e-mail și îi resetăm parola.
  const list = await call("/auth/v1/admin/users?per_page=1000");
  const existing = list.body?.users?.find((u) => u.email === email);
  if (!existing) {
    console.error("Contul există, dar nu l-am găsit în listă.", list.status);
    process.exit(1);
  }
  userId = existing.id;
  const upd = await call(`/auth/v1/admin/users/${userId}`, { method: "PUT", body: JSON.stringify({ password, email_confirm: true }) });
  if (!upd.ok) {
    console.error("Nu am putut actualiza parola.", upd.status, upd.body?.msg ?? "");
    process.exit(1);
  }
} else {
  console.error("Nu am putut crea contul.", created.status, created.body?.msg ?? created.body?.message ?? "");
  process.exit(1);
}

const link = await call(`/rest/v1/brokers?id=eq.${brokerId}`, {
  method: "PATCH",
  headers: { prefer: "return=minimal" },
  body: JSON.stringify({ auth_user_id: userId }),
});
if (!link.ok) {
  console.error("Nu am putut lega contul de broker.", link.status, link.body?.message ?? "");
  process.exit(1);
}

console.log(`Gata: ${broker.body[0].name} → ${email}. Parola e în .env (BROKER_DEMO_PASSWORD).`);
if (added.length) console.log("Am adăugat în .env: " + added.map((l) => l.split("=")[0]).join(", "));
