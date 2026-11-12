import { parseCnp, PLATE_COUNTIES } from "./ids";

/**
 * Redactare PII înainte de orice LLM cloud din fluxurile broker (CLAUDE.md, spec 10.3).
 * Valorile devin token-uri tipizate (`<CNP_1>`); același text → același token. Harta token → valoare
 * rămâne doar în memoria procesului și se folosește la re-hidratare, în UI-ul brokerului.
 * Nu se loghează niciodată harta și nu pleacă nicăieri.
 *
 * Aceeași logică trebuie oglindită într-un Code node n8n (WF10) când verificatorul e apelat din Telegram.
 */

export type RedactKind = "NUME" | "CNP" | "TEL" | "EMAIL" | "IBAN" | "PLATE" | "VIN" | "POLITA" | "DATA_NASTERE";

export type RedactOptions = {
  /** Nume cunoscute (din baza de date sau din câmpurile extrase), căutate fără diacritice și fără să conteze ordinea. */
  knownNames?: string[];
  /** Date de naștere cunoscute (ISO), pe lângă cele deduse din CNP. */
  knownBirthDates?: string[];
};

export type RedactResult = {
  text: string;
  /** token → valoare originală (doar local). */
  map: Record<string, string>;
  counts: Partial<Record<RedactKind, number>>;
};

const TOKEN_RE = /<[A-Z_]+_\d+>/g;

/** Aceeași lungime ca textul inițial (potrivire fără diacritice și fără majuscule, cu indici valabili în original). */
function fold(text: string): string {
  const map: Record<string, string> = { ă: "a", â: "a", î: "i", ș: "s", ş: "s", ț: "t", ţ: "t" };
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? (map[lower] ?? lower) : ch;
  }
  return out;
}

const compact = (s: string) => s.replace(/[\s.-]/g, "").toUpperCase();

const COUNTY_ALT = [...PLATE_COUNTIES].sort((a, b) => b.length - a.length).join("|");

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IBAN_RE = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?(?![A-Za-z0-9])/g;
const CNP_RE = /(?<!\d)[1-9]\d{12}(?!\d)/g;
const PHONE_RE = /(?<![\d+])(?:(?:\+|00)40[\s.-]?|0)[237](?:[\s.-]?\d){8}(?!\d)/g;
const PLATE_RE = new RegExp(`(?<![A-Za-z0-9])(?:${COUNTY_ALT})[\\s-]?\\d{2,3}[\\s-]?[A-Z]{3}(?![A-Za-z0-9])`, "gi");
const VIN_RE = /(?<![A-Za-z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Za-z0-9])/g;
const POLICY_STYLE_RE = /(?<![A-Za-z0-9])[A-Z]{2,5}-(?:RCA|CASCO|PAD|LOC|VIA|ALT)-\d{3,}(?![A-Za-z0-9])/g;
const POLICY_LABEL_RE = /(\b(?:poli[țţt][ăa]|seria(?: [șşs]i num[ăa]rul)?|nr\.? poli[țţt][ăa]|num[ăa]r poli[țţt][ăa])[ \t]*[:.]?[ \t]*)([A-Z0-9][A-Z0-9/-]{3,24})/giu;
const BIRTH_LABEL_RE = /(\b(?:data na[șşs]terii|n[ăa]scut[ăa]?(?: la)?|DN)[ \t]*[:.]?[ \t]*)(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2})/giu;
/** Eticheta (fără diferență între majuscule) și restul rândului; cuvintele cu majusculă de la începutul restului sunt numele. */
const NAME_LABEL_RE =
  /(\b(?:asigurat(?:ul)?|titular(?:ul)?|contractant(?:ul)?|proprietar(?:ul)?|beneficiar(?:ul)?|nume(?: [șşs]i prenume)?|conduc[ăa]tor(?: auto)?|[șşs]ofer(?:ul)?)[ \t]*[:\-][ \t]*)([^\n]{1,100})/giu;
