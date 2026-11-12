import type { SupabaseClient } from "@supabase/supabase-js";

export type MatchMethod = "policy" | "plate";
export type Candidate = { client_id: string; method: MatchMethod };
export type LinkDecision = { clientId: string; method: MatchMethod } | null;

/**
 * Alege clientul unei părți din candidații găsiți în baza de date (`match_party_client`).
 * Polița are prioritate: un singur client cu acel număr → legat. Mai mulți clienți = ambiguu, nu legăm nimic
 * (nici după număr, ca să nu ghicim). Fără potrivire după poliță: un singur client cu acel număr de înmatriculare.
 */
export function decideLink(candidates: Candidate[]): LinkDecision {
  const unique = (method: MatchMethod) => [...new Set(candidates.filter((c) => c.method === method).map((c) => c.client_id))];
  const byPolicy = unique("policy");
  if (byPolicy.length === 1) return { clientId: byPolicy[0], method: "policy" };
  if (byPolicy.length > 1) return null;
  const byPlate = unique("plate");
  return byPlate.length === 1 ? { clientId: byPlate[0], method: "plate" } : null;
}

type PartyKeys = {
  role: "A" | "B";
  client_id: string | null;
  vehicle: { plate?: string } | null;
  insurance: { policyNo?: string; plate?: string } | null;
};

export type LinkResult = { role: "A" | "B"; clientId: string; method: MatchMethod };

/**
 * La finalizare: completează `claim_parties.client_id` pentru părțile încă nelegate și notează în `events`.
 * Cere clientul cu service role (funcția SQL e permisă doar lui). Nu aruncă: legarea e un bonus, nu blochează dosarul.
 */
export async function linkClaimParties(db: SupabaseClient, claimId: string): Promise<LinkResult[]> {
  try {
    const [claimRes, partiesRes] = await Promise.all([
      db.from("claims").select("agency_id").eq("id", claimId).maybeSingle(),
      db.from("claim_parties").select("role, client_id, vehicle, insurance").eq("claim_id", claimId),
    ]);
    if (claimRes.error || partiesRes.error || !claimRes.data) return [];
    const agency = claimRes.data.agency_id as string;

    const linked: LinkResult[] = [];
    for (const party of (partiesRes.data ?? []) as PartyKeys[]) {
      if (party.client_id) continue;
      const plate = party.vehicle?.plate || party.insurance?.plate || null;
      const policyNo = party.insurance?.policyNo || null;
      if (!plate && !policyNo) continue;
      const { data, error } = await db.rpc("match_party_client", { p_agency: agency, p_policy_no: policyNo, p_plate: plate });
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
