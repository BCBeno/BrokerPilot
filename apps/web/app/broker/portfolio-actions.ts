"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizeEmail, normalizePhone, normalizePlate, normalizeVin, normalizeDate } from "@/lib/amiabila/documents";
import { parsePortfolio, planImport, type ExistingPortfolio, type RowError } from "@/lib/broker/portfolio";
import { requireBroker } from "@/lib/broker/session";
import { decideLink, type Candidate } from "@/lib/claims/link-client";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string; errors: RowError[] }
  | {
      status: "done";
      totalRows: number;
      newClients: number;
      matchedClients: number;
      newVehicles: number;
      newPolicies: number;
      duplicatePolicies: number;
      errors: RowError[];
    };

const MAX_BYTES = 1024 * 1024;
const BATCH = 500;

const chunks = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / BATCH) }, (_, i) => list.slice(i * BATCH, (i + 1) * BATCH));

/**
 * Importă portofoliul din CSV: validează rândurile, recunoaște ce există deja (client, vehicul, poliță), inserează doar ce e nou.
 * Totul cu sesiunea brokerului (RLS: doar în agenția lui). Polițele importate primesc brokerul care importă.
 */
export async function importPortfolio(_prev: ImportState, form: FormData): Promise<ImportState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Alegeți un fișier CSV.", errors: [] };
  if (file.size > MAX_BYTES) return { status: "error", message: "Fișierul are peste 1 MB. Împărțiți-l în mai multe fișiere.", errors: [] };
  if (!/\.(csv|txt)$/i.test(file.name)) return { status: "error", message: "Fișierul trebuie să fie CSV (salvat din Excel ca „CSV UTF-8”).", errors: [] };

  const { db, broker } = await requireBroker();
  const parsed = parsePortfolio(await file.text());
  if (parsed.rows.length === 0) {
    return { status: "error", message: "Niciun rând nu poate fi importat.", errors: parsed.errors.slice(0, 50) };
  }

  const [clientsRes, vehiclesRes, policiesRes] = await Promise.all([
    db.from("clients").select("id, full_name, phone, email").limit(20000),
    db.from("vehicles").select("id, client_id, plate").limit(20000),
    db.from("policies").select("insurer, policy_no").limit(50000),
  ]);
  if (clientsRes.error || vehiclesRes.error || policiesRes.error) {
    return { status: "error", message: "Nu am putut citi portofoliul existent. Încercați din nou.", errors: [] };
  }
  const existing: ExistingPortfolio = {
    clients: clientsRes.data ?? [],
    vehicles: vehiclesRes.data ?? [],
    policies: policiesRes.data ?? [],
  };
  const plan = planImport(parsed.rows, existing, randomUUID);

  // Ordinea contează: polițele trimit la vehicule, vehiculele la clienți.
  const steps = [
    { table: "clients", rows: plan.clients.map((c) => ({ ...c, agency_id: broker.agency_id })) },
    { table: "vehicles", rows: plan.vehicles },
    { table: "policies", rows: plan.policies.map((p) => ({ ...p, broker_id: broker.id })) },
  ] as const;
  for (const step of steps) {
    for (const part of chunks<object>([...step.rows])) {
      const { error } = await db.from(step.table).insert(part);
      if (error) {
        console.error("[import]", step.table, error.message);
        revalidatePath("/broker", "layout");
        return {
          status: "error",
          message: "Importul s-a oprit la jumătate. Ce s-a salvat rămâne; reîncărcați același fișier, rândurile existente nu se dublează.",
          errors: [],
        };
      }
    }
  }

  revalidatePath("/broker", "layout");
  return {
    status: "done",
    totalRows: parsed.rows.length + parsed.errors.length,
    newClients: plan.clients.length,
    matchedClients: plan.matchedClients,
    newVehicles: plan.vehicles.length,
    newPolicies: plan.policies.length,
    duplicatePolicies: plan.duplicatePolicies,
    errors: [...parsed.errors, ...plan.errors].sort((a, b) => a.line - b.line).slice(0, 50),
  };
}