const NAME_WORD = /^\p{Lu}[\p{L}'-]*$/u;
/**
 * Valori după etichetă, chiar dacă sunt scrise greșit (o plăcuță „ABC 123”, un CNP cu o cifră în plus): tocmai greșelile
 * pe care le caută verificatorul n-ar fi prinse de formatele stricte de mai sus, deci ar ajunge la AI.
 */
const SEP_L = String.raw`[ \t]*[:\-–][ \t]*`;
const TAIL = String.raw`(?=[ \t]{2,}|[,;]|\n|$)`;
const LABELED: Array<{ kind: RedactKind; re: RegExp; key: (v: string) => string }> = [
  {
    kind: "PLATE",
    re: new RegExp(String.raw`((?:nr\.?\s*(?:de\s*)?[iî]nmatriculare|num[ăa]r(?:ul)?\s+de\s+[iî]nmatriculare)${SEP_L})([^\n,;<]+?)${TAIL}`, "giu"),
    key: compact,
  },
  { kind: "VIN", re: new RegExp(String.raw`((?:\bVIN\b|serie\s+(?:de\s+)?[șşs]asiu|serie\s+caroserie)${SEP_L})([A-Za-z0-9]{8,24})\b`, "giu"), key: compact },
  { kind: "CNP", re: new RegExp(String.raw`(\bCNP\b[ \t]*[:\-–]?[ \t]*)(\d[\d -]{6,18}\d)`, "giu"), key: compact },
  { kind: "IBAN", re: new RegExp(String.raw`(\bIBAN\b[^\n:]*${SEP_L})([A-Za-z]{2}\d{2}[A-Za-z0-9 ]{8,32}[A-Za-z0-9])`, "giu"), key: compact },
  { kind: "TEL", re: new RegExp(String.raw`((?:telefon|tel\.?|mobil)${SEP_L})(\+?\d[\d .()/-]{5,20}\d)`, "giu"), key: compact },
];

const NAME_STOP = /^(cnp|cui|tel|telefon|adresa|email|e-mail|seria|nr|data|cod|poli[țţt][ăa]|valabil\w*)\.?$/iu;

class Tokenizer {
  readonly map: Record<string, string> = {};
  readonly counts: Partial<Record<RedactKind, number>> = {};
  private readonly byKey = new Map<string, string>();

  token(kind: RedactKind, original: string, key: string = original): string {
    const k = `${kind}:${key}`;
    const existing = this.byKey.get(k);
    if (existing) return existing;
    const n = (this.counts[kind] ?? 0) + 1;
    this.counts[kind] = n;
    const token = `<${kind}_${n}>`;
    this.byKey.set(k, token);
    this.map[token] = original;
    return token;
  }
}


function isoToRo(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** „01.10.1997”, „1/10/1997” sau „1997-10-01” → „1997-10-01”; `null` dacă nu arată a dată. */
function toIso(date: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (iso) return date;
  const ro = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(date);
  return ro ? `${ro[3]}-${(ro[2] ?? "").padStart(2, "0")}-${(ro[1] ?? "").padStart(2, "0")}` : null;
}

/** Înlocuiește în `text` fiecare apariție a `needle` (potrivire fold-ată, pe cuvinte întregi). */
function replaceFolded(text: string, needle: string, replacement: string): string {
  const n = fold(needle).trim();
  if (n.length < 3) return text;
  const haystack = fold(text);
  let out = "";
  let from = 0;
  let idx = haystack.indexOf(n);
  while (idx !== -1) {
    const end = idx + n.length;
    const before = idx === 0 ? "" : (haystack[idx - 1] ?? "");
    const after = haystack[end] ?? "";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
      out += text.slice(from, idx) + replacement;
      from = end;
      idx = haystack.indexOf(n, end);
    } else {
      idx = haystack.indexOf(n, idx + 1);
    }
  }
  return out + text.slice(from);
}

export function redact(input: string, options: RedactOptions = {}): RedactResult {
  const t = new Tokenizer();
  let text = input;

  text = text.replace(EMAIL_RE, (m) => t.token("EMAIL", m, m.toLowerCase()));

  const birthDates = new Set<string>(options.knownBirthDates ?? []);
  for (const { kind, re, key } of LABELED) {
    text = text.replace(re, (_full, label: string, value: string) => {
      if (kind === "CNP") {
        const info = parseCnp(value.replace(/[\s-]/g, ""));
        if (info) birthDates.add(info.birthDate);
      }
      return label + t.token(kind, value.trim(), key(value));
    });
  }
  text = text.replace(IBAN_RE, (m) => {
    const key = compact(m);
    return key.length >= 15 ? t.token("IBAN", m, key) : m;
  });

  // Orice șir de 13 cifre cu structură de CNP (sex, dată, județ) e PII, chiar dacă cifra de control e greșită (typo).
  text = text.replace(CNP_RE, (m) => {
    const info = parseCnp(m);
    if (!info) return m;
    birthDates.add(info.birthDate);
    return t.token("CNP", m, m);
  });

  text = text.replace(PHONE_RE, (m) => t.token("TEL", m, compact(m).replace(/^(\+?40|0040)/, "0")));
  text = text.replace(PLATE_RE, (m) => t.token("PLATE", m, compact(m)));
  text = text.replace(VIN_RE, (m) => (/[A-Z]/.test(m) && /\d/.test(m) ? t.token("VIN", m, m) : m));

  text = text.replace(POLICY_STYLE_RE, (m) => t.token("POLITA", m, compact(m)));
  text = text.replace(POLICY_LABEL_RE, (full, label: string, value: string) =>
    /\d/.test(value) ? label + t.token("POLITA", value, compact(value)) : full,
  );

  text = text.replace(BIRTH_LABEL_RE, (_full, label: string, date: string) => {
    const iso = toIso(date);
    if (iso) birthDates.add(iso);
    return label + t.token("DATA_NASTERE", date, iso ?? date);
  });
  for (const iso of birthDates) {
    for (const variant of [iso, isoToRo(iso), isoToRo(iso).replace(/\./g, "/")]) {
      if (text.includes(variant)) text = text.split(variant).join(t.token("DATA_NASTERE", variant, iso));
    }
  }

  // Nume cunoscute: întâi numele întreg (în ambele ordini), apoi părțile lui, ca „Popescu” singur să fie prins.
  for (const full of options.knownNames ?? []) {
    const parts = full.split(/\s+/).filter((p) => p.length >= 3);
    if (parts.length === 0) continue;
    const key = parts.map(fold).sort().join(" ");
    const token = t.token("NUME", full, key);
    if (parts.length > 1) {
      text = replaceFolded(text, parts.join(" "), token);
      text = replaceFolded(text, [...parts].reverse().join(" "), token);
    }
    for (const part of parts) text = replaceFolded(text, part, token);
  }

  // Nume după etichetă („Asigurat: Ion Popescu”), pentru ce nu e în lista de nume cunoscute.
  text = text.replace(NAME_LABEL_RE, (full, label: string, rest: string) => {
    const words: string[] = [];
    let consumed = 0;
    for (const m of rest.matchAll(/[^ \t]+/g)) {
      const word = m[0];
      if (words.length >= 4 || !NAME_WORD.test(word) || NAME_STOP.test(word)) break;
      words.push(word);
      consumed = (m.index ?? 0) + word.length;
    }
    if (words.length === 0) return full;
    return label + t.token("NUME", rest.slice(0, consumed), words.map(fold).sort().join(" ")) + rest.slice(consumed);
  });

  return { text, map: t.map, counts: t.counts };
}

/** Înlocuiește token-urile la loc. Doar pentru UI-ul brokerului; textul re-hidratat nu pleacă spre niciun LLM. */
export function rehydrate(text: string, map: Record<string, string>): string {
  return text.replace(TOKEN_RE, (token) => map[token] ?? token);
}

export type Leak = { kind: RedactKind; sample: string };

/**
 * Plasa de siguranță dinaintea apelului AI: caută în textul deja redactat ce seamănă încă a PII.
 * Dacă găsește ceva, apelul nu pleacă (vezi `assertRedacted`).
 */
export function findLeaks(redacted: string): Leak[] {
  const leaks: Leak[] = [];
  const probe = (kind: RedactKind, re: RegExp, accept: (m: string) => boolean = () => true) => {
    for (const m of redacted.matchAll(new RegExp(re.source, re.flags))) if (accept(m[0])) leaks.push({ kind, sample: m[0].slice(0, 4) + "…" });
  };
  probe("EMAIL", EMAIL_RE);
  probe("IBAN", IBAN_RE, (m) => compact(m).length >= 15);
  probe("CNP", CNP_RE, (m) => parseCnp(m) !== null);
  probe("TEL", PHONE_RE);
  probe("PLATE", PLATE_RE);
  probe("VIN", VIN_RE, (m) => /[A-Z]/.test(m) && /\d/.test(m));
  return leaks;
}

export class PiiLeakError extends Error {
  constructor(readonly leaks: Leak[]) {
    super(`Textul conține încă date personale (${[...new Set(leaks.map((l) => l.kind))].join(", ")}); apelul AI a fost oprit.`);
  }
}

export function assertRedacted(redacted: string): void {
  const leaks = findLeaks(redacted);
  if (leaks.length > 0) throw new PiiLeakError(leaks);
}
