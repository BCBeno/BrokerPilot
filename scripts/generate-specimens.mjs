#!/usr/bin/env node
// S4b: acte SPECIMEN (talon, permis, poliță RCA) ca imagini PNG, pentru demo și evals.
// Se bazează pe `data/fixtures/documents.json` (rulează întâi `node scripts/generate-fixtures.mjs`).
// Fiecare imagine e marcată vizibil „SPECIMEN – DATE FICTIVE”, nu imită un act real și nu are poză sau ștampile.
// Ieșire: data/fixtures/specimens/<n>-<tip>.png (+ variante rotit/slab pentru primul client) și specimens.json.
//
//   node scripts/generate-specimens.mjs            # CHROME_PATH sau Chrome/Edge/Chromium din locurile uzuale
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "data", "fixtures");
const OUT = join(FIXTURES, "specimens");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const chrome = [process.env.CHROME_PATH, ...CHROME_CANDIDATES].find((p) => p && existsSync(p));
if (!chrome) {
  console.error("Nu am găsit Chrome/Edge/Chromium. Setează CHROME_PATH.");
  process.exit(1);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const ro = (iso) => iso.split("-").reverse().join(".");

const CSS = `
*{box-sizing:border-box} body{margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111}
.card{position:relative;width:1000px;height:640px;overflow:hidden;padding:28px 36px;border:3px solid #555;
  background:linear-gradient(135deg,#f4f1e6,#e8eef3)}
.card h1{margin:0;font-size:22px;letter-spacing:.06em}
.card .sub{font-size:13px;color:#a00;font-weight:700;margin:4px 0 18px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 28px}
.f{border-bottom:1px solid #889;padding-bottom:4px}
.f small{display:block;font-size:11px;color:#556;text-transform:uppercase}
.f b{font-size:22px;font-family:"Courier New",monospace}
.full{grid-column:1/3}
.wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:150px;font-weight:900;
  color:rgba(200,0,0,.13);transform:rotate(-24deg);letter-spacing:.1em;pointer-events:none}
.foot{position:absolute;left:36px;right:36px;bottom:16px;font-size:11px;color:#a00}
`;

function page(title, fields, foot) {
  const cells = fields
    .map(([label, value, full]) => `<div class="f${full ? " full" : ""}"><small>${esc(label)}</small><b>${esc(value)}</b></div>`)
    .join("");
  return `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
<div class="card"><h1>${esc(title)}</h1><div class="sub">SPECIMEN – DATE FICTIVE, FĂRĂ VALOARE JURIDICĂ</div>
<div class="grid">${cells}</div><div class="wm">SPECIMEN</div><div class="foot">${esc(foot)}</div></div>`;
}

const html = {
  registration: (d) =>
    page("CERTIFICAT DE ÎNMATRICULARE", [
      ["A. Număr de înmatriculare", d.registration.plate],
      ["B. Data primei înmatriculări / an fabricație", d.registration.year],
      ["E. Serie șasiu (VIN)", d.registration.vin, true],
      ["D.1 Marca", d.registration.make],
      ["D.3 Descriere comercială (model)", d.registration.model],
      ["C.1.1 Titular", `${d.holder.last} ${d.holder.first}`.toUpperCase(), true],
    ], "Mock-up generat pentru demo BrokerPilot. Nu este un document oficial."),
  license: (d) =>
    page("PERMIS DE CONDUCERE", [
      ["1. Nume", d.holder.last.toUpperCase()],
      ["2. Prenume", d.holder.first.toUpperCase()],
      ["3. Data nașterii", ro(d.holder.birthDate)],
      ["4b. Valabil până la", ro(d.license.expiresOn)],
      ["4d. CNP (de test)", d.holder.cnp],
      ["5. Număr permis", d.license.licenseNo],
      ["9. Categorii", d.license.categories, true],
    ], "Mock-up generat pentru demo BrokerPilot. CNP fictiv, valid doar ca format."),
  policy: (d) =>
    page("POLIȚĂ DE ASIGURARE RCA", [
      ["Asigurător", d.policy.insurer, true],
      ["Serie și număr poliță", d.policy.policyNo, true],
      ["Valabilă de la", ro(d.policy.validFrom)],
      ["Valabilă până la", ro(d.policy.validTo)],
      ["Număr de înmatriculare", d.policy.plate],
      ["Asigurat", `${d.holder.last} ${d.holder.first}`.toUpperCase()],
    ], "Mock-up generat pentru demo BrokerPilot. Asigurător fictiv."),
};

// variante degradate (robustețea extragerii): poză strâmbă și poză slabă/neclară
const VARIANTS = [
  { suffix: "", css: "" },
  { suffix: "-rotit", css: ".card{transform:rotate(4deg) scale(.92);transform-origin:center}" },
  { suffix: "-slab", css: "body{filter:blur(1.3px) brightness(.9) contrast(.85)}" },
];

mkdirSync(OUT, { recursive: true });
const docs = JSON.parse(readFileSync(join(FIXTURES, "documents.json"), "utf8"));
// profil nou, ca să nu se cupleze la un Edge/Chrome deja deschis (ar ieși imediat cu „Code: 0”)
const profile = mkdtempSync(join(tmpdir(), "bp-specimens-"));
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  userDataDir: profile,
  args: ["--no-sandbox", "--disable-gpu"],
});
const manifest = [];
try {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1000, height: 640, deviceScaleFactor: 1.5 });
  for (const [i, d] of docs.entries()) {
    for (const type of ["registration", "license", "policy"]) {
      // variantele degradate doar pentru primul client, ca să nu umplem repo-ul
      for (const v of i === 0 ? VARIANTS : VARIANTS.slice(0, 1)) {
        if (type === "license" && v.suffix) continue;
        const name = `${pad2(i + 1)}-${type}${v.suffix}.png`;
        await tab.setContent(html[type](d).replace("</style>", `${v.css}</style>`), { waitUntil: "load" });
        await tab.screenshot({ path: join(OUT, name), type: "png" });
        manifest.push({ file: name, type, variant: v.suffix.slice(1) || "clar", client_id: d.client_id, expected: d[type] });
      }
    }
  }
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
writeFileSync(join(OUT, "specimens.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`${manifest.length} imagini în ${OUT} (browser: ${chrome})`);
