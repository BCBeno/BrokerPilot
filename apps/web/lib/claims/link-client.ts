import type { SupabaseClient } from "@supabase/supabase-js";

export type MatchMethod = "policy" | "plate" | "phone";
export type Candidate = { client_id: string; method: MatchMethod };
export type LinkDecision = { clientId: string; method: MatchMethod } | null;

/** Ordinea cheilor: polița (actul citit), numărul de înmatriculare (actul citit), telefonul (scris de mână de șofer). */
const ORDER: MatchMethod[] = ["policy", "plate", "phone"];

/**
 * Alege clientul unei părți din candidații găsiți în baza de date (`match_party_client`).
 * Se ia prima cheie care are vreun candidat: un singur client → legat; mai mulți = ambiguu, nu legăm nimic
 * (nici după cheile următoare, ca să nu ghicim).
 */
export function decideLink(candidates: Candidate[]): LinkDecision {
  for (const method of ORDER) {
    const ids = [...new Set(candidates.filter((c) => c.method === method).map((c) => c.client_id))];
    if (ids.length === 1) return { clientId: ids[0], method };
    if (ids.length > 1) return null;
  }
  return null;
}

type PartyKeys = {
  role: "A" | "B";
  client_id: string | null;
  driver: { phone?: string } | null;
  vehicle: { plate?: string } | null;
  insurance: { policyNo?: string; plate?: string } | null;
};

export type LinkResult = { role: "A" | "B"; clientId: string; method: MatchMethod };

export type PartyClients = Record<"A" | "B", string | null>;

/** Numele clienților agenției legați de părțile dosarului (după legarea automată sau manuală), pentru notificarea brokerului. */
export async function partyClients(db: SupabaseClient, claimId: string): Promise<PartyClients> {
  const out: PartyClients = { A: null, B: null };
  const { data, error } = await db.from("claim_parties").select("role, clients(full_name)").eq("claim_id", claimId);
  if (error) return out;
  for (const row of (data ?? []) as unknown as { role: "A" | "B"; clients: { full_name: string } | null }[]) {
    if (row.role === "A" || row.role === "B") out[row.role] = row.clients?.full_name ?? null;
  }
  return out;
}

/**
 * La finalizare: completează `claim_parties.client_id` pentru părțile încă nelegate și notează în `events`.
 * Cere clientul cu service role (funcția SQL e permisă doar lui). Nu aruncă: legarea e un bonus, nu blochează dosarul.
 */
export async function linkClaimParties(db: SupabaseClient, claimId: string): Promise<LinkResult[]> {
  try {
    const [claimRes, partiesRes] = await Promise.all([
      db.from("claims").select("agency_id").eq("id", claimId).maybeSingle(),
      db.from("claim_parties").select("role, client_id, driver, vehicle, insurance").eq("claim_id", claimId),
    ]);
    if (claimRes.error || partiesRes.error || !claimRes.data) return [];
    const agency = claimRes.data.agency_id as string;

    const linked: LinkResult[] = [];
    for (const party of (partiesRes.data ?? []) as PartyKeys[]) {
      if (party.client_id) continue;
      const plate = party.vehicle?.plate || party.insurance?.plate || null;
      const policyNo = party.insurance?.policyNo || null;
      const phone = party.driver?.phone || null;
      if (!plate && !policyNo && !phone) continue;
      const { data, error } = await db.rpc("match_party_client", { p_agency: agency, p_policy_no: policyNo, p_plate: plate, p_phone: phone });
      if (error) {
        console.error("[link-client]", error.message);
        continue;
      }
      const decision = decideLink((data ?? []) as Candidate[]);
      if (!decision) continue;
      const up = await db
        .from("claim_parties")
        .update({ client_id: decision.clientId })
        .eq("claim_id", claimId)
        .eq("role", party.role)
        .is("client_id", null);
      if (up.error) continue;
      linked.push({ role: party.role, ...decision });
    }

    if (linked.length) {
      await db.from("events").insert(
        linked.map((l) => ({
          entity_type: "claim",
          entity_id: claimId,
          type: "client_linked",
          payload: { role: l.role, client_id: l.clientId, method: l.method },
        })),
      );
    }
    return linked;
  } catch (error) {
    console.error("[link-client]", error instanceof Error ? error.message : error);
    return [];
  }
}
