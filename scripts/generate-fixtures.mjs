#!/usr/bin/env node
// S4b: date fictive de demo. Determinist (același seed => aceleași date), fără LLM și fără rețea.
//
//   node scripts/generate-fixtures.mjs            # scrie în data/fixtures/
//   FIXTURES_DATE=2026-11-13 node scripts/generate-fixtures.mjs
//
// Ieșiri: clients.json, vehicles.json, policies.json, claims.json, emails.json, documents.json
//         (adevărul de referință pentru actele SPECIMEN) și seed-demo.sql (de aplicat DUPĂ supabase/seed.sql,
//         pentru că folosește brokerii din el). Totul e inventat: nume cu „(fictiv)”, telefoane 0700 00x xxx,
//         emailuri @example.test, numere cu „TST”, CNP-uri valide ca format dar marcate test.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "fixtures");
const TODAY = process.env.FIXTURES_DATE ? new Date(`${process.env.FIXTURES_DATE}T12:00:00Z`) : new Date();

// ------------------------------------------------------------------ utilitare
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(13);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pad = (n, w) => String(n).padStart(w, "0");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".");
const isoDay = (offsetDays) => {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const uuid = (prefix, n) => `${prefix}-0000-4000-8000-${pad(n, 12)}`;
const BROKERS = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];

// ------------------------------------------------------------------ clienți (30)
const FIRST = ["Andreea", "Bogdan", "Cristina", "Dan", "Eugenia", "Florin", "Gabriela", "Horia", "Irina", "Lucian",
  "Maria", "Nicoleta", "Octavian", "Paula", "Sorin", "Tudor", "Ștefan", "Teodora", "Valentin", "Alexandra",
  "Cătălin", "Diana", "Emil", "Felicia", "George", "Laura", "Marius", "Oana", "Răzvan", "Simona"];
const LAST = ["Barbu", "Constantin", "Dobre", "Enache", "Filip", "Grigore", "Lazăr", "Manea", "Neagu", "Oprea",
  "Pavel", "Șerban", "Tănase", "Ungureanu", "Voicu", "Zamfir", "Albu", "Badea", "Ciobanu", "Dragomir",
  "Epure", "Ferariu", "Gheorghiu", "Ilie", "Jianu", "Luca", "Matei", "Nistor", "Olteanu", "Preda"];
const CITIES = [
  { city: "București", county: "B", lat: 44.4268, lng: 26.1025 },
  { city: "Cluj-Napoca", county: "CJ", lat: 46.7712, lng: 23.6236 },
  { city: "Timișoara", county: "TM", lat: 45.7489, lng: 21.2087 },
  { city: "Iași", county: "IS", lat: 47.1585, lng: 27.6014 },
  { city: "Brașov", county: "BV", lat: 45.6427, lng: 25.5887 },
  { city: "Constanța", county: "CT", lat: 44.1598, lng: 28.6348 },
  { city: "Craiova", county: "DJ", lat: 44.3302, lng: 23.7949 },
  { city: "Sibiu", county: "SB", lat: 45.7983, lng: 24.1256 },
];

const clients = Array.from({ length: 30 }, (_, i) => {
  const first = FIRST[i];
  const last = LAST[(i * 11 + 5) % 30];
  return {
    id: uuid("21000000", i + 1),
    full_name: `${first} ${last} (fictiv)`,
    phone: `070000${pad(200 + i, 4)}`,
    email: `${slug(first)}.${slug(last)}@example.test`,
    consent_gdpr_at_days_ago: i % 6 === 5 ? null : int(1, 300),
    city: CITIES[i % CITIES.length].city,
  };
});
const plainName = (c) => c.full_name.replace(" (fictiv)", "");

