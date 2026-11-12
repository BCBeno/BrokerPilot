import { normalizeDate, normalizeEmail, normalizePhone, normalizePlate, normalizeVin } from "../amiabila/documents";
import { isValidIban, parseCnp, plateCountyExists } from "./ids";

/**
 * Verificări deterministe (fără AI) pe câmpurile unui document de asigurare. Rulează local, pe valorile reale.
 * Rezultatul e o listă de probleme marcate „determinist” (sigure), care în raport apar înaintea sugestiilor AI.
 */

export type Severity = "critical" | "warning" | "info";

export type Issue = {
  id: string;
  /** `determinist` = sigur; `ai` = sugestie. */
  source: "determinist" | "ai";
  severity: Severity;
  /** Câmpul sau zona din document (pentru highlight). */
  field?: string;
  explanation: string;
  suggestedFix?: string;
  /** Fragmentul exact din text de evidențiat (completat de pipeline, din valoarea câmpului sau din `location` AI). */
  quote?: string;
};

export type PolicyType = "RCA" | "CASCO" | "PAD" | "LOCUINTA" | "VIATA" | "ALTA";

/** Câmpurile extrase dintr-un document (toate ca text, așa cum apar; lipsa înseamnă „nu s-a găsit”). */
export type DocFields = {
  type?: PolicyType;
  policyNo?: string;
  insurer?: string;
  holderName?: string;
  holderCnp?: string;
  holderBirthDate?: string;
  plate?: string;
  vin?: string;
  validFrom?: string;
  validTo?: string;
  issuedOn?: string;
  /** Prima totală și, dacă se plătește în rate, numărul și valoarea ratei. */
  premiumTotal?: string;
  installments?: string;
  installmentAmount?: string;
  premiumCurrency?: string;
  installmentCurrency?: string;
  iban?: string;
  phone?: string;
  email?: string;
};

/** Ce știm despre client din baza de date, pentru verificarea încrucișată. */
export type Reference = { name?: string; plate?: string; vin?: string };

export type CheckContext = { now: Date; reference?: Reference };

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const daysBetween = (fromIso: string, toIso: string) => Math.round((toUtc(toIso).getTime() - toUtc(fromIso).getTime()) / DAY_MS);
const roDate = (iso: string) => iso.split("-").reverse().join(".");

const mk = (id: string, severity: Severity, explanation: string, field?: string, suggestedFix?: string): Issue => ({
  id,
  source: "determinist",
  severity,
  field,
  explanation,
  suggestedFix,
});

/** Aceeași zi și lună, cu anul schimbat. Dacă data nu există (29 februarie), alunecă la 28. */
function withYear(iso: string, year: number): string {
  const [, m, d] = iso.split("-");
  const probe = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
  const day = probe.getUTCMonth() === Number(m) - 1 ? d : "28";
  return `${String(year).padStart(4, "0")}-${m}-${day}`;
}

