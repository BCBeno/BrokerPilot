import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDate, normalizeEmail, normalizePhone, normalizePlate, normalizeVin } from "@/lib/amiabila/documents";
import { decideLink, type Candidate } from "@/lib/claims/link-client";

type PartyData = {
  client_id: string | null;
  contact_consent_at: string | null;
  driver: { fullName?: string; phone?: string; email?: string } | null;
  vehicle: { plate?: string; vin?: string; make?: string; model?: string; year?: string } | null;
  insurance: { plate?: string; insurer?: string; policyNo?: string; validFrom?: string; validTo?: string } | null;
};

/** Cine a făcut adăugarea: brokerul din dosar sau șoferul însuși (a bifat acordul de contact și și-a scanat polița). */
export type PortfolioActor = { kind: "broker"; brokerId: string } | { kind: "consent" };

export type PortfolioResult = { clientId: string; created: boolean };

/**
 * Pune șoferul unei părți din dosar în portofoliul agenției: întâi caută un client existent (poliță, apoi număr, apoi telefon);
 * dacă nu e, creează clientul, vehiculul și polița din actele lui. Pe un client recunoscut după poliță sau număr adaugă
 * vehiculul și polița citite, dacă lipsesc (așa o poliță nouă o înlocuiește pe cea veche în Reînnoiri).
 * Polița nu e vândută de noi: fără broker. Leagă partea și scrie `client_linked` în `events`.
 * `db` trebuie să poată scrie peste RLS (service role) sau să fie sesiunea brokerului, care are drepturile necesare.
 */
