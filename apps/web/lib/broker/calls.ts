/**
 * Apelurile vocale din fișa dosarului. Legarea sigură (apelul a cerut starea dosarului, cu codul validat) o face baza de date;
 * aici ordonăm apelurile pe care brokerul le poate lega singur și pregătim ce se afișează. Fără LLM, fără date trimise nicăieri.
 */

export type CallRow = {
  id: string;
  created_at: string;
  summary: string | null;
  transcript: { text?: string; messages?: { role?: string; text?: string; t?: number | null }[]; durationSeconds?: number; endedReason?: string | null } | null;
};

/** De ce e propus un apel: pomenește codul dosarului (semnal puternic) sau strada accidentului (semnal mediu). */
export type CallReason = "code" | "place" | null;
export type CallCandidate = { call: CallRow; reason: CallReason };

const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Codul dosarului apare în text oricum ar fi scris („BP-2611-00017”, „bp 2611 00017”, „BP 2 6 1 1 0 0 0 1 7”). */
export function mentionsClaimRef(text: string | null | undefined, ref: string): boolean {
  const k = key(ref);
  return k.length >= 6 && key(text ?? "").includes(k);
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Prefixul doar ca cuvânt întreg („Str. X”, „Strada X”), ca „Strugurilor” să rămână întreg.
const STREET_PREFIX = /^(strada|str|bulevardul|bd|b-dul|calea|aleea|soseaua|sos|piata|drumul|intrarea)(\.\s*|\s+)/;

/**
 * Numele străzii din adresa accidentului („Strada Grigore Ureche, Suceava” → „grigore ureche”).
 * `null` dacă adresa e doar o localitate („Suceava”, fără virgulă și fără „Strada”): o localitate pomenită nu spune
 * că apelul ține de acest dosar, mulți clienți sună din același oraș.
 */
export function streetKey(place: string | null | undefined): string | null {
  const parts = plain(place ?? "").split(",");
  const first = parts[0] ?? "";
  const hasPrefix = STREET_PREFIX.test(first);
  if (parts.length < 2 && !hasPrefix) return null;
  const name = first.replace(STREET_PREFIX, "").replace(/\s(nr|numarul)\.?\s*\d+.*$/, "").replace(/\d+/g, "").replace(/\s+/g, " ").trim();
  return name.length >= 5 ? name : null;
}

/** Strada accidentului apare în text, indiferent de diacritice și majuscule. */
export function mentionsPlace(text: string | null | undefined, place: string | null | undefined): boolean {
  const street = streetKey(place);
  return street !== null && plain(text ?? "").replace(/\s+/g, " ").includes(street);
}

/**
 * Apelurile nelegate care pot ține de acest dosar: doar cele care pomenesc codul lui (semnal puternic) sau strada
 * accidentului (semnal mediu), cele cu cod primele, apoi cele mai noi. Un apel fără niciunul dintre semnale nu se
 * propune: rezumatele altor clienți nu au ce căuta în dosarul acesta (se atașează din pagina „Apeluri”).
 */
export function rankCandidateCalls(calls: CallRow[], ref: string, place: string | null | undefined, limit = 6): CallCandidate[] {
  const candidates: CallCandidate[] = [];
  for (const call of calls) {
    const text = [call.summary, call.transcript?.text];
    const reason: CallReason = text.some((t) => mentionsClaimRef(t, ref)) ? "code" : text.some((t) => mentionsPlace(t, place)) ? "place" : null;
    if (reason) candidates.push({ call, reason });
  }
  const weight = (r: CallReason) => (r === "code" ? 2 : 1);
  return candidates.sort((a, b) => weight(b.reason) - weight(a.reason) || b.call.created_at.localeCompare(a.call.created_at)).slice(0, limit);
}

/** „42 s”, „2 min 5 s”; `null` dacă raportul nu are durata. */
export function callDuration(call: Pick<CallRow, "transcript">): string | null {
  const s = Math.round(Number(call.transcript?.durationSeconds ?? 0));
  if (!Number.isFinite(s) || s <= 0) return null;
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`;
}

/** Replicile apelului, în ordinea în care s-au spus; cele goale se scot. */
export function callTurns(call: Pick<CallRow, "transcript">): { who: "client" | "asistent"; text: string }[] {
  const msgs = call.transcript?.messages ?? [];
  return msgs
    .filter((m) => typeof m.text === "string" && m.text.trim() !== "")
    .map((m) => ({ who: m.role === "user" ? ("client" as const) : ("asistent" as const), text: (m.text as string).trim() }));
}

export const CALL_LINK_METHODS: Record<string, string> = {
  ref: "legat după codul dosarului, spus în apel",
  broker: "legat de broker",
};