/** Suma din text: „1.250,00”, „1250.50”, „1 250,5” → număr; `null` dacă nu e sumă. */
export function parseAmount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.replace(/[^\d.,-]/g, "");
  if (s === "" || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Ultimul separator e cel zecimal.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot > -1 && !/\.\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const normCurrency = (c: string | undefined) => {
  const t = c?.trim().toUpperCase().replace(/\./g, "");
  if (!t) return undefined;
  if (t === "LEI" || t === "RON" || t === "RON.") return "RON";
  return t;
};

/** Distanța Levenshtein, pentru typo-uri de tip „Popecu” vs „Popescu”. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] ?? 0;
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
}

const foldName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[ăâ]/g, "a")
    .replace(/î/g, "i")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t")
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .sort()
    .join(" ");

export type NameMatch = "same" | "typo" | "different";

/** Compară două nume fără diacritice, fără să conteze ordinea („Popescu Ion” = „Ion Popescu”). */
export function compareNames(a: string, b: string): NameMatch {
  const fa = foldName(a);
  const fb = foldName(b);
  if (fa === fb) return "same";
  const distance = editDistance(fa, fb);
  return distance <= Math.max(2, Math.floor(Math.max(fa.length, fb.length) * 0.12)) ? "typo" : "different";
}

const sameCompact = (a: string, b: string) => a.replace(/[\s-]/g, "").toUpperCase() === b.replace(/[\s-]/g, "").toUpperCase();

function maxDays(type: PolicyType | undefined): number {
  if (type === "VIATA") return 366 * 10;
  return 367; // RCA, CASCO, PAD, locuință: cel mult 12 luni
}

export function checkDates(f: DocFields, ctx: CheckContext): Issue[] {
  const issues: Issue[] = [];
  const parse = (key: "validFrom" | "validTo" | "issuedOn" | "holderBirthDate", label: string) => {
    const raw = f[key];
    if (raw === undefined || raw.trim() === "") return null;
    const iso = normalizeDate(raw);
    if (!iso) issues.push(mk(`date-format:${key}`, "critical", `${label} „${raw}” nu e o dată validă.`, key, "Format ZZ.LL.AAAA, cu o zi care există în calendar."));
    return iso;
  };
  const from = parse("validFrom", "Data de început");
  const to = parse("validTo", "Data de expirare");
  const issued = parse("issuedOn", "Data emiterii");
  const born = parse("holderBirthDate", "Data nașterii");
  const nowIso = ctx.now.toISOString().slice(0, 10);

  if (from && to) {
    const days = daysBetween(from, to);
    if (days <= 0) {
      issues.push(
        mk("dates-order", "critical", `Data de expirare (${roDate(to)}) nu e după data de început (${roDate(from)}).`, "validTo", "Verifică ambele date; expirarea trebuie să fie după început."),
      );
    } else if (days > maxDays(f.type)) {
      const guess = withYear(from, Number(from.slice(0, 4)) + 1);
      const years = Math.round(days / 365);
      issues.push(
        mk(
          "dates-too-long",
          "critical",
          `Data de expirare (${roDate(to)}) e la ${years} ${years === 1 ? "an" : "ani"} după început (${roDate(from)}); ${f.type === "RCA" ? "o poliță RCA are 1–12 luni" : "durata nu e plauzibilă"}.`,
          "validTo",
          `Probabil ${roDate(guess)}.`,
        ),
      );
    } else if (days < 28 && f.type === "RCA") {
      issues.push(mk("dates-too-short", "warning", `Polița RCA durează doar ${days} de zile (minimul uzual e 1 lună).`, "validTo"));
    }
  }

  if (from) {
    const lead = daysBetween(nowIso, from);
    if (lead > 92) {
      issues.push(mk("start-far-future", "warning", `Polița începe peste ${Math.round(lead / 30)} luni (${roDate(from)}); verifică anul.`, "validFrom"));
    }
  }
  if (issued && from && daysBetween(issued, from) < 0) {
    issues.push(mk("issued-after-start", "warning", `Data emiterii (${roDate(issued)}) e după data de început (${roDate(from)}).`, "issuedOn", "O poliță se emite cel târziu în ziua începerii."));
  }
  if (issued && daysBetween(nowIso, issued) > 0) {
    issues.push(mk("issued-future", "warning", `Data emiterii (${roDate(issued)}) e în viitor.`, "issuedOn"));
  }

  if (born) {
    const ref = from ?? nowIso;
    const age = (toUtc(ref).getTime() - toUtc(born).getTime()) / (365.25 * DAY_MS);
    if (age < 18 || age > 100) {
      issues.push(mk("birth-implausible", "critical", `Data nașterii (${roDate(born)}) dă o vârstă de ${Math.floor(age)} de ani, imposibilă pentru un titular sau șofer.`, "holderBirthDate"));
    }
  }
  return issues;
}

export function checkIdentifiers(f: DocFields, ctx: CheckContext): Issue[] {
  const issues: Issue[] = [];

  if (f.holderCnp?.trim()) {
    const info = parseCnp(f.holderCnp, ctx.now);
    if (!info) {
      issues.push(mk("cnp-format", "critical", "CNP-ul nu are structura corectă (13 cifre, sex, dată de naștere și județ valide).", "holderCnp"));
    } else if (!info.controlOk) {
      issues.push(mk("cnp-control", "critical", "CNP-ul are cifra de control greșită; probabil o cifră scrisă greșit.", "holderCnp"));
    } else if (f.holderBirthDate) {
      const born = normalizeDate(f.holderBirthDate);
      if (born && born !== info.birthDate) {
        issues.push(
          mk("cnp-birth-mismatch", "critical", `Data nașterii (${roDate(born)}) nu corespunde CNP-ului (${roDate(info.birthDate)}).`, "holderBirthDate", `Din CNP rezultă ${roDate(info.birthDate)}.`),
        );
      }
    }
  }

  if (f.vin?.trim() && !normalizeVin(f.vin)) {
    issues.push(mk("vin-format", "critical", "Seria de șasiu (VIN) trebuie să aibă 17 caractere, fără literele I, O, Q.", "vin"));
  }

  if (f.plate?.trim()) {
    const plate = normalizePlate(f.plate);
    if (!plate) issues.push(mk("plate-format", "critical", `Numărul de înmatriculare „${f.plate}” nu are format românesc (județ, 2–3 cifre, 3 litere).`, "plate"));
    else if (!plateCountyExists(plate)) issues.push(mk("plate-county", "warning", `„${plate.split(" ")[0]}” nu e un cod de județ existent.`, "plate"));
  }

  if (f.iban?.trim() && !isValidIban(f.iban)) {
    issues.push(mk("iban-invalid", "critical", "IBAN-ul nu trece verificarea (lungime sau cifră de control greșită).", "iban"));
  }
  if (f.phone?.trim() && !normalizePhone(f.phone)) issues.push(mk("phone-format", "warning", `Telefonul „${f.phone}” nu are format valid.`, "phone"));
  if (f.email?.trim() && !normalizeEmail(f.email)) issues.push(mk("email-format", "warning", `Emailul „${f.email}” nu are format valid.`, "email"));
  return issues;
}

export function checkAmounts(f: DocFields): Issue[] {
  const issues: Issue[] = [];
  const total = parseAmount(f.premiumTotal);
  const count = f.installments ? Number(f.installments.replace(/\D/g, "")) : null;
  const each = parseAmount(f.installmentAmount);

  if (f.premiumTotal !== undefined && f.premiumTotal.trim() !== "") {
    if (total === null) issues.push(mk("premium-format", "critical", `Prima „${f.premiumTotal}” nu e o sumă validă.`, "premiumTotal"));
    else if (total <= 0) issues.push(mk("premium-zero", "critical", "Prima de asigurare e 0 sau negativă.", "premiumTotal"));
  }
  if (total !== null && count && count > 0 && each !== null) {
    const expected = Math.round(count * each * 100) / 100;
    if (Math.abs(expected - total) > 0.05 * count) {
      issues.push(
        mk(
          "installments-sum",
          "critical",
          `Suma nu se potrivește: ${count} rate × ${each.toFixed(2)} = ${expected.toFixed(2)}, dar prima totală e ${total.toFixed(2)}.`,
          "premiumTotal",
          "Verifică numărul de rate, valoarea ratei sau prima totală.",
        ),
      );
    }
  }
  const c1 = normCurrency(f.premiumCurrency);
  const c2 = normCurrency(f.installmentCurrency);
  if (c1 && c2 && c1 !== c2) issues.push(mk("currency-mismatch", "critical", `Moneda diferă între prima totală (${c1}) și rate (${c2}).`, "premiumCurrency"));
  return issues;
}

/** Compară documentul cu ce știm din baza de date a clientului (nume, plăcuță, VIN). */
export function checkAgainstReference(f: DocFields, ref: Reference | undefined): Issue[] {
  if (!ref) return [];
  const issues: Issue[] = [];
  if (f.holderName && ref.name) {
    const match = compareNames(f.holderName, ref.name);
    if (match === "typo") {
      issues.push(
        mk("name-typo", "warning", `Numele din document („${f.holderName}”) diferă ușor de cel din dosarul clientului („${ref.name}”); probabil o greșeală de scriere.`, "holderName", `Corect: ${ref.name}.`),
      );
    } else if (match === "different") {
      issues.push(mk("name-different", "critical", `Titularul din document („${f.holderName}”) nu e clientul din dosar („${ref.name}”).`, "holderName"));
    }
  }
  if (f.plate && ref.plate && !sameCompact(f.plate, ref.plate)) {
    issues.push(mk("plate-mismatch", "critical", `Numărul de înmatriculare din document („${f.plate}”) diferă de cel al clientului („${ref.plate}”).`, "plate", `Corect: ${ref.plate}.`));
  }
  if (f.vin && ref.vin && !sameCompact(f.vin, ref.vin)) {
    issues.push(mk("vin-mismatch", "critical", `VIN-ul din document diferă de cel din dosar („${ref.vin}”).`, "vin", `Corect: ${ref.vin}.`));
  }
  return issues;
}

/** Rulează toate verificările deterministe pe un document. */
export function runDeterministicChecks(f: DocFields, ctx: CheckContext): Issue[] {
  return [...checkDates(f, ctx), ...checkIdentifiers(f, ctx), ...checkAmounts(f), ...checkAgainstReference(f, ctx.reference)];
}

/** Același nr. de înmatriculare, VIN și titular pe documente diferite (talon, poliță, constatare). */
export function crossCheckDocuments(docs: Array<{ label: string; fields: DocFields }>): Issue[] {
  const issues: Issue[] = [];
  const first = docs[0];
  if (!first) return issues;
  for (const other of docs.slice(1)) {
    const a = first.fields;
    const b = other.fields;
    const where = `${first.label} ↔ ${other.label}`;
    if (a.plate && b.plate && !sameCompact(a.plate, b.plate)) {
      issues.push(mk(`cross-plate:${other.label}`, "critical", `Numărul de înmatriculare diferă (${where}): „${a.plate}” vs „${b.plate}”.`, "plate"));
    }
    if (a.vin && b.vin && !sameCompact(a.vin, b.vin)) {
      issues.push(mk(`cross-vin:${other.label}`, "critical", `VIN-ul diferă (${where}): „${a.vin}” vs „${b.vin}”.`, "vin"));
    }
    if (a.holderName && b.holderName) {
      const match = compareNames(a.holderName, b.holderName);
      if (match === "typo") issues.push(mk(`cross-name:${other.label}`, "warning", `Numele titularului diferă ușor (${where}): „${a.holderName}” vs „${b.holderName}”.`, "holderName"));
      else if (match === "different") issues.push(mk(`cross-name:${other.label}`, "critical", `Titularul diferă (${where}): „${a.holderName}” vs „${b.holderName}”.`, "holderName"));
    }
  }
  return issues;
}