// ------------------------------------------------------------------ vehicule (40)
const CARS = [
  ["Dacia", "Logan"], ["Dacia", "Duster"], ["Dacia", "Sandero"], ["Volkswagen", "Golf"], ["Volkswagen", "Passat"],
  ["Skoda", "Octavia"], ["Skoda", "Fabia"], ["Renault", "Clio"], ["Ford", "Focus"], ["Opel", "Astra"],
  ["Toyota", "Corolla"], ["Hyundai", "i30"], ["BMW", "320d"], ["Audi", "A4"], ["Seat", "Leon"],
];
// 30 de clienți; primii 10 au și a doua mașină = 40.
const vehicleOwner = [...Array(30).keys(), ...Array(10).keys()];
const vehicles = vehicleOwner.map((ci, i) => {
  const [make, model] = CARS[(i * 7 + 2) % CARS.length];
  const loc = CITIES[ci % CITIES.length];
  // Regula din aplicație: B + 2–3 cifre, alt județ + exact 2 cifre (vezi `normalizePlate`).
  const plate = loc.county === "B" ? `B ${200 + i} TST` : `${loc.county} ${10 + i} TST`;
  return {
    id: uuid("31000000", i + 1),
    client_id: clients[ci].id,
    plate,
    // fără I, O, Q (VIN valid); prefix „TSTSPEC” = test
    vin: `TSTSPEC${pad(i + 1, 10)}`,
    make,
    model,
    year: int(2008, 2024),
  };
});

// ------------------------------------------------------------------ polițe (60)
const INSURERS = ["Asigurător Test A", "Asigurător Test B", "Asigurător Test C", "Asigurător Test D"];
const EXPIRING_SOON = new Map([[1, 3], [4, 5], [7, 9], [10, 12], [13, 17], [16, 21], [19, 25], [22, 29]]); // vehicul -> zile
const EXPIRED = new Map([[30, -4], [31, -11]]);
const policies = [];
let polN = 0;
const addPolicy = (p) => policies.push({ id: uuid("41000000", ++polN), broker_id: BROKERS[polN % 2], ...p });

vehicles.forEach((v, i) => {
  const to = EXPIRING_SOON.get(i) ?? EXPIRED.get(i) ?? int(40, 330);
  const term = i % 5 === 4 ? 180 : 365;
  addPolicy({
    client_id: v.client_id, vehicle_id: v.id, type: "RCA", insurer: INSURERS[i % 4],
    policy_no: `FX-RCA-${pad(i + 1, 4)}`, valid_from_days: to - term, valid_to_days: to,
    premium: term === 365 ? int(900, 2600) : int(500, 1300),
  });
});
vehicles.filter((_, i) => i % 3 === 0).slice(0, 12).forEach((v, k) => {
  const to = int(30, 300);
  addPolicy({
    client_id: v.client_id, vehicle_id: v.id, type: "CASCO", insurer: INSURERS[(k + 1) % 4],
    policy_no: `FX-CASCO-${pad(k + 1, 4)}`, valid_from_days: to - 365, valid_to_days: to, premium: int(2500, 6000),
  });
});
["PAD", "PAD", "PAD", "PAD", "LOCUINTA", "LOCUINTA", "LOCUINTA", "VIATA"].forEach((type, k) => {
  const to = int(60, 340);
  addPolicy({
    client_id: clients[k].id, vehicle_id: null, type, insurer: INSURERS[(k + 2) % 4],
    policy_no: `FX-${type}-${pad(k + 1, 4)}`, valid_from_days: to - 365, valid_to_days: to,
    premium: type === "PAD" ? 100 : type === "LOCUINTA" ? int(200, 600) : int(600, 1800),
  });
});

// ------------------------------------------------------------------ dosare (8)
const STREETS = ["Str. Exemplu", "Bd. Test", "Str. Fictivă", "Calea Demo", "Str. Specimen", "Str. Inventată"];
const CLAIM_PLAN = [
  { status: "draft", channel: "web", hours: 1, a: 0, b: 1, parties: "A", broker: false },
  { status: "awaiting_b", channel: "web", hours: 2, a: 2, b: 3, parties: "A", broker: false },
  { status: "signed", channel: "web", hours: 6, a: 4, b: 5, parties: "AB", broker: false },
  { status: "submitted", channel: "web", hours: 20, a: 6, b: 7, parties: "AB", broker: false },
  { status: "submitted", channel: "telegram", hours: 30, a: 8, b: 9, parties: "AB", broker: false },
  { status: "in_progress", channel: "web", hours: 72, a: 10, b: 11, parties: "AB", broker: true },
  { status: "in_progress", channel: "voice", hours: 120, a: 12, b: 13, parties: "AB", broker: true },
  { status: "closed", channel: "telegram", hours: 600, a: 14, b: 15, parties: "AB", broker: true },
];
const CIRC = [[1, 12], [2, 6], [3], [5, 13], [4], [9, 14], [7], [8, 15]];
const SUMMARIES = {
  signed: "Tamponare în trafic, ambele părți au semnat. Dosarul așteaptă trimiterea.",
  submitted: "Tamponare ușoară la semafor; ambele părți au semnat, poze cu avarii atașate. Dosar complet.",
  in_progress: "Coliziune la intersecție, fără răniți. Dosarul e preluat de broker; se verifică seria poliței lui B.",
  closed: "Daună soluționată, despăgubire acordată de asigurătorul părții vinovate. Dosar închis.",
};
const MISSING = {
  draft: ["semnătura șoferului A", "datele șoferului B"],
  awaiting_b: ["datele și semnătura șoferului B"],
  signed: [],
  submitted: [],
  in_progress: ["număr poliță vehicul B"],
  closed: [],
};
const vehOf = (clientId) => vehicles.find((v) => v.client_id === clientId);
const rcaOf = (vehId) => policies.find((p) => p.vehicle_id === vehId && p.type === "RCA");

