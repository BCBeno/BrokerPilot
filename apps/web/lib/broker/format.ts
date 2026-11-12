/**
 * Formatare doar la afișare, în dashboardul brokerului: datele rămân cum au fost salvate,
 * dar brokerul vede „Skoda Rapid”, „cat. B”, „City Insurance” și „0700 000 201”, nu textul brut din acte.
 */
import { expiryLabel } from "./renewals";

/** Fixturile au „(fictiv)” în nume; banda de sus spune o singură dată că datele sunt fictive. */
export function displayName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*\(fictiv\)\s*$/i, "").trim();
}

const capitalize = (w: string) => w.charAt(0).toLocaleUpperCase("ro-RO") + w.slice(1).toLocaleLowerCase("ro-RO");

/** „SKODA RAPID” → „Skoda Rapid”; siglele scurte („VW”, „BMW”) și cuvintele cu cifre („X5”) rămân cum sunt. */
export function vehicleName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (/^[A-ZĂÂÎȘȚ-]{4,}$/.test(w) ? capitalize(w) : w))
    .join(" ");
}

/** „Societatea de Asigurare-Reasigurare CITY INSURANCE SA” → „City Insurance”. */
export function insurerName(s: string | null | undefined): string {
  if (!s) return "";
  const short = s
    .trim()
    .replace(/^(societatea|compania)\s+de\s+asigur[aă]r[ei](-|\s+[șs]i\s+)reasigur[aă]r[ei]\s+/i, "")
    .replace(/\s+(s\.?\s?a\.?|s\.?r\.?l\.?)$/i, "")
    .trim();
  return vehicleName(short || s.trim());
}

/** „b” → „B”, „b, be” → „B, BE”. */
export function licenseCategory(s: string | null | undefined): string {
  return (s ?? "").toLocaleUpperCase("ro-RO");
}

/** Numerele românești de mobil (07xx xxx xxx) în grupe; restul rămân neschimbate. */
export function phoneDisplay(s: string | null | undefined): string {
  if (!s) return "";
  const digits = s.replace(/[^\d+]/g, "");
  const local = digits.startsWith("+40") ? `0${digits.slice(3)}` : digits.startsWith("0040") ? `0${digits.slice(4)}` : digits;
  return /^07\d{8}$/.test(local) ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : s.trim();
}

const WEEKDAYS = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];

/** Ca `expiryLabel`, dar în săptămâna curentă spune ziua: „expiră sâmbătă” în loc de „expiră în 3 zile”. */
export function expiryText(days: number, validTo: string): string {
  if (days < 2 || days > 6) return expiryLabel(days);
  const [y, m, d] = validTo.slice(0, 10).split("-").map(Number);
  return `expiră ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
}

/** „iul. 2026”: de când e clientul în portofoliu. */
export function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-RO", { timeZone: "Europe/Bucharest", month: "short", year: "numeric" });
}
