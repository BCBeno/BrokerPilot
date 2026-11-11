import { z } from "zod";

/**
 * Actele scanate de șofer și datele extrase din ele (S3).
 * Un câmp extras are mereu `value` (sau `null` dacă nu e lizibil) și `confidence` între 0 și 1.
 * Validatorii nu resping extragerea: un câmp care nu trece validarea rămâne vizibil, dar cu încredere mică,
 * ca omul să-l verifice pe ecranul de verificare.
 */

export const DOC_TYPES = ["registration", "license", "policy"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type FieldKind = "text" | "plate" | "vin" | "date" | "year";
export type FieldDef = { key: string; label: string; kind: FieldKind; placeholder?: string };

export const DOC_META: Record<DocType, { label: string; hint: string; fields: FieldDef[] }> = {
  registration: {
    label: "Talonul mașinii",
    hint: "Certificatul de înmatriculare, pagina cu datele mașinii.",
    fields: [
      { key: "plate", label: "Număr de înmatriculare", kind: "plate", placeholder: "B 123 ABC" },
      { key: "vin", label: "Serie șasiu (VIN)", kind: "vin" },
      { key: "make", label: "Marca", kind: "text" },
      { key: "model", label: "Modelul", kind: "text" },
      { key: "year", label: "An fabricație", kind: "year", placeholder: "2018" },
      { key: "holderName", label: "Titular", kind: "text" },
    ],
  },
  license: {
    label: "Permisul de conducere",
    hint: "Fața permisului, cu poza și numele.",
    fields: [
      { key: "fullName", label: "Nume și prenume", kind: "text" },
      { key: "licenseNo", label: "Număr permis", kind: "text" },
      { key: "categories", label: "Categorii", kind: "text", placeholder: "B" },
      { key: "expiresOn", label: "Valabil până la", kind: "date" },
    ],
  },
  policy: {
    label: "Polița RCA",
    hint: "Poza sau PDF-ul poliței, pagina cu seria și valabilitatea.",
    fields: [
      { key: "insurer", label: "Asigurător", kind: "text" },
      { key: "policyNo", label: "Serie și număr poliță", kind: "text" },
      { key: "validFrom", label: "Valabilă de la", kind: "date" },
      { key: "validTo", label: "Valabilă până la", kind: "date" },
      { key: "plate", label: "Număr de înmatriculare", kind: "plate", placeholder: "B 123 ABC" },
    ],
  },
};

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

/** Un act e „gata” când nu are câmpuri goale sau nesigure (după verificarea omului). */
export function isDocConfirmed(type: DocType, doc: ExtractedDoc | null | undefined): boolean {
  if (!doc) return false;
  return DOC_META[type].fields.every((f) => !isLowConfidence(doc.fields[f.key]));
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