const claims = [];
const parties = [];
CLAIM_PLAN.forEach((c, i) => {
  const loc = CITIES[i % CITIES.length];
  const claimId = uuid("51000000", i + 1);
  const A = clients[c.a];
  const B = clients[c.b];
  claims.push({
    id: claimId,
    public_ref: `BP-DEMO-${pad(10 + i + 1, 5)}`,
    status: c.status,
    channel: c.channel,
    accident_hours_ago: c.hours,
    location_text: `${pick(STREETS)} ${int(1, 80)}, ${loc.city} (fictiv)`,
    lat: loc.lat + (rnd() - 0.5) * 0.02,
    lng: loc.lng + (rnd() - 0.5) * 0.02,
    eligibility: { injuries: false, vehicles: 2, eligible: true },
    circumstances_a: { checked: CIRC[i] },
    circumstances_b: c.parties === "AB" ? { checked: CIRC[(i + 3) % CIRC.length] } : null,
    ai_summary: SUMMARIES[c.status] ?? null,
    missing_items: MISSING[c.status],
    broker_id: c.broker ? BROKERS[i % 2] : null,
    client_a: A.id,
    client_b: c.parties === "AB" ? B.id : null,
  });
  const party = (role, client) => {
    const v = vehOf(client.id);
    const pol = rcaOf(v.id);
    return {
      id: uuid("61000000", parties.length + 1),
      claim_id: claimId,
      role,
      client_id: client.id,
      driver: { name: client.full_name },
      vehicle: { plate: v.plate, make: v.make, model: v.model },
      insurance: { insurer: pol.insurer, policy_no: pol.policy_no },
      extraction_confidence: { plate: 0.97, policy_no: 0.94 },
      join_token: null,
    };
  };
  parties.push(party("A", A));
  if (c.parties === "AB") parties.push(party("B", B));
  else parties.push({
    id: uuid("61000000", parties.length + 1), claim_id: claimId, role: "B", client_id: null,
    driver: null, vehicle: null, insurance: null, extraction_confidence: null,
    join_token: `demo-token-only-for-seed-fx${pad(i + 1, 14)}`,
  });
});

// ------------------------------------------------------------------ CNP-uri de test + acte SPECIMEN
function makeCnp(female, year, month, day, county, seq) {
  const s = year >= 2000 ? (female ? 6 : 5) : female ? 2 : 1;
  const base = `${s}${pad(year % 100, 2)}${pad(month, 2)}${pad(day, 2)}${pad(county, 2)}${pad(seq, 3)}`;
  const w = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
  const sum = [...base].reduce((acc, ch, i) => acc + Number(ch) * w[i], 0);
  const c = sum % 11 === 10 ? 1 : sum % 11;
  return `${base}${c}`;
}
const FEMALE_FIRST = new Set(["Andreea", "Cristina", "Eugenia", "Gabriela", "Irina", "Maria", "Nicoleta", "Paula", "Teodora",
  "Alexandra", "Diana", "Felicia", "Laura", "Oana", "Simona"]);
