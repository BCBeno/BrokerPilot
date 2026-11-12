import { normalizeDate, normalizeEmail, normalizePhone, normalizePlate, normalizeVin } from "@/lib/amiabila/documents";

/**
 * Importul portofoliului dintr-un CSV (exportul din sistemul brokerului): un rând = o poliță, cu clientul și vehiculul ei.
 * Pur și determinist: `parsePortfolio` validează rândurile, `planImport` decide ce e nou și ce există deja.
 */

export const PORTFOLIO_COLUMNS = [
  "nume",
  "telefon",
  "email",
  "nr_inmatriculare",
  "marca",
  "model",
  "an",
  "vin",
  "tip_polita",
  "asigurator",
  "nr_polita",
  "valabila_de_la",
  "valabila_pana_la",
  "prima",
] as const;
type Column = (typeof PORTFOLIO_COLUMNS)[number];

export const MAX_ROWS = 2000;

export type PolicyType = "RCA" | "CASCO" | "PAD" | "LOCUINTA" | "VIATA" | "ALTA";

export type PortfolioRow = {
  line: number;
  client: { name: string; phone: string | null; email: string | null };
  vehicle: { plate: string; make: string | null; model: string | null; year: number | null; vin: string | null } | null;
  policy: { type: PolicyType; insurer: string; policyNo: string; validFrom: string; validTo: string; premium: number | null } | null;
};
export type RowError = { line: number; message: string };

// ---------------------------------------------------------------- CSV

/** CSV simplu cu ghilimele (RFC 4180); separatorul e `;` (Excel în română) sau `,`, ales după antet. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const plain = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const TYPE_ALIASES: Record<string, PolicyType> = {
  rca: "RCA",
  casco: "CASCO",
  pad: "PAD",
  locuinta: "LOCUINTA",
  facultativa_locuinta: "LOCUINTA",
  viata: "VIATA",
  alta: "ALTA",
};

/** „1.234,50” / „1234.50” / „1 234” → număr; gol → null; altceva → NaN. */
export function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(/\s|lei|ron/gi, "");
  if (!t) return null;
  const normalized = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

