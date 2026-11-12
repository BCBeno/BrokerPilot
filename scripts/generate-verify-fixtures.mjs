#!/usr/bin/env node
// S11: polițe RCA SPECIMEN ca PDF cu text (nu scan), pentru verificatorul de documente: una corectă și trei cu greșeli.
// Datele vin din `data/fixtures/documents.json` (clientul 1; rulează întâi `npm run data:fixtures`). Toate sunt fictive.
// Ieșire: data/fixtures/verify/<n>-<nume>.pdf și expected.json (ce trebuie să prindă verificatorul pe fiecare).
//
//   node scripts/generate-verify-fixtures.mjs     # CHROME_PATH sau Chrome/Edge/Chromium din locurile uzuale
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "fixtures", "verify");
const docs = JSON.parse(readFileSync(join(ROOT, "data", "fixtures", "documents.json"), "utf8"));
const base = docs[0];

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

const CLAUSE_OK =
  "Asiguratul are obligația de a anunța asigurătorul în termen de 48 de ore de la producerea evenimentului. Despăgubirea se plătește în limita sumelor asigurate prevăzute de lege.";

/** O poliță = o listă de rânduri „Etichetă: valoare” (formatul pe care îl citește `parsePolicyText`) și clauzele. */
function policy(o) {
  const rows = [
    ["Asigurător", o.insurer ?? base.policy.insurer],
    ["Seria și numărul", o.policyNo ?? base.policy.policyNo],
    ["Data emiterii", o.issuedOn ?? "28.09.2026"],
    ["Asigurat", o.holder ?? `${base.holder.first} ${base.holder.last}`],
    ["CNP", o.cnp ?? base.holder.cnp],
    ["Data nașterii", o.birth ?? ro(base.holder.birthDate)],
    ["Telefon", "0722 123 456"],
    ["Număr de înmatriculare", o.plate ?? base.registration.plate],
    ["Serie șasiu", o.vin ?? base.registration.vin],
    ["Perioada de asigurare", o.period ?? `${ro(base.policy.validFrom)} – ${ro(base.policy.validTo)}`],
    ["Prima totală", o.premium ?? "1.250,00 RON"],
    ["Număr rate", o.installments ?? "4"],
    ["Valoare rată", o.installment ?? "312,50 RON"],
    ["IBAN asigurător", o.iban ?? "RO49 AAAA 1B31 0075 9384 0000"],
  ];
  const lines = rows.map(([k, v]) => `<div class="r"><span>${esc(k)}:</span> ${esc(v)}</div>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:40px 56px;font-size:14px;line-height:1.55}
h1{font-size:22px;margin:0 0 2px} .sp{color:#a00;font-weight:700;font-size:12px;margin-bottom:22px}
.r span{display:inline-block;min-width:210px;color:#444} h2{font-size:15px;margin:22px 0 4px}
</style><h1>Poliță de asigurare ${esc(o.kind ?? "RCA")}</h1><div class="sp">SPECIMEN – DATE FICTIVE, FĂRĂ VALOARE JURIDICĂ</div>
${lines}<h2>Condiții</h2><p>${esc(o.clause ?? CLAUSE_OK)}</p></body>`;
}

const CASES = [
  {
    file: "01-corecta.pdf",
    title: "Poliță corectă (fără probleme)",
    opts: {},
    expect: { deterministic: [], note: "Nu trebuie să apară nicio problemă sigură." },
  },
  {
    file: "02-expirare-2037.pdf",
    title: "Data de expirare în 2037 în loc de 2027",
    opts: { period: `${ro(base.policy.validFrom)} – ${ro(base.policy.validTo).replace(/2027$/, "2037")}` },
    expect: { deterministic: ["dates-too-long"], note: "Roșu: expirarea e la 11 ani după început; propune 29.09.2027." },
  },
  {
    file: "03-nume-typo-casco-rate.pdf",
    title: "Nume cu typo, clauză cu typo și CASCO într-o poliță RCA, rate care nu se adună",
    opts: {
      holder: "Andrea Grigore",
      installment: "300,00 RON",
      clause:
        "Asiguratul are obligația de a anunța asigurătorul în termen de 48 de ore de la producera evenimentuluii. Polița acoperă și daunele proprii prin CASCO, fără franșiză, conform condițiilor RCA.",
    },
    expect: {
      deterministic: ["name-typo (cu clientul de referință)", "installments-sum"],
      ai: ["typo în clauză („producera”, „evenimentuluii”)", "CASCO într-o poliță RCA"],
    },
  },
  {
    file: "04-identificatori-gresiti.pdf",
    title: "CNP cu cifră greșită, plăcuță fără format, IBAN stricat",
    opts: { cnp: "2971001185822", plate: "ABC 123", iban: "RO48 AAAA 1B31 0075 9384 0000" },
    expect: { deterministic: ["cnp-control", "plate-format", "iban-invalid"] },
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
try {
  for (const c of CASES) {
    const page = await browser.newPage();
    await page.setContent(policy(c.opts), { waitUntil: "load" });
    await page.pdf({ path: join(OUT, c.file), format: "A4", printBackground: true });
    await page.close();
    console.log("scris", c.file);
  }
} finally {
  await browser.close();
}
writeFileSync(
  join(OUT, "expected.json"),
  JSON.stringify(
    {
      reference: { name: `${base.holder.first} ${base.holder.last}`, plate: base.registration.plate, vin: base.registration.vin },
      cases: CASES.map(({ file, title, expect }) => ({ file, title, ...expect })),
    },
    null,
    2,
  ) + "\n",
);
