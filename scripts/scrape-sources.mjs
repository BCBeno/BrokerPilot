#!/usr/bin/env node
// S4b: descarcă sursele publice din data/sources.json în data/raw/ (ignorat de git) și scrie data/raw/manifest.json
// (URL, data descărcării, licența, hash, mărime), pe care îl va citi ingestia RAG (S9) pentru `kb_documents`.
// Fără chei și fără LLM. Politicos: robots.txt, pauză între cereri, plafon de mărime, fără a rescrie ce există deja.
//
//   node scripts/scrape-sources.mjs                 # descarcă ce lipsește
//   node scripts/scrape-sources.mjs --force         # redescarcă tot
//   node scripts/scrape-sources.mjs --only norma-20-2017-legislatie,baar-intrebari
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "data", "raw");
const UA = "BrokerPilot-demo-scraper/1.0 (educational prototype; public documents only)";
const MAX_BYTES = 40 * 1024 * 1024;
const PAUSE_MS = 1500;

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyArg = args.indexOf("--only");
const only = onlyArg >= 0 ? new Set(args[onlyArg + 1]?.split(",")) : null;

const catalog = JSON.parse(readFileSync(join(ROOT, "data", "sources.json"), "utf8"));
const manifestPath = join(RAW, "manifest.json");
mkdirSync(RAW, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const robots = new Map(); // origin -> listă de prefixe interzise pentru „*”

async function allowed(url) {
  const u = new URL(url);
  if (!robots.has(u.origin)) {
    const rules = [];
    try {
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        let star = false;
        for (const line of (await res.text()).split(/\r?\n/)) {
          const [k, ...v] = line.split("#")[0].split(":");
          const key = k.trim().toLowerCase();
          const val = v.join(":").trim();
          if (key === "user-agent") star = val === "*";
          else if (star && key === "disallow" && val) rules.push(val);
        }
      }
    } catch {
      /* fără robots.txt = permis */
    }
    robots.set(u.origin, rules);
  }
  return !robots.get(u.origin).some((p) => (u.pathname + u.search).startsWith(p));
}

function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

let ok = 0, skipped = 0, failed = 0;
for (const [i, s] of catalog.sources.entries()) {
  if (only && !only.has(s.id)) continue;
  const ext = s.format === "pdf" ? "pdf" : "html";
  const file = join(RAW, `${s.id}.${ext}`);
  if (!force && existsSync(file) && manifest[s.id]?.status === "ok") {
    console.log(`= ${s.id} (există)`);
    skipped++;
    continue;
  }
  const base = {
    id: s.id, title: s.title, publisher: s.publisher, insurer: s.insurer ?? null, doc_type: s.doc_type,
    source_url: s.url, mirror: Boolean(s.mirror), license_note: s.license_note ?? catalog.license_default,
  };
  try {
    if (!(await allowed(s.url))) throw new Error("interzis de robots.txt");
    const res = await fetch(s.url, { headers: { "user-agent": UA, accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error(`prea mare (${buf.length} octeți)`);
    if (buf.length < 500) throw new Error(`răspuns prea mic (${buf.length} octeți)`);
    if (ext === "pdf" && buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("nu e PDF (alt conținut decât cel așteptat)");
    writeFileSync(file, buf);
    if (ext === "html") writeFileSync(join(RAW, `${s.id}.txt`), htmlToText(buf.toString("utf8")), "utf8");
    manifest[s.id] = {
      ...base, status: "ok", file: `${s.id}.${ext}`, final_url: res.url, content_type: res.headers.get("content-type"),
      bytes: buf.length, file_hash: createHash("sha256").update(buf).digest("hex"), fetched_at: new Date().toISOString(),
    };
    console.log(`✓ ${s.id} (${(buf.length / 1024).toFixed(0)} KB)`);
    ok++;
  } catch (e) {
    manifest[s.id] = { ...base, status: "error", error: String(e.message ?? e), attempted_at: new Date().toISOString() };
    console.log(`✗ ${s.id}: ${e.message ?? e}`);
    failed++;
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8"); // salvează după fiecare, ca să nu pierdem progresul
  if (i < catalog.sources.length - 1) await sleep(PAUSE_MS);
}
console.log(`\nGata: ${ok} descărcate, ${skipped} existente, ${failed} eșuate. Manifest: ${manifestPath}`);
if (failed) process.exitCode = 1;
