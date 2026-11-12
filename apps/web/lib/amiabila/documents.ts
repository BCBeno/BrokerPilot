import { z } from "zod";

/**
 * Actele scanate de șofer și datele extrase din ele (S3).
 * Un câmp extras are mereu `value` (sau `null` dacă nu e lizibil) și `confidence` între 0 și 1.
 * Validatorii nu resping extragerea: un câmp care nu trece validarea rămâne vizibil, dar cu încredere mică,
 * ca omul să-l verifice pe ecranul de verificare.
 */

export const DOC_TYPES = ["registration", "license", "policy"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type FieldKind = "text" | "plate" | "vin" | "date" | "year" | "phone" | "email";
/** `optional`: câmpul poate rămâne gol fără să blocheze „Continuă”; dacă e completat, trebuie să fie valid. */
export type FieldDef = { key: string; label: string; kind: FieldKind; placeholder?: string; optional?: boolean };

/**
 * `scannable: false` = actul nu se fotografiază și nu pleacă niciodată la AI; datele se scriu de mână.
 * Permisul are pe față poza, data nașterii și CNP-ul, iar noi avem nevoie doar de 4 câmpuri (minimizarea datelor, ADR-0001).
 */
export const DOC_META: Record<DocType, { label: string; hint: string; scannable: boolean; fields: FieldDef[] }> = {
  registration: {
    label: "Talonul mașinii",
    hint: "Certificatul de înmatriculare, pagina cu datele mașinii.",
    scannable: true,
    fields: [
      { key: "plate", label: "Număr de înmatriculare", kind: "plate", placeholder: "ex. B 123 ABC" },
      { key: "vin", label: "Serie șasiu (VIN)", kind: "vin" },
      { key: "make", label: "Marca", kind: "text" },
      { key: "model", label: "Modelul", kind: "text" },
      { key: "year", label: "An fabricație", kind: "year", placeholder: "ex. 2018" },
    ],
  },
  license: {
    label: "Permisul și datele de contact",
    hint: "Le completați dumneavoastră, cu permisul în față. Permisul nu se fotografiază. Datele de contact apar în formular și ajung doar la asigurător și la broker.",
    scannable: false,
    fields: [
      { key: "fullName", label: "Nume și prenume", kind: "text" },
      { key: "licenseNo", label: "Număr permis", kind: "text" },
      { key: "categories", label: "Categorii", kind: "text", placeholder: "ex. B" },
      { key: "expiresOn", label: "Valabil până la", kind: "date" },
      { key: "birthDate", label: "Data nașterii (opțional)", kind: "date", optional: true },
      { key: "address", label: "Adresa dumneavoastră", kind: "text", placeholder: "Strada, număr, localitate, județ" },
      { key: "phone", label: "Telefon", kind: "phone", placeholder: "ex. 0722 123 456" },
      { key: "email", label: "E-mail (opțional)", kind: "email", placeholder: "ex. nume@exemplu.ro", optional: true },
    ],
  },
  policy: {
    label: "Polița RCA",
    hint: "Poza sau PDF-ul poliței, pagina cu seria și valabilitatea.",
    scannable: true,
    fields: [
      { key: "insurer", label: "Asigurător", kind: "text" },
      { key: "policyNo", label: "Serie și număr poliță", kind: "text" },
      { key: "validFrom", label: "Valabilă de la", kind: "date" },
      { key: "validTo", label: "Valabilă până la", kind: "date" },
      { key: "plate", label: "Număr de înmatriculare", kind: "plate", placeholder: "ex. B 123 ABC" },
    ],
  },
};

export const SCANNABLE_TYPES = DOC_TYPES.filter((t) => DOC_META[t].scannable);

/** Sub acest prag câmpul se marchează cu galben pe ecranul de verificare. */
export const LOW_CONFIDENCE = 0.75;

export const fieldSchema = z.object({
  value: z.string().max(200).nullable(),
  confidence: z.number().min(0).max(1),
});
export type ExtractedField = z.infer<typeof fieldSchema>;

export const extractedDocSchema = z.object({
  fields: z.record(z.string(), fieldSchema),
});
export type ExtractedDoc = z.infer<typeof extractedDocSchema>;

/** Schema pe care o primește modelul: toate câmpurile documentului sunt obligatorii (cu `null` unde nu se citește). */
export function extractionSchema(type: DocType) {
  const shape = Object.fromEntries(DOC_META[type].fields.map((f) => [f.key, fieldSchema]));
  return z.object({ fields: z.object(shape) });
}

// ---------------------------------------------------------------- validatori

const PLATE_RE = /^(?:B\d{2,3}|[A-Z]{2}\d{2})[A-Z]{3}$/;

/** „b123abc” → „B 123 ABC”. Returnează `null` dacă nu arată a număr românesc. */
export function normalizePlate(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!PLATE_RE.test(compact)) return null;
  const letters = compact.slice(-3);
  const head = compact.slice(0, -3);
  const county = head.startsWith("B") ? "B" : head.slice(0, 2);
  const digits = head.slice(county.length);
  return `${county} ${digits} ${letters}`;
}

export function normalizeVin(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(compact) ? compact : null;
}