const documents = Array.from({ length: 8 }, (_, i) => {
  const c = clients[i];
  const v = vehicles[i];
  const pol = policies.find((p) => p.vehicle_id === v.id && p.type === "RCA");
  const [first, ...rest] = plainName(c).split(" ");
  const birthYear = int(1965, 2002);
  const birthMonth = int(1, 12);
  const birthDay = int(1, 28);
  return {
    client_id: c.id,
    test_data: true,
    holder: { first, last: rest.join(" "), cnp: makeCnp(FEMALE_FIRST.has(first), birthYear, birthMonth, birthDay, int(1, 46), int(1, 999)), birthDate: `${birthYear}-${pad(birthMonth, 2)}-${pad(birthDay, 2)}` },
    registration: { plate: v.plate, vin: v.vin, make: v.make, model: v.model, year: String(v.year) },
    policy: {
      insurer: pol.insurer, policyNo: pol.policy_no, validFrom: isoDay(pol.valid_from_days),
      validTo: isoDay(pol.valid_to_days), plate: v.plate,
    },
    license: {
      fullName: `${rest.join(" ")} ${first}`, licenseNo: `TST${pad(1000000 + i * 137, 7)}`, categories: "B",
      expiresOn: isoDay(int(200, 2500)),
    },
  };
});

// ------------------------------------------------------------------ emailuri (50)
const EMAIL_PLAN = [
  ["daună", 10], ["ofertă", 8], ["reînnoire", 8], ["reclamație", 5], ["documente", 7], ["administrativ", 5], ["spam-newsletter", 7],
];
const T = {
  "daună": [
    ["Accident azi-dimineață, ce fac?", "Bună ziua, am avut un accident în {city} acum o oră, mașina {plate} e lovită în spate. Nu sunt răniți. Avem poliță {policy} la {insurer}. Cum procedez cu amiabila? Mulțumesc, {name}", "P2"],
    ["URGENT: accident cu răniți", "Am fost implicat într-un accident, o persoană e rănită, am sunat la 112. Vă rog să mă sunați urgent la {phone}. {name}", "P1"],
    ["Stadiul dosarului de daună", "Bună ziua, vă scriu pentru dosarul de daună deschis acum două săptămâni pentru {plate}. A trecut timp și nu am primit nicio veste de la asigurător. Puteți verifica? Poliță {policy}.", "P3"],
    ["Poze avarii, vehicul {plate}", "Vă trimit fotografiile cu avariile. Mașina nu mai poate fi condusă și trebuie tractată. Ce pași urmează? Mă găsiți la {phone}.", "P2"],
    ["Geam spart în parcare", "Mi s-a spart geamul lateral în parcare, mașina {plate}. Am CASCO, poliță {policy}. Ce documente vă trebuie? {name}", "P3"],
  ],
  "ofertă": [
    ["Ofertă RCA pentru {plate}", "Aș dori o ofertă RCA pentru {plate}, proprietar {name}. Am clasa de bonus-malus B0. Vă rog să comparați mai mulți asigurători.", "P3"],
    ["Cerere ofertă CASCO", "Bună ziua, mi-am cumpărat o mașină nouă și caut CASCO cu franșiză mică. Mă puteți suna la {phone}? {name}", "P3"],
    ["Asigurare locuință", "Vreau să asigur apartamentul de 55 mp din {city}. Ce variante aveți (PAD plus asigurare facultativă)?", "P4"],
    ["Ofertă RCA pentru două mașini", "Avem două mașini în familie și vrem să le asigurăm la același broker. Puteți face o ofertă combinată? {name}", "P3"],
  ],
  "reînnoire": [
    ["Reînnoire RCA {plate}", "Polița {policy} expiră pe {date}. Vreau să o reînnoiesc cu aceleași date. Care e prețul? {name}", "P2"],
    ["Mi-a expirat polița RCA", "Polița mea a expirat acum câteva zile și nu știu dacă pot circula. Ce fac, urgent? Mașina {plate}. Telefon {phone}.", "P2"],
    ["Reînnoire poliță luna viitoare", "Am primit un mesaj că polița expiră luna viitoare. Puteți să-mi trimiteți o ofertă de reînnoire? {name}", "P3"],
    ["Schimb asigurătorul la reînnoire", "Prețul de anul trecut a fost prea mare. Dacă găsiți ceva mai bun la reînnoirea din {date}, aș schimba asigurătorul. {name}", "P3"],
  ],
  "reclamație": [
    ["Reclamație: întârziere la despăgubire", "Sunt nemulțumit că despăgubirea pentru {plate} întârzie de două luni. Cer o explicație scrisă. {name}", "P2"],
    ["Nemulțumit de preț", "Prima mea a crescut cu 40% fără nicio explicație. Dacă nu se rezolvă, plec la alt broker. {name}", "P2"],
    ["Sumă greșită pe factură", "Pe factură apare o primă diferită față de oferta primită pe email. Vă rog să corectați. Poliță {policy}.", "P2"],
    ["Nu răspunde nimeni la telefon", "Am sunat de trei ori la agenție și nu a răspuns nimeni. Aș vrea să fiu sunat înapoi la {phone}.", "P3"],
    ["Sesizare: informație greșită", "Mi s-a spus că polița acoperă și geamurile, dar la daună mi s-a refuzat. Cer clarificări. {name}", "P2"],
  ],
  "documente": [
    ["Documente pentru poliță", "Atașat talonul și permisul. CNP {cnp}, telefon {phone}. Vă rog confirmați primirea. {name}", "P3"],
    ["Carte de identitate actualizată", "Mi-am schimbat actul de identitate, CNP {cnp}. Vă rog actualizați datele de pe poliță {policy}.", "P4"],
    ["Lipsește talonul din dosar", "Ați cerut talonul pentru dosarul de daună. Îl atașez, mașina {plate}. {name}", "P3"],
    ["Procură pentru ridicarea despăgubirii", "Trimit procura notarială pentru soția mea, care ridică despăgubirea în numele meu. {name}, {phone}", "P3"],
  ],
  "administrativ": [
    ["Schimbare date de contact", "Noul meu număr de telefon este {phone}. Adresa de email rămâne aceeași. {name}", "P4"],
    ["Cerere factură", "Vă rog să-mi trimiteți factura pentru polița {policy}, am nevoie de ea la firmă.", "P4"],
    ["Program de sărbători", "Care e programul agenției în perioada sărbătorilor? Vreau să trec pe la voi cu documentele.", "P4"],
    ["Reziliere poliță", "Am vândut mașina {plate}. Cum procedez cu rezilierea poliței {policy} și cu restituirea primei?", "P3"],
    ["Adeverință de client", "Am nevoie de o adeverință că sunt clientul vostru, pentru bancă. {name}", "P4"],
  ],
  "spam-newsletter": [
    ["Câștigă un voucher de 500 lei!", "Felicitări! Ai fost selectat pentru un voucher. Apasă pe link și completează datele cardului ca să-l primești.", "P4"],
    ["Newsletter noiembrie: noutăți în asigurări", "Ce s-a schimbat în piața asigurărilor luna aceasta. Dezabonare: răspunde cu STOP.", "P4"],
    ["Credit rapid, fără acte", "Împrumut în 10 minute, doar cu buletinul. Aprobare 100%. Oferta expiră azi!", "P4"],
    ["Reduceri la anvelope de iarnă", "Ultimele zile: -30% la anvelope de iarnă. Montaj gratuit în {city}.", "P4"],
  ],
};
const fill = (tpl, ctx) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? `{${k}}`);
const PII_SLOTS = { cnp: "cnp", phone: "phone", plate: "plate", name: "name", policy: "policy_no" };