export async function addPartyToPortfolio(
  db: SupabaseClient,
  args: { agencyId: string; claimId: string; role: "A" | "B"; actor: PortfolioActor },
): Promise<PortfolioResult | null> {
  const { agencyId, claimId, role, actor } = args;
  const { data } = await db.from("claim_parties").select("client_id, contact_consent_at, driver, vehicle, insurance").eq("claim_id", claimId).eq("role", role).maybeSingle();
  const party = data as PartyData | null;
  if (!party) throw new Error("Partea nu există în acest dosar.");
  if (party.client_id) return { clientId: party.client_id, created: false };

  const plate = normalizePlate(party.vehicle?.plate || party.insurance?.plate || "");
  const policyNo = party.insurance?.policyNo?.trim() || null;

  const link = async (clientId: string, method: string) => {
    const up = await db.from("claim_parties").update({ client_id: clientId }).eq("claim_id", claimId).eq("role", role).is("client_id", null);
    if (up.error) throw new Error("Nu am putut lega clientul de dosar.");
    // Acordul din rezumat ajunge pe client, fără să suprascrie unul mai vechi.
    if (party.contact_consent_at) await db.from("clients").update({ consent_gdpr_at: party.contact_consent_at }).eq("id", clientId).is("consent_gdpr_at", null);
    const payload: Record<string, unknown> = { role, client_id: clientId, method };
    if (actor.kind === "broker") payload.broker_id = actor.brokerId;
    await db.from("events").insert({ entity_type: "claim", entity_id: claimId, type: "client_linked", payload });
  };

  /** Vehiculul clientului după număr (îl creează dacă lipsește și numărul nu e al altui client) și polița, dacă e completă și nouă. */
  const addVehicleAndPolicy = async (clientId: string): Promise<boolean> => {
    let vehicleId: string | null = null;
    if (plate) {
      const found = await db.from("vehicles").select("id, client_id, clients!inner(agency_id)").eq("plate", plate).eq("clients.agency_id", agencyId).limit(1);
      const row = (found.data?.[0] ?? null) as { id: string; client_id: string } | null;
      if (row) {
        vehicleId = row.client_id === clientId ? row.id : null;
      } else {
        const id = randomUUID();
        const year = Number(party.vehicle?.year);
        const v = await db.from("vehicles").insert({
          id,
          client_id: clientId,
          plate,
          vin: party.vehicle?.vin ? normalizeVin(party.vehicle.vin) : null,
          make: party.vehicle?.make || null,
          model: party.vehicle?.model || null,
          year: Number.isInteger(year) && year >= 1950 && year <= 2100 ? year : null,
        });
        vehicleId = v.error ? null : id;
      }
    }
    const validFrom = normalizeDate(party.insurance?.validFrom ?? "");
    const validTo = normalizeDate(party.insurance?.validTo ?? "");
    const insurer = party.insurance?.insurer?.trim();
    if (insurer && policyNo && validFrom && validTo && validTo >= validFrom) {
      // Dacă (asigurător, număr) există deja, inserarea e refuzată de indexul unic și o sărim.
      const ins = await db.from("policies").insert({ client_id: clientId, vehicle_id: vehicleId, type: "RCA", insurer, policy_no: policyNo, valid_from: validFrom, valid_to: validTo });
      return !ins.error;
    }
    return false;
  };

  /** Datele vin de la o persoană neverificată: brokerul le confirmă dintr-un clic („De verificat”). */
  const flagForReview = async (clientId: string) => {
    if (actor.kind === "consent") await db.from("clients").update({ needs_review: true }).eq("id", clientId);
  };

  const match = await db.rpc("match_party_client", { p_agency: agencyId, p_policy_no: policyNo, p_plate: plate, p_phone: party.driver?.phone || null });
  // Dacă potrivirea a eșuat nu știm dacă există deja: nu creăm (ar putea ieși un duplicat).
  if (match.error) return null;
  const candidates = (match.data ?? []) as Candidate[];
  const found = decideLink(candidates);
  if (found) {
    // Telefonul e scris de mână: nu adăugăm vehicule și polițe pe baza lui.
    if (found.method !== "phone" && (await addVehicleAndPolicy(found.clientId))) await flagForReview(found.clientId);
    await link(found.clientId, actor.kind === "broker" ? "broker_matched" : found.method === "phone" ? "phone" : "policy_scanned");
    return { clientId: found.clientId, created: false };
  }
  // Candidați ambigui (poliță sau număr la mai mulți clienți): fără creare automată, ca să nu dublăm.
  if (candidates.length > 0) return null;

  const name = party.driver?.fullName?.trim();
  if (!name) {
    if (actor.kind === "broker") throw new Error("Șoferul nu are nume în dosar; nu îl pot adăuga.");
    return null;
  }
  const clientId = randomUUID();
  const client = await db.from("clients").insert({
    id: clientId,
    agency_id: agencyId,
    full_name: name,
    phone: party.driver?.phone ? normalizePhone(party.driver.phone) : null,
    email: party.driver?.email ? normalizeEmail(party.driver.email) : null,
    needs_review: actor.kind === "consent",
  });
  if (client.error) throw new Error("Nu am putut crea clientul.");

  await addVehicleAndPolicy(clientId);
  await link(clientId, actor.kind === "broker" ? "broker_added" : "consent_added");
  return { clientId, created: true };
}

/**
 * La finalizare, înainte de legarea automată: șoferii care au bifat acordul de contact intră singuri în portofoliu
 * (clientul, vehiculul și polița din actele scanate), deci polița lor apare în Reînnoiri. Nu aruncă și nu blochează dosarul.
 */
export async function addConsentingPartiesToPortfolio(db: SupabaseClient, claimId: string): Promise<{ role: "A" | "B"; clientId: string; created: boolean }[]> {
  const out: { role: "A" | "B"; clientId: string; created: boolean }[] = [];
  try {
    const [claimRes, partiesRes] = await Promise.all([
      db.from("claims").select("agency_id").eq("id", claimId).maybeSingle(),
      db.from("claim_parties").select("role, client_id, contact_consent_at").eq("claim_id", claimId),
    ]);
    if (claimRes.error || partiesRes.error || !claimRes.data) return out;
    for (const p of (partiesRes.data ?? []) as { role: "A" | "B"; client_id: string | null; contact_consent_at: string | null }[]) {
      if (p.client_id || !p.contact_consent_at) continue;
      try {
        const res = await addPartyToPortfolio(db, { agencyId: claimRes.data.agency_id as string, claimId, role: p.role, actor: { kind: "consent" } });
        if (res) out.push({ role: p.role, ...res });
      } catch (error) {
        console.error("[portfolio-consent]", p.role, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error("[portfolio-consent]", error instanceof Error ? error.message : error);
  }
  return out;
}