/** Validează fiecare rând; cele cu probleme ies în `errors` (cu numărul liniei din fișier) și nu se importă. */
export function parsePortfolio(text: string): { rows: PortfolioRow[]; errors: RowError[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "Fișierul e gol." }] };
  const header = table[0].map(plain);
  const index = Object.fromEntries(PORTFOLIO_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<Column, number>;
  if (index.nume < 0) {
    return { rows: [], errors: [{ line: 1, message: "Antetul nu are coloana „nume”. Folosiți modelul CSV." }] };
  }
  if (table.length - 1 > MAX_ROWS) {
    return { rows: [], errors: [{ line: 1, message: `Fișierul are peste ${MAX_ROWS} de rânduri. Împărțiți-l în mai multe fișiere.` }] };
  }

  const rows: PortfolioRow[] = [];
  const errors: RowError[] = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (c: Column) => (index[c] >= 0 ? (cells[index[c]] ?? "").trim() : "");
    const problems: string[] = [];

    const name = get("nume").replace(/\s+/g, " ");
    if (!name) problems.push("lipsește numele");
    if (name.length > 120) problems.push("numele e prea lung");
    const phoneRaw = get("telefon");
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (phoneRaw && !phone) problems.push(`telefon nerecunoscut („${phoneRaw}”)`);
    const emailRaw = get("email");
    const email = emailRaw ? normalizeEmail(emailRaw) : null;
    if (emailRaw && !email) problems.push(`e-mail nerecunoscut („${emailRaw}”)`);

    let vehicle: PortfolioRow["vehicle"] = null;
    const plateRaw = get("nr_inmatriculare");
    if (plateRaw) {
      const plate = normalizePlate(plateRaw);
      if (!plate) problems.push(`nr. de înmatriculare nerecunoscut („${plateRaw}”)`);
      const vinRaw = get("vin");
      const vin = vinRaw ? normalizeVin(vinRaw) : null;
      if (vinRaw && !vin) problems.push(`VIN nerecunoscut („${vinRaw}”)`);
      const yearRaw = get("an");
      const year = yearRaw ? Number(yearRaw) : null;
      if (year !== null && !(Number.isInteger(year) && year >= 1950 && year <= 2100)) problems.push(`an nerecunoscut („${yearRaw}”)`);
      if (plate) vehicle = { plate, make: get("marca") || null, model: get("model") || null, year, vin };
    }

    let policy: PortfolioRow["policy"] = null;
    const policyFields = [get("tip_polita"), get("asigurator"), get("nr_polita"), get("valabila_de_la"), get("valabila_pana_la")];
    if (policyFields.some(Boolean)) {
      const type = TYPE_ALIASES[plain(get("tip_polita"))];
      if (!type) problems.push(`tip de poliță necunoscut („${get("tip_polita")}”; RCA, CASCO, PAD, Locuință, Viață, Altă)`);
      const insurer = get("asigurator");
      if (!insurer) problems.push("lipsește asigurătorul");
      const policyNo = get("nr_polita");
      if (!policyNo) problems.push("lipsește numărul poliței");
      const validFrom = normalizeDate(get("valabila_de_la"));
      const validTo = normalizeDate(get("valabila_pana_la"));
      if (!validFrom) problems.push("data de început lipsește sau nu e validă (ZZ.LL.AAAA)");
      if (!validTo) problems.push("data de sfârșit lipsește sau nu e validă (ZZ.LL.AAAA)");
      if (validFrom && validTo && validTo < validFrom) problems.push("polița se termină înainte să înceapă");
      if ((type === "RCA" || type === "CASCO") && !vehicle && !plateRaw) problems.push(`polița ${type} cere numărul de înmatriculare`);
      const premium = parseAmount(get("prima"));
      if (Number.isNaN(premium)) problems.push(`primă nerecunoscută („${get("prima")}”)`);
      if (type && insurer && policyNo && validFrom && validTo) {
        policy = { type, insurer, policyNo, validFrom, validTo, premium: Number.isNaN(premium) ? null : premium };
      }
    }

    if (problems.length) errors.push({ line, message: problems.join("; ") });
    else rows.push({ line, client: { name, phone, email }, vehicle, policy });
  });
  return { rows, errors };
}

// ---------------------------------------------------------------- plan

export type ExistingPortfolio = {
  clients: { id: string; full_name: string; phone: string | null; email: string | null }[];
  vehicles: { id: string; client_id: string; plate: string }[];
  policies: { insurer: string; policy_no: string }[];
};

export type ImportPlan = {
  clients: { id: string; full_name: string; phone: string | null; email: string | null }[];
  vehicles: { id: string; client_id: string; plate: string; make: string | null; model: string | null; year: number | null; vin: string | null }[];
  policies: {
    client_id: string;
    vehicle_id: string | null;
    type: PolicyType;
    insurer: string;
    policy_no: string;
    valid_from: string;
    valid_to: string;
    premium: number | null;
  }[];
  matchedClients: number;
  duplicatePolicies: number;
  errors: RowError[];
};

const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const nameKey = (s: string) => plain(s).replace(/_/g, " ").replace(/\s*\(fictiv\)$/, "");

/**
 * Ce se inserează: clientul se recunoaște după telefon, apoi e-mail, apoi nume identic (în agenție și în fișier);
 * vehiculul după numărul de înmatriculare; polița după asigurător + număr (unică în baza de date).
 * Un număr de înmatriculare care aparține deja altui client e o eroare de rând (nu mutăm vehicule între clienți).
 */