const emails = [];
EMAIL_PLAN.forEach(([category, count]) => {
  for (let k = 0; k < count; k++) {
    const idx = emails.length;
    const [subjectT, bodyT, priority] = T[category][k % T[category].length];
    const spam = category === "spam-newsletter";
    const c = clients[(idx * 3 + 1) % clients.length];
    const v = vehicles.find((x) => x.client_id === c.id);
    const pol = policies.find((p) => p.client_id === c.id && p.type === "RCA");
    const ctx = {
      name: plainName(c), city: c.city, phone: c.phone, plate: v.plate, policy: pol.policy_no, insurer: pol.insurer,
      date: isoDay(pol.valid_to_days), cnp: makeCnp(false, int(1970, 1999), int(1, 12), int(1, 28), int(1, 46), int(1, 999)),
    };
    const text = subjectT + " " + bodyT;
    emails.push({
      id: `fx-${pad(idx + 1, 4)}`,
      from_name: spam ? "Promoții (fictiv)" : plainName(c),
      from_email: spam ? `office@promo-${(k % 3) + 1}.example.test` : c.email,
      client_id: spam ? null : c.id,
      subject: fill(subjectT, ctx),
      body: fill(bodyT, ctx),
      received_hours_ago: int(1, 240),
      expected: { category, priority },
      pii_present: Object.entries(PII_SLOTS).filter(([slot]) => text.includes(`{${slot}}`)).map(([, label]) => label),
    });
  }
});

