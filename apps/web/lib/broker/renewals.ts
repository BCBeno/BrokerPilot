/**
 * Reînnoiri: cât mai e până expiră o poliță, dacă a fost deja reînnoită și ce a făcut brokerul
 * („Am contactat” / „Reamintește-mi”, rânduri în `events`). Totul determinist, pe date calendaristice din România.
 */

export const RENEWAL_WINDOW = { pastDays: 30, futureDays: 30 } as const;

export type Tone = "neutral" | "info" | "ok" | "todo" | "work" | "danger";

export type PolicyLite = {
  id: string;
  client_id: string;
  vehicle_id: string | null;
  type: string;
  valid_from: string;
  valid_to: string;
};

export type RenewalEvent = {
  entity_id: string;
  type: string;
  payload: { broker_id?: string; until?: string } | null;
  at: string;
};

export type RenewalState =
  | { kind: "todo"; reminderDue: boolean }
  | { kind: "snoozed"; until: string; brokerId: string | null }
  | { kind: "contacted"; at: string; brokerId: string | null }
  | { kind: "renewed" };

const TZ = "Europe/Bucharest";
const DAY_MS = 86_400_000;

/** Data de azi în România, `YYYY-MM-DD`. */
export function todayRo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const utc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Zile de la `today` până la `date` (negativ = în trecut). */
export function daysUntil(date: string, today: string): number {
  return Math.round((utc(date) - utc(today)) / DAY_MS);
}

export function addDays(today: string, days: number): string {
  return new Date(utc(today) + days * DAY_MS).toISOString().slice(0, 10);
}

export function expiryLabel(days: number): string {
  if (days === 0) return "expiră azi";
  if (days === 1) return "expiră mâine";
  if (days > 1) return `expiră în ${days} zile`;
  if (days === -1) return "expirată ieri";
  return `expirată de ${-days} zile`;
}

/** Eticheta de pe fișa clientului: doar ce cere atenție; polițele valabile mult timp primesc „valabilă”. */
export function expiryBadge(days: number): { label: string; tone: Tone } {
  if (days < 0) return { label: days < -RENEWAL_WINDOW.pastDays ? "expirată" : expiryLabel(days), tone: "danger" };
  if (days <= 7) return { label: expiryLabel(days), tone: "danger" };
  if (days <= RENEWAL_WINDOW.futureDays) return { label: expiryLabel(days), tone: "todo" };
  return { label: "valabilă", tone: "ok" };
}

export function inRenewalWindow(days: number): boolean {
  return days >= -RENEWAL_WINDOW.pastDays && days <= RENEWAL_WINDOW.futureDays;
}

/** Reînnoită = același client are o poliță de același tip, pe același vehicul (sau fără vehicul), care ține mai mult. */
export function isRenewed(policy: PolicyLite, all: PolicyLite[]): boolean {
  return all.some(
    (o) =>
      o.id !== policy.id &&
      o.client_id === policy.client_id &&
      o.type === policy.type &&
      o.vehicle_id === policy.vehicle_id &&
      o.valid_to > policy.valid_to,
  );
}

/** Starea unei polițe din fereastră: ultima acțiune a brokerului câștigă; o amânare trecută redevine „de contactat”. */
export function renewalState(policy: PolicyLite, all: PolicyLite[], events: RenewalEvent[], today: string): RenewalState {
  if (isRenewed(policy, all)) return { kind: "renewed" };
  const last = events
    .filter((e) => e.entity_id === policy.id && (e.type === "renewal_contacted" || e.type === "renewal_snoozed"))
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!last) return { kind: "todo", reminderDue: false };
  const brokerId = last.payload?.broker_id ?? null;
  if (last.type === "renewal_contacted") return { kind: "contacted", at: last.at, brokerId };
  const until = last.payload?.until;
  if (until && until > today) return { kind: "snoozed", until, brokerId };
  return { kind: "todo", reminderDue: true };
}

export const RENEWAL_FILTERS = [
  { id: "todo", label: "De contactat" },
  { id: "snoozed", label: "Amânate" },
  { id: "contacted", label: "Contactate" },
  { id: "all", label: "Toate" },
] as const;
export type RenewalFilter = (typeof RENEWAL_FILTERS)[number]["id"];

export function matchesRenewalFilter(state: RenewalState, filter: RenewalFilter): boolean {
  if (filter === "all") return true;
  return state.kind === filter;
}

export const SNOOZE_OPTIONS = [
  { days: 1, label: "Mâine" },
  { days: 3, label: "Peste 3 zile" },
  { days: 7, label: "Peste o săptămână" },
] as const;

export const POLICY_TYPE_LABELS: Record<string, string> = {
  RCA: "RCA",
  CASCO: "CASCO",
  PAD: "PAD",
  LOCUINTA: "Locuință",
  VIATA: "Viață",
  ALTA: "Altă asigurare",
};

/** `2026-11-17` → `17.11.2026`, ca pe acte. */
export function roDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}
