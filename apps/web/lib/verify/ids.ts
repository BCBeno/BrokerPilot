/**
 * Validatori deterministi pentru identificatori (fără AI). Rulează local, pe valorile reale.
 * Plăcuța, VIN-ul, data, telefonul și emailul se validează în `lib/amiabila/documents.ts` (normalize*).
 */

export type CnpInfo = { birthDate: string; sex: "M" | "F"; controlOk: boolean };

const CNP_WEIGHTS = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];

/** Cifra de control a unui CNP: suma ponderată modulo 11 (restul 10 devine 1). */
export function cnpControlDigit(first12: string): number {
  const sum = [...first12].reduce((acc, ch, i) => acc + Number(ch) * (CNP_WEIGHTS[i] ?? 0), 0);
  const rest = sum % 11;
  return rest === 10 ? 1 : rest;
}

/** Secolul din prima cifră: 1–2 = 1900, 3–4 = 1800, 5–6 = 2000; 7–8 (rezidenți străini) și 9 nu spun secolul. */
function centuryOf(s: number, yy: number, now: Date): number | null {
  if (s === 1 || s === 2) return 1900 + yy;
  if (s === 3 || s === 4) return 1800 + yy;
  if (s === 5 || s === 6) return 2000 + yy;
  if (s === 7 || s === 8 || s === 9) {
    // Rezidenți străini: secolul nu e codificat; alegem cel mai recent care nu e în viitor.
    const y2000 = 2000 + yy;
    return y2000 <= now.getFullYear() ? y2000 : 1900 + yy;
  }
  return null;
}

/**
 * Structura (sex/secol, data nașterii, județ) și cifra de control. `null` dacă nu e un CNP de 13 cifre
 * sau data nașterii nu există; `controlOk: false` înseamnă „arată a CNP, dar cifra de control nu se potrivește”.
 */
export function parseCnp(raw: string, now: Date = new Date()): CnpInfo | null {
  const cnp = raw.replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(cnp)) return null;
  const s = Number(cnp[0]);
  if (s === 0) return null;
  const yy = Number(cnp.slice(1, 3));
  const mm = Number(cnp.slice(3, 5));
  const dd = Number(cnp.slice(5, 7));
  const county = Number(cnp.slice(7, 9));
  const year = centuryOf(s, yy, now);
  if (year === null) return null;
  const probe = new Date(Date.UTC(year, mm - 1, dd));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== mm - 1 || probe.getUTCDate() !== dd) return null;
  // Județe 01–46, Sectoarele 1–6 = 51–52 (vechi) și 41–46; 47/48 nu există, 99 = străin.
  const countyOk = (county >= 1 && county <= 46) || county === 51 || county === 52 || county === 99;
  return {
    birthDate: `${String(year).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
    sex: s % 2 === 1 ? "M" : "F",
    controlOk: countyOk && cnpControlDigit(cnp.slice(0, 12)) === Number(cnp[12]),
  };
}

export const isValidCnp = (raw: string, now?: Date) => parseCnp(raw, now)?.controlOk === true;

/** IBAN: lungimea țării, apoi mod 97 (ISO 13616). Pentru RO: 24 de caractere. */
const IBAN_LENGTHS: Record<string, number> = { RO: 24, DE: 22, FR: 27, IT: 27, ES: 24, NL: 18, BG: 22, HU: 28, AT: 20, BE: 16, GB: 22 };

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (expected !== undefined && iban.length !== expected) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) rest = (rest * 10 + Number(digit)) % 97;
  }
  return rest === 1;
}

/** Codurile de județ ale plăcuțelor românești (B = București). */
export const PLATE_COUNTIES = new Set([
  "AB", "AR", "AG", "BC", "BH", "BN", "BT", "BV", "BR", "BZ", "CS", "CL", "CJ", "CT", "CV", "DB", "DJ", "GL", "GR", "GJ",
  "HR", "HD", "IL", "IS", "IF", "MM", "MH", "MS", "NT", "OT", "PH", "SM", "SJ", "SB", "SV", "TR", "TM", "TL", "VS", "VL", "VN", "B",
]);

/** Primul segment al unei plăcuțe normalizate („CJ 12 ABC” → „CJ”) e un județ real? */
export function plateCountyExists(normalizedPlate: string): boolean {
  const county = normalizedPlate.split(" ")[0] ?? "";
  return PLATE_COUNTIES.has(county);
}
