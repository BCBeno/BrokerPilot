"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parsePortfolio, planImport, type ExistingPortfolio, type RowError } from "@/lib/broker/portfolio";
import { requireBroker } from "@/lib/broker/session";
import { addPartyToPortfolio as addPartyToPortfolioDb } from "@/lib/claims/portfolio-from-party";

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

export type AddToPortfolioResult = { clientId: string; created: boolean };

/**
 * „Adaugă în portofoliu” din dosar, pentru un șofer care nu era client (logica e în `lib/claims/portfolio-from-party.ts`,
 * aceeași pe care o rulează finalizarea pentru cine a bifat acordul de contact). Cu sesiunea brokerului, deci prin RLS.
 */
export async function addPartyToPortfolio(claimId: string, role: "A" | "B"): Promise<AddToPortfolioResult> {
  const id = z.uuid().parse(claimId);
  const r = z.enum(["A", "B"]).parse(role);
  const { db, broker } = await requireBroker();
  const res = await addPartyToPortfolioDb(db, { agencyId: broker.agency_id, claimId: id, role: r, actor: { kind: "broker", brokerId: broker.id } });
  if (!res) throw new Error("Clientul nu se poate identifica sigur (poliță sau număr la mai mulți clienți). Legați-l manual.");
  revalidatePath("/broker", "layout");
  return res;
}
