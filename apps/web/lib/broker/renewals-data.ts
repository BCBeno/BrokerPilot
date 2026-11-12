import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RENEWAL_WINDOW,
  addDays,
  daysUntil,
  renewalState,
  type PolicyLite,
  type RenewalEvent,
  type RenewalState,
} from "./renewals";

export type PolicyRow = PolicyLite & {
  insurer: string;
  policy_no: string;
  premium: number | null;
  clients: { full_name: string; phone: string | null; needs_review: boolean } | null;
  vehicles: { plate: string; make: string | null; model: string | null } | null;
};

export type RenewalItem = { policy: PolicyRow; days: number; state: RenewalState; brokerName: string | null };

export const POLICY_SELECT =
  "id, client_id, vehicle_id, type, insurer, policy_no, valid_from, valid_to, premium, clients(full_name, phone, needs_review), vehicles(plate, make, model)";

/** Evenimentele de reînnoire pentru polițele date (cele mai noi primele). */
export async function loadRenewalEvents(db: SupabaseClient, policyIds: string[]): Promise<RenewalEvent[]> {
  if (!policyIds.length) return [];
  const { data } = await db
    .from("events")
    .select("entity_id, type, payload, at")
    .eq("entity_type", "policy")
    .in("entity_id", policyIds)
    .in("type", ["renewal_contacted", "renewal_snoozed"])
    .order("at", { ascending: false });
  return (data ?? []) as RenewalEvent[];
}

export async function brokerNames(db: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await db.from("brokers").select("id, name");
  return new Map((data ?? []).map((b) => [b.id as string, b.name as string]));
}

/** Calculează starea fiecărei polițe din fereastră; `all` = toate polițele clienților (pentru „reînnoită”). */
export function toRenewalItems(window: PolicyRow[], all: PolicyLite[], events: RenewalEvent[], names: Map<string, string>, today: string) {
  return window
    .map((policy): RenewalItem => {
      const state = renewalState(policy, all, events, today);
      const brokerId = state.kind === "contacted" || state.kind === "snoozed" ? state.brokerId : null;
      return { policy, days: daysUntil(policy.valid_to, today), state, brokerName: brokerId ? (names.get(brokerId) ?? null) : null };
    })
    .sort((a, b) => a.days - b.days);
}

/** Polițele agenției care expiră în 30 de zile sau au expirat în ultimele 30 (RLS pe agenție). */
export async function loadRenewals(db: SupabaseClient, today: string): Promise<{ items: RenewalItem[]; error: boolean }> {
  const { data, error } = await db
    .from("policies")
    .select(POLICY_SELECT)
    .gte("valid_to", addDays(today, -RENEWAL_WINDOW.pastDays))
    .lte("valid_to", addDays(today, RENEWAL_WINDOW.futureDays))
    .order("valid_to")
    .limit(500);
  if (error) return { items: [], error: true };
  const window = (data ?? []) as unknown as PolicyRow[];
  const clientIds = [...new Set(window.map((p) => p.client_id))];
  const [siblings, events, names] = await Promise.all([
    clientIds.length
      ? db.from("policies").select("id, client_id, vehicle_id, type, valid_from, valid_to").in("client_id", clientIds)
      : Promise.resolve({ data: [] as PolicyLite[] }),
    loadRenewalEvents(
      db,
      window.map((p) => p.id),
    ),
    brokerNames(db),
  ]);
  return { items: toRenewalItems(window, (siblings.data ?? []) as PolicyLite[], events, names, today), error: false };
}