// ------------------------------------------------------------------ scriere
mkdirSync(OUT, { recursive: true });
const writeJson = (name, data) => writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + "\n", "utf8");
writeJson("clients.json", clients.map(({ city, ...c }) => c));
writeJson("vehicles.json", vehicles);
writeJson("policies.json", policies);
writeJson("claims.json", { claims, parties });
writeJson("emails.json", emails);
writeJson("documents.json", documents);

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => (v === null || v === undefined ? "null" : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`);
const ago = (hours) => `now() - interval '${hours} hours'`;
const sql = [];
sql.push(`-- GENERAT de scripts/generate-fixtures.mjs (S4b). Nu edita de mână: rulează din nou scriptul.
-- Date DOAR fictive. Se aplică DUPĂ supabase/seed.sql (folosește brokerii de acolo). Idempotent.
-- Datele relative (polițe, dosare) sunt față de ziua aplicării, deci rămân proaspete la fiecare rulare.
`);
sql.push("insert into public.clients (id, full_name, phone, email, consent_gdpr_at) values");
sql.push(clients.map((c) => `  (${q(c.id)}, ${q(c.full_name)}, ${q(c.phone)}, ${q(c.email)}, ${c.consent_gdpr_at_days_ago === null ? "null" : `now() - interval '${c.consent_gdpr_at_days_ago} days'`})`).join(",\n") + "\non conflict (id) do nothing;\n");
sql.push("insert into public.vehicles (id, client_id, plate, vin, make, model, year) values");
sql.push(vehicles.map((v) => `  (${q(v.id)}, ${q(v.client_id)}, ${q(v.plate)}, ${q(v.vin)}, ${q(v.make)}, ${q(v.model)}, ${v.year})`).join(",\n") + "\non conflict (id) do nothing;\n");
sql.push("insert into public.policies (id, client_id, vehicle_id, type, insurer, policy_no, valid_from, valid_to, premium, broker_id) values");
sql.push(policies.map((p) => `  (${q(p.id)}, ${q(p.client_id)}, ${q(p.vehicle_id)}, ${q(p.type)}, ${q(p.insurer)}, ${q(p.policy_no)}, current_date + ${p.valid_from_days}, current_date + ${p.valid_to_days}, ${p.premium}, ${q(p.broker_id)})`).join(",\n") + "\non conflict (id) do nothing;\n");
sql.push("insert into public.claims (id, public_ref, status, channel, accident_at, location_text, lat, lng, eligibility, circumstances_a, circumstances_b, ai_summary, missing_items, broker_id) values");
sql.push(claims.map((c) => `  (${q(c.id)}, ${q(c.public_ref)}, ${q(c.status)}, ${q(c.channel)}, ${ago(c.accident_hours_ago)}, ${q(c.location_text)}, ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}, ${j(c.eligibility)}, ${j(c.circumstances_a)}, ${j(c.circumstances_b)}, ${q(c.ai_summary)}, ${j(c.missing_items)}, ${q(c.broker_id)})`).join(",\n") + "\non conflict (id) do nothing;\n");
sql.push("insert into public.claim_parties (id, claim_id, role, client_id, driver, vehicle, insurance, extraction_confidence, join_token, token_expires_at) values");
sql.push(parties.map((p) => `  (${q(p.id)}, ${q(p.claim_id)}, ${q(p.role)}, ${q(p.client_id)}, ${j(p.driver)}, ${j(p.vehicle)}, ${j(p.insurance)}, ${j(p.extraction_confidence)}, ${q(p.join_token)}, ${p.join_token ? "now() + interval '1 day'" : "null"})`).join(",\n") + "\non conflict (id) do nothing;\n");
writeFileSync(join(OUT, "seed-demo.sql"), sql.join("\n"), "utf8");

const expiring = policies.filter((p) => p.type === "RCA" && p.valid_to_days >= 0 && p.valid_to_days <= 30).length;
console.log(`Fixtures în ${OUT}\n  clienți ${clients.length}, vehicule ${vehicles.length}, polițe ${policies.length} (RCA care expiră în 30 de zile: ${expiring}),`
  + ` dosare ${claims.length}, emailuri ${emails.length}, acte-etalon ${documents.length}`);
