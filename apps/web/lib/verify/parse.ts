import type { DocFields, PolicyType } from "./checks";

/**
 * Text extras dintr-un PDF → câmpuri (`DocFields`), prin etichete și regex. Rulează local, pe textul real.
 * Ce nu găsește rămâne `undefined`: lipsa e raportată separat (`missingFieldIssues`), nu ghicită.
 * Calibrat pe polițele fictive din `data/fixtures`; un format de asigurător nou poate cere etichete în plus.
 */

const MONTHS: Record<string, string> = {
  ianuarie: "01", februarie: "02", martie: "03", aprilie: "04", mai: "05", iunie: "06",
  iulie: "07", august: "08", septembrie: "09", octombrie: "10", noiembrie: "11", decembrie: "12",
};

const DATE = String.raw`(?:\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+\d{4})`;
const AMOUNT = String.raw`\d[\d., ]*\d|\d`;
const CURRENCY = String.raw`(?:RON|LEI|LEU|EUR|USD)`;
const SEP = String.raw`[ \t]*[:\-–][ \t]*`;

/** Orice formă de dată → „ZZ.LL.AAAA” (separatori uniformi); o dată imposibilă rămâne ca text, ca verificarea s-o prindă. */
export function toRoDate(raw: string): string {
  const t = raw.trim();
  const named = new RegExp(`^(\\d{1,2})\\s+([a-zț]+)\\s+(\\d{4})$`, "i").exec(t);
  if (named) {
    const month = MONTHS[(named[2] ?? "").toLowerCase()];
    if (month) return `${(named[1] ?? "").padStart(2, "0")}.${month}.${named[3]}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const ro = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (ro) return `${(ro[1] ?? "").padStart(2, "0")}.${(ro[2] ?? "").padStart(2, "0")}.${ro[3]}`;
  return t;
}

const first = (text: string, re: RegExp): string | undefined => {
  const m = re.exec(text);
  const v = m?.[1]?.trim();
  return v ? v : undefined;
};

/** Tipul din titlu („Poliță de asigurare RCA”), altfel din cuvintele cheie care apar cel mai des. */
export function detectType(text: string): PolicyType | undefined {
  const title = /poli[țţt][ăa]\s+(?:de\s+asigurare\s+)?(?:facultativ[ăa]\s+)?(RCA|CASCO|PAD|locuin[țţt][ăa]|via[țţt][ăa])/i.exec(text);
  const fromTitle = title?.[1]?.toUpperCase().replace(/Ţ|Ț/g, "T");
  if (fromTitle === "RCA" || fromTitle === "CASCO" || fromTitle === "PAD") return fromTitle;
  if (fromTitle?.startsWith("LOCUIN")) return "LOCUINTA";
  if (fromTitle?.startsWith("VIA")) return "VIATA";
  const rca = (text.match(/\bRCA\b|r[ăa]spundere civil[ăa] auto/gi) ?? []).length;
  const casco = (text.match(/\bCASCO\b/gi) ?? []).length;
  const pad = (text.match(/\bPAD\b|dezastre naturale/gi) ?? []).length;
  const best = Math.max(rca, casco, pad);
  if (best === 0) return undefined;
  return best === rca ? "RCA" : best === casco ? "CASCO" : "PAD";
}

export function parsePolicyText(text: string): DocFields {
  const f: DocFields = {};
  const type = detectType(text);
  if (type) f.type = type;

  f.policyNo = first(text, new RegExp(String.raw`(?:seria(?:\s+[șşs]i\s+num[ăa]rul)?|poli[țţt][ăa]\s+nr\.?|num[ăa]r\s+poli[țţt][ăa]|nr\.?\s+poli[țţt][ăa])${SEP}([A-Z0-9][A-Z0-9/-]{3,})`, "i"));
  f.insurer = first(text, new RegExp(String.raw`asigur[ăa]tor(?:ul)?${SEP}([^\n]+)`, "i"));

  f.holderName = first(text, new RegExp(String.raw`(?:asigurat(?:ul)?|contractant(?:ul)?|titular(?:ul)?)${SEP}(\p{Lu}[\p{L}'. -]+?)(?=\s{2,}|\s+CNP\b|,|\n|$)`, "iu"));
  f.holderCnp = first(text, /\bCNP\b[ \t]*[:\-–]?[ \t]*(\d{13})\b/i) ?? first(text, /(?<!\d)([1-9]\d{12})(?!\d)/);
  const birth = first(text, new RegExp(String.raw`(?:data\s+na[șşs]terii|n[ăa]scut[ăa]?(?:\s+la)?)${SEP}(${DATE})`, "i"));
  if (birth) f.holderBirthDate = toRoDate(birth);

  f.plate = first(text, new RegExp(String.raw`(?:nr\.?\s*(?:de\s*)?[iî]nmatriculare|num[ăa]r(?:ul)?\s+de\s+[iî]nmatriculare|[iî]nmatriculare)${SEP}([^\n,;]+?)(?=[ \t]{2,}|[,;]|\n|$)`, "i"));
  f.vin = first(text, /(?:\bVIN\b|serie\s+(?:de\s+)?[șşs]asiu|serie\s+caroserie)[ \t]*[:\-–]?[ \t]*([A-Za-z0-9]{10,20})\b/i);

  const range = new RegExp(String.raw`(?:valabil[ăa]?|perioada\s+de\s+asigurare)[^\n\d]{0,40}?(${DATE})\s*(?:[-–—]|p[âa]n[ăa]\s+(?:la|în|in)|la|până)\s*(${DATE})`, "i").exec(text);
  if (range) {
    f.validFrom = toRoDate(range[1] ?? "");
    f.validTo = toRoDate(range[2] ?? "");
  }
  const from = first(text, new RegExp(String.raw`data\s+(?:[iî]nceperii|de\s+[iî]nceput|intr[ăa]rii\s+[iî]n\s+vigoare)${SEP}(${DATE})`, "i"));
  const to = first(text, new RegExp(String.raw`data\s+(?:expir[ăa]rii|de\s+expirare|[șşs]i\s+ora\s+expir[ăa]rii|[iî]ncet[ăa]rii)${SEP}(${DATE})`, "i"));
  if (from) f.validFrom = toRoDate(from);
  if (to) f.validTo = toRoDate(to);
  const issued = first(text, new RegExp(String.raw`data\s+emiterii${SEP}(${DATE})`, "i"));
  if (issued) f.issuedOn = toRoDate(issued);

  const premium = new RegExp(String.raw`prima(?:\s+de\s+asigurare)?(?:\s+total[ăa])?${SEP}(${AMOUNT})\s*(${CURRENCY})?`, "i").exec(text);
  if (premium) {
    f.premiumTotal = premium[1]?.trim();
    if (premium[2]) f.premiumCurrency = premium[2].toUpperCase();
  }
  f.installments = first(text, /(?:num[ăa]r\s+(?:de\s+)?rate|rate)[ \t]*[:\-–][ \t]*(\d{1,2})\b/i) ?? first(text, /\b(\d{1,2})\s+rate\b/i);
  const rate = new RegExp(String.raw`(?:valoare(?:a)?\s+rat(?:ei|ă)|rata)${SEP}(${AMOUNT})\s*(${CURRENCY})?`, "i").exec(text);
  if (rate) {
    f.installmentAmount = rate[1]?.trim();
    if (rate[2]) f.installmentCurrency = rate[2].toUpperCase();
  }

  f.iban = first(text, /\b(RO\d{2}(?:[ ]?[A-Z0-9]{4}){4,6})\b/);
  f.phone = first(text, new RegExp(String.raw`(?:telefon|tel\.?|mobil)${SEP}(\+?[\d][\d .()/-]{7,16}\d)`, "i"));
  f.email = first(text, /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);

  // Fără câmpuri goale în obiect: testele și raportul se uită doar la ce s-a găsit.
  for (const key of Object.keys(f) as Array<keyof DocFields>) if (f[key] === undefined) delete f[key];
  return f;
}

/** Câmpurile pe care o poliță trebuie să le aibă; cele care lipsesc din text sunt raportate. */
const REQUIRED: Record<string, Array<{ key: keyof DocFields; label: string }>> = {
  RCA: [
    { key: "policyNo", label: "seria și numărul poliței" },
    { key: "insurer", label: "asigurătorul" },
    { key: "holderName", label: "asiguratul" },
    { key: "plate", label: "numărul de înmatriculare" },
    { key: "validFrom", label: "data de început" },
    { key: "validTo", label: "data de expirare" },
    { key: "premiumTotal", label: "prima de asigurare" },
  ],
};
const REQUIRED_DEFAULT: Array<{ key: keyof DocFields; label: string }> = [
  { key: "policyNo", label: "seria și numărul poliței" },
  { key: "insurer", label: "asigurătorul" },
  { key: "holderName", label: "asiguratul" },
  { key: "validFrom", label: "data de început" },
  { key: "validTo", label: "data de expirare" },
  { key: "premiumTotal", label: "prima de asigurare" },
];

export function missingRequired(f: DocFields): Array<{ key: keyof DocFields; label: string }> {
  const list = (f.type && REQUIRED[f.type]) || REQUIRED_DEFAULT;
  return list.filter((r) => !f[r.key]);
}