export function planImport(rows: PortfolioRow[], existing: ExistingPortfolio, newId: () => string): ImportPlan {
  const plan: ImportPlan = { clients: [], vehicles: [], policies: [], matchedClients: 0, duplicatePolicies: 0, errors: [] };
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  const remember = (c: { id: string; full_name: string; phone: string | null; email: string | null }) => {
    if (digits(c.phone).length >= 9) byPhone.set(digits(c.phone).slice(-9), c.id);
    if (c.email) byEmail.set(c.email.toLowerCase(), c.id);
    byName.set(nameKey(c.full_name), c.id);
  };
  existing.clients.forEach(remember);
  const vehicleByPlate = new Map(existing.vehicles.map((v) => [key(v.plate), { id: v.id, client_id: v.client_id }]));
  const policyKeys = new Set(existing.policies.map((p) => `${p.insurer.trim().toLowerCase()}|${key(p.policy_no)}`));
  const matched = new Set<string>();
  const existingIds = new Set(existing.clients.map((c) => c.id));

  for (const row of rows) {
    const phoneKey = digits(row.client.phone).slice(-9);
    let clientId =
      (phoneKey.length === 9 ? byPhone.get(phoneKey) : undefined) ??
      (row.client.email ? byEmail.get(row.client.email) : undefined) ??
      byName.get(nameKey(row.client.name));

    let vehicleId: string | null = null;
    if (row.vehicle) {
      const found = vehicleByPlate.get(key(row.vehicle.plate));
      if (found && clientId && found.client_id !== clientId) {
        plan.errors.push({ line: row.line, message: `${row.vehicle.plate} aparține deja altui client din portofoliu` });
        continue;
      }
      if (found && !clientId) clientId = found.client_id;
      vehicleId = found?.id ?? null;
    }

    if (!clientId) {
      const client = { id: newId(), full_name: row.client.name, phone: row.client.phone, email: row.client.email };
      plan.clients.push(client);
      remember(client);
      clientId = client.id;
    } else if (existingIds.has(clientId) && !matched.has(clientId)) {
      matched.add(clientId);
      plan.matchedClients += 1;
    }

    if (row.vehicle && !vehicleId) {
      const vehicle = { id: newId(), client_id: clientId, ...row.vehicle };
      plan.vehicles.push(vehicle);
      vehicleByPlate.set(key(vehicle.plate), { id: vehicle.id, client_id: clientId });
      vehicleId = vehicle.id;
    }

    if (row.policy) {
      const pk = `${row.policy.insurer.trim().toLowerCase()}|${key(row.policy.policyNo)}`;
      if (policyKeys.has(pk)) {
        plan.duplicatePolicies += 1;
        continue;
      }
      policyKeys.add(pk);
      plan.policies.push({
        client_id: clientId,
        vehicle_id: vehicleId,
        type: row.policy.type,
        insurer: row.policy.insurer,
        policy_no: row.policy.policyNo,
        valid_from: row.policy.validFrom,
        valid_to: row.policy.validTo,
        premium: row.policy.premium,
      });
    }
  }
  return plan;
}

/** Modelul CSV oferit la descărcare (date fictive). */
export const SAMPLE_CSV = [
  PORTFOLIO_COLUMNS.join(";"),
  "Ionescu Mihai (fictiv);0700 000 901;mihai.ionescu@example.test;B 901 TST;Dacia;Duster;2019;;RCA;Asigurător Test A;IMP-RCA-0901;20.11.2025;19.11.2026;1.240,00",
  "Ionescu Mihai (fictiv);0700 000 901;mihai.ionescu@example.test;B 901 TST;Dacia;Duster;2019;;CASCO;Asigurător Test B;IMP-CASCO-0901;01.03.2026;28.02.2027;2.950,00",
  "Ionescu Mihai (fictiv);0700 000 901;mihai.ionescu@example.test;;;;;;LOCUINTA;Asigurător Test C;IMP-LOC-0901;05.12.2025;04.12.2026;310",
  "Stan Elena (fictiv);0700 000 902;elena.stan@example.test;CJ 92 TST;Skoda;Octavia;2021;;RCA;Asigurător Test C;IMP-RCA-0902;02.12.2025;01.12.2026;980",
  "Matei Radu (fictiv);0700 000 903;;IS 93 TST;Volkswagen;Golf;2016;;RCA;Asigurător Test D;IMP-RCA-0903;25.10.2025;24.10.2026;1.105,50",
].join("\r\n");