type PartyData = {
  client_id: string | null;
  contact_consent_at: string | null;
  driver: { fullName?: string; phone?: string; email?: string } | null;
  vehicle: { plate?: string; vin?: string; make?: string; model?: string; year?: string } | null;
  insurance: { plate?: string; insurer?: string; policyNo?: string; validFrom?: string; validTo?: string } | null;
};

export type AddToPortfolioResult = { clientId: string; created: boolean };

/**
 * „Adaugă în portofoliu” din dosar, pentru un șofer care nu era client: întâi caută un client existent (poliță, apoi număr);
 * dacă nu e, creează clientul, vehiculul și polița RCA din datele citite din actele lui. Leagă partea și notează în `events`.
 */
export async function addPartyToPortfolio(claimId: string, role: "A" | "B"): Promise<AddToPortfolioResult> {
  const id = z.uuid().parse(claimId);
  const r = z.enum(["A", "B"]).parse(role);
  const { db, broker } = await requireBroker();

  const { data } = await db.from("claim_parties").select("client_id, contact_consent_at, driver, vehicle, insurance").eq("claim_id", id).eq("role", r).maybeSingle();
  const party = data as PartyData | null;
  if (!party) throw new Error("Partea nu există în acest dosar.");
  if (party.client_id) return { clientId: party.client_id, created: false };

  const plate = normalizePlate(party.vehicle?.plate || party.insurance?.plate || "");
  const policyNo = party.insurance?.policyNo?.trim() || null;
  const link = async (clientId: string, method: "broker_added" | "broker_matched") => {
    const up = await db.from("claim_parties").update({ client_id: clientId }).eq("claim_id", id).eq("role", r).is("client_id", null);
    if (up.error) throw new Error("Nu am putut lega clientul de dosar.");
    // Acordul din rezumat ajunge pe client, fără să suprascrie unul mai vechi.
    if (party.contact_consent_at) await db.from("clients").update({ consent_gdpr_at: party.contact_consent_at }).eq("id", clientId).is("consent_gdpr_at", null);
    await db.from("events").insert({ entity_type: "claim", entity_id: id, type: "client_linked", payload: { role: r, client_id: clientId, method, broker_id: broker.id } });
    revalidatePath("/broker", "layout");
  };

  const match = await db.rpc("match_party_client", { p_agency: broker.agency_id, p_policy_no: policyNo, p_plate: plate });
  const found = match.error ? null : decideLink((match.data ?? []) as Candidate[]);
  if (found) {
    await link(found.clientId, "broker_matched");
    return { clientId: found.clientId, created: false };
  }

  const name = party.driver?.fullName?.trim();
  if (!name) throw new Error("Șoferul nu are nume în dosar; nu îl pot adăuga.");
  const clientId = randomUUID();
  const client = await db.from("clients").insert({
    id: clientId,
    agency_id: broker.agency_id,
    full_name: name,
    phone: party.driver?.phone ? normalizePhone(party.driver.phone) : null,
    email: party.driver?.email ? normalizeEmail(party.driver.email) : null,
  });
  if (client.error) throw new Error("Nu am putut crea clientul.");

  let vehicleId: string | null = null;
  if (plate) {
    vehicleId = randomUUID();
    const year = Number(party.vehicle?.year);
    const v = await db.from("vehicles").insert({
      id: vehicleId,
      client_id: clientId,
      plate,
      vin: party.vehicle?.vin ? normalizeVin(party.vehicle.vin) : null,
      make: party.vehicle?.make || null,
      model: party.vehicle?.model || null,
      year: Number.isInteger(year) && year >= 1950 && year <= 2100 ? year : null,
    });
    if (v.error) vehicleId = null;
  }

  const validFrom = normalizeDate(party.insurance?.validFrom ?? "");
  const validTo = normalizeDate(party.insurance?.validTo ?? "");
  const insurer = party.insurance?.insurer?.trim();
  if (insurer && policyNo && validFrom && validTo && validTo >= validFrom) {
    // Polița RCA a șoferului (nu e vândută de noi: fără broker). Dacă există deja la alt client, o sărim.
    await db.from("policies").insert({ client_id: clientId, vehicle_id: vehicleId, type: "RCA", insurer, policy_no: policyNo, valid_from: validFrom, valid_to: validTo });
  }

  await link(clientId, "broker_added");
  return { clientId, created: true };
}
