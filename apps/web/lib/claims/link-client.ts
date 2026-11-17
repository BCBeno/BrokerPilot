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

/** Cuvintele unui nume, fără diacritice și majuscule; doar cele de cel puțin 3 litere (fără inițiale). */
const nameTokens = (name: string | null | undefined) =>
  new Set(
    (name ?? "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 3),
  );

/** Numele șoferului și al clientului au cel puțin un cuvânt comun („BENI CIRCIU” ~ „Beni Circiu”, „Ion Popescu” ~ „POPESCU ION”). */
export function namesMatch(driverName: string | null | undefined, clientName: string | null | undefined): boolean {
  const client = nameTokens(clientName);
  return [...nameTokens(driverName)].some((t) => client.has(t));
}

/** Ce știm despre partea de legat, pentru potrivirea după telefon. */
export type PhoneCheck = {
  /** Numele șoferului (din permis sau din formular). */
  driverName: string | null;
  /** Numele clienților găsiți după telefon. */
  clientNames: Map<string, string>;
  /** Clientul deja legat pe cealaltă parte a dosarului. */
  otherClientId: string | null;
};

/**
 * Polița și numărul identifică mașina și asiguratul: rămân candidați oricum (flotă, familie: același client pe A și B e posibil).
 * Telefonul e scris de șofer și identifică o persoană, deci un candidat după telefon rămâne doar dacă numele se potrivește
 * și nu e clientul de pe cealaltă parte (un om nu conduce ambele mașini; tipic: o persoană completează ambele părți).
 */
export function trustedCandidates(candidates: Candidate[], check: PhoneCheck): Candidate[] {
  return candidates.filter(
    (c) => c.method !== "phone" || (c.client_id !== check.otherClientId && namesMatch(check.driverName, check.clientNames.get(c.client_id))),
  );
}

/** Numele clienților găsiți după telefon (pentru `trustedCandidates`). */
export async function phoneCandidateNames(db: SupabaseClient, candidates: Candidate[]): Promise<Map<string, string>> {
  const ids = [...new Set(candidates.filter((c) => c.method === "phone").map((c) => c.client_id))];
  if (ids.length === 0) return new Map();
  const { data } = await db.from("clients").select("id, full_name").in("id", ids);
  return new Map(((data ?? []) as { id: string; full_name: string }[]).map((c) => [c.id, c.full_name]));
}

type PartyKeys = {
  role: "A" | "B";
  client_id: string | null;
  driver: { phone?: string; fullName?: string } | null;
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
 * Telefonul leagă doar cu numele potrivit și nu clientul de pe cealaltă parte (`trustedCandidates`).
 * Cere clientul cu service role (funcția SQL e permisă doar lui). Nu aruncă: legarea e un bonus, nu blochează dosarul.
 */
export async function linkClaimParties(db: SupabaseClient, claimId: string): Promise<LinkResult[]> {
  try {
    const [claimRes, partiesRes] = await Promise.all([
      db.from("claims").select("id").eq("id", claimId).maybeSingle(),
      db.from("claim_parties").select("role, client_id, driver, vehicle, insurance").eq("claim_id", claimId),
    ]);
    if (claimRes.error || partiesRes.error || !claimRes.data) return [];

    const linked: LinkResult[] = [];
    const parties = ((partiesRes.data ?? []) as PartyKeys[]).sort((x, y) => x.role.localeCompare(y.role));
    const clientOf = new Map(parties.map((p) => [p.role, p.client_id]));
    for (const party of parties) {
      if (party.client_id) continue;
      const plate = party.vehicle?.plate || party.insurance?.plate || null;
      const policyNo = party.insurance?.policyNo || null;
      const phone = party.driver?.phone || null;
      if (!plate && !policyNo && !phone) continue;
      const { data, error } = await db.rpc("match_party_client", { p_policy_no: policyNo, p_plate: plate, p_phone: phone });
      if (error) {
        console.error("[link-client]", error.message);
        continue;
      }
      const found = (data ?? []) as Candidate[];
      const decision = decideLink(
        trustedCandidates(found, {
          driverName: party.driver?.fullName ?? null,
          clientNames: await phoneCandidateNames(db, found),
          otherClientId: clientOf.get(party.role === "A" ? "B" : "A") ?? null,
        }),
      );
      if (!decision) continue;
      const up = await db
        .from("claim_parties")
        .update({ client_id: decision.clientId })
        .eq("claim_id", claimId)
        .eq("role", party.role)
        .is("client_id", null);
      if (up.error) continue;
      clientOf.set(party.role, decision.clientId);
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
