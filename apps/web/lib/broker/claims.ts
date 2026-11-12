/** Datele dashboardului brokerului: statusuri, rândurile din listă. Logică pură, testată. */

export const CLAIM_STATUSES = ["draft", "awaiting_b", "signed", "submitted", "in_progress", "closed"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: "Ciornă",
  awaiting_b: "Așteaptă B",
  signed: "Semnat",
  submitted: "Trimis",
  in_progress: "În lucru",
  closed: "Închis",
};

export const CHANNEL_LABELS: Record<string, string> = { web: "din aplicație", telegram: "din Telegram", voice: "din apel vocal" };

/** Filtrele din listă, în ordinea în care le parcurge brokerul. „noi” = trimise și nepreluate. */
export const LIST_FILTERS = [
  { id: "all", label: "Toate" },
  { id: "new", label: "De preluat" },
  { id: "awaiting_b", label: "Așteaptă B" },
  { id: "in_progress", label: "În lucru" },
  { id: "closed", label: "Închise" },
] as const;
export type ListFilter = (typeof LIST_FILTERS)[number]["id"];

export type ClaimListRow = {
  id: string;
  ref: string;
  status: ClaimStatus;
  channel: string;
  location: string;
  createdAt: string;
  updatedAt: string;
  plateA: string;
  plateB: string;
  brokerName: string | null;
  /** Câte elemente blocante lipsesc (din checklistul salvat la finalizare). `null` = nefinalizat. */
  missingBlocking: number | null;
  missingTotal: number | null;
};

type RawParty = { role: string; vehicle: Record<string, unknown> | null };
export type RawClaim = {
  id: string;
  public_ref: string;
  status: string;
  channel: string;
  location_text: string | null;
  created_at: string;
  updated_at: string;
  missing_items: unknown;
  claim_parties: RawParty[] | null;
  brokers: { name: string } | { name: string }[] | null;
};

export const LIST_SELECT =
  "id, public_ref, status, channel, location_text, created_at, updated_at, missing_items, claim_parties(role, vehicle), brokers(name)";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const asStatus = (s: string): ClaimStatus => ((CLAIM_STATUSES as readonly string[]).includes(s) ? (s as ClaimStatus) : "draft");

export function toListRow(raw: RawClaim): ClaimListRow {
  const plate = (role: string) => str(raw.claim_parties?.find((p) => p.role === role)?.vehicle?.plate);
  const broker = Array.isArray(raw.brokers) ? raw.brokers[0] : raw.brokers;
  const missing = Array.isArray(raw.missing_items) ? (raw.missing_items as { blocking?: unknown }[]) : null;
  return {
    id: raw.id,
    ref: raw.public_ref,
    status: asStatus(raw.status),
    channel: raw.channel,
    location: raw.location_text ?? "",
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    plateA: plate("A"),
    plateB: plate("B"),
    brokerName: broker?.name ?? null,
    missingBlocking: missing ? missing.filter((m) => m.blocking === true).length : null,
    missingTotal: missing ? missing.length : null,
  };
}

export function matchesFilter(row: ClaimListRow, filter: ListFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "new":
      return (row.status === "submitted" || row.status === "signed") && row.brokerName === null;
    case "awaiting_b":
      return row.status === "awaiting_b" || row.status === "draft";
    case "in_progress":
      return row.status === "in_progress";
    case "closed":
      return row.status === "closed";
  }
}

/** Căutare după referință, număr de înmatriculare (fără spații) sau adresă. */
export function matchesQuery(row: ClaimListRow, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return true;
  const hay = [row.ref, row.plateA, row.plateB, row.location].map((s) => s.toLowerCase().replace(/\s+/g, ""));
  return hay.some((h) => h.includes(q));
}

/** „14:20” azi, „ieri”, altfel „10 nov”. Ora României. */
export function shortTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("ro-RO", { timeZone: "Europe/Bucharest" });
  if (day(d) === day(now)) return d.toLocaleTimeString("ro-RO", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (day(d) === day(yesterday)) return "ieri";
  return d.toLocaleDateString("ro-RO", { timeZone: "Europe/Bucharest", day: "numeric", month: "short" }).replace(".", "");
}

export function longTime(iso: string): string {
  return new Date(iso).toLocaleString("ro-RO", {
    timeZone: "Europe/Bucharest",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}