/** Acceptă `YYYY-MM-DD` și `ZZ.LL.AAAA` / `ZZ/LL/AAAA`; returnează ISO sau `null`. */
export function normalizeDate(raw: string): string | null {
  const t = raw.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const ro = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (ro) [y, m, d] = [Number(ro[3]), Number(ro[2]), Number(ro[1])];
  else return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function normalizeYear(raw: string, now: Date): string | null {
  const y = Number(raw.trim());
  return Number.isInteger(y) && y >= 1950 && y <= now.getFullYear() + 1 ? String(y) : null;
}

/**
 * Telefon românesc (fix sau mobil) în forma „0722 123 456”; numerele cu prefix internațional rămân „+49 …” compacte.
 * `null` dacă nu arată a număr de telefon.
 */
export function normalizePhone(raw: string): string | null {
  const t = raw.trim();
  if (!/^[+\d][\d\s.()/-]*$/.test(t)) return null;
  let digits = t.replace(/\D/g, "");
  const international = t.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (international && digits.startsWith("40")) {
    digits = `0${digits.slice(2)}`;
  } else if (international) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (!/^0[23567]\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

export function normalizeEmail(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  return t.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? t : null;
}

/** Curăță un câmp după tipul lui. Valoarea invalidă rămâne, dar cu încredere mică (omul decide). */
export function normalizeField(def: FieldDef, field: ExtractedField, now: Date): ExtractedField {
  const raw = field.value?.trim();
  if (!raw) return { value: null, confidence: 0 };
  let value: string | null = raw;
  switch (def.kind) {
    case "plate":
      value = normalizePlate(raw);
      break;
    case "vin":
      value = normalizeVin(raw);
      break;
    case "date":
      value = normalizeDate(raw);
      break;
    case "year":
      value = normalizeYear(raw, now);
      break;
    case "phone":
      value = normalizePhone(raw);
      break;
    case "email":
      value = normalizeEmail(raw);
      break;
    case "text":
      break;
  }
  if (value === null) return { value: raw, confidence: Math.min(field.confidence, LOW_CONFIDENCE - 0.25) };
  return { value, confidence: field.confidence };
}

export function normalizeExtraction(type: DocType, doc: ExtractedDoc, now: Date): ExtractedDoc {
  const fields: ExtractedDoc["fields"] = {};
  for (const def of DOC_META[type].fields) {
    fields[def.key] = normalizeField(def, doc.fields[def.key] ?? { value: null, confidence: 0 }, now);
  }
  return { fields };
}

// ---------------------------------------------------------------- ecranul de verificare

export function isLowConfidence(field: ExtractedField | undefined): boolean {
  return !field || field.value === null || field.confidence < LOW_CONFIDENCE;
}

/** O valoare editată de om are încredere maximă, dar rămâne supusă validării pentru tipul ei. */
export function editField(def: FieldDef, text: string, now: Date): ExtractedField {
  return normalizeField(def, { value: text, confidence: 1 }, now);
}

/** Un câmp cere atenție dacă e gol sau nesigur; un câmp opțional gol e în regulă (dar unul completat greșit nu). */
export function fieldNeedsCheck(def: FieldDef, field: ExtractedField | undefined): boolean {
  if (def.optional && (!field || field.value === null)) return false;
  return isLowConfidence(field);
}

/** Un act e „gata” când nu are câmpuri goale sau nesigure (după verificarea omului). */
export function isDocConfirmed(type: DocType, doc: ExtractedDoc | null | undefined): boolean {
  if (!doc) return false;
  return DOC_META[type].fields.every((f) => !fieldNeedsCheck(f, doc.fields[f.key]));
}

export function fieldValue(doc: ExtractedDoc | null | undefined, key: string): string {
  return doc?.fields[key]?.value ?? "";
}

/** Polița trebuie să fie valabilă la data accidentului (avertisment, nu blocaj: decide asigurătorul). */
export function policyCoversDate(doc: ExtractedDoc | null | undefined, onDate: Date): boolean | null {
  const from = fieldValue(doc, "validFrom");
  const to = fieldValue(doc, "validTo");
  if (!from || !to) return null;
  const day = onDate.toISOString().slice(0, 10);
  return day >= from && day <= to;
}

/** „Datele sunt corecte”: omul a verificat actul, deci câmpurile valide devin sigure. Cele goale sau în format greșit rămân de corectat. */
export function confirmDoc(type: DocType, doc: ExtractedDoc, now: Date): ExtractedDoc {
  const fields: ExtractedDoc["fields"] = {};
  for (const def of DOC_META[type].fields) {
    const current = doc.fields[def.key];
    fields[def.key] = current?.value ? editField(def, current.value, now) : { value: null, confidence: 0 };
  }
  return { fields };
}

export function emptyDoc(type: DocType): ExtractedDoc {
  return { fields: Object.fromEntries(DOC_META[type].fields.map((f) => [f.key, { value: null, confidence: 0 }])) };
}

/** Numărul din poliță trebuie să fie al mașinii din talon. `null` = nu putem compara încă. */
export function policyMatchesVehicle(registration: ExtractedDoc | null, policy: ExtractedDoc | null): boolean | null {
  const a = fieldValue(registration, "plate").replace(/\s/g, "");
  const b = fieldValue(policy, "plate").replace(/\s/g, "");
  if (!a || !b) return null;
  return a === b;
}
