import { z } from "zod";
import { extractedDocSchema, normalizeExtraction, normalizePlate, type DocType, type ExtractedDoc } from "@/lib/amiabila/documents";

/**
 * Precompletarea wizardului din fișa clientului verificat (spec 04, E). Citire directă din baza de date, fără LLM.
 * Pasul 1 (după cod): doar cardurile mașinilor, cu datele sensibile mascate. Pasul 2 (după alegere): actele completate.
 */
export type VehicleRow = { id: string; plate: string; vin: string | null; make: string | null; model: string | null; year: number | null };
export type PolicyRow = { vehicle_id: string | null; type: string; insurer: string; policy_no: string; valid_from: string; valid_to: string };
export type ClientRow = { full_name: string; phone: string | null; email: string | null };

export const vehicleCardSchema = z.object({
  id: z.uuid(),
  plate: z.string(),
  title: z.string(),
  insurer: z.string().nullable(),
  policyNoMasked: z.string().nullable(),
  validTo: z.string().nullable(),
});
export type VehicleCard = z.infer<typeof vehicleCardSchema>;

/** Răspunsul după alegerea mașinii (validat și în browser, înainte să intre în ciornă). */
export const prefillSchema = z.object({
  vehicleId: z.uuid(),
  plate: z.string(),
  documents: z.object({ registration: extractedDocSchema, license: extractedDocSchema, policy: extractedDocSchema }),
});
export type Prefill = z.infer<typeof prefillSchema>;

/** Polița RCA a mașinii: cea valabilă în ziua accidentului sau, dacă nu există, cea mai recentă. */
export function pickPolicy(policies: PolicyRow[], vehicleId: string, onDay: string): PolicyRow | null {
  const rca = policies
    .filter((p) => p.vehicle_id === vehicleId && p.type === "RCA")
    .sort((a, b) => b.valid_to.localeCompare(a.valid_to));
  return rca.find((p) => p.valid_from <= onDay && onDay <= p.valid_to) ?? rca[0] ?? null;
}

/** „RO123456789” → „••••6789” (ultimele 4 cifre, ca la întrebările de control). */
export function maskPolicyNo(policyNo: string): string {
  return `••••${policyNo.replace(/\s/g, "").slice(-4)}`;
}

export function vehicleCards(vehicles: VehicleRow[], policies: PolicyRow[], onDay: string): VehicleCard[] {
  return vehicles.map((v) => {
    const p = pickPolicy(policies, v.id, onDay);
    const title = [[v.make, v.model].filter(Boolean).join(" "), v.year].filter(Boolean).join(", ");
    return {
      id: v.id,
      plate: normalizePlate(v.plate) ?? v.plate,
      title: title || "Mașina dumneavoastră",
      insurer: p?.insurer ?? null,
      policyNoMasked: p ? maskPolicyNo(p.policy_no) : null,
      validTo: p?.valid_to ?? null,
    };
  });
}

const sure = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" ? { value: null, confidence: 0 } : { value: String(value), confidence: 1 };

/**
 * Actele completate din fișă. Câmpurile din baza de date au încredere 1 (sunt date verificate de agenție), dar trec prin
 * aceiași validatori ca orice act; ce lipsește din fișă (permisul, adresa) rămâne „De completat”.
 */
export function prefillDocuments(
  client: ClientRow,
  vehicle: VehicleRow,
  policy: PolicyRow | null,
  now: Date,
): Record<DocType, ExtractedDoc> {
  const registration = normalizeExtraction(
    "registration",
    { fields: { plate: sure(vehicle.plate), vin: sure(vehicle.vin), make: sure(vehicle.make), model: sure(vehicle.model), year: sure(vehicle.year) } },
    now,
  );
  const license = normalizeExtraction(
    "license",
    { fields: { fullName: sure(client.full_name), phone: sure(client.phone), email: sure(client.email) } },
    now,
  );
  const insurance = normalizeExtraction(
    "policy",
    {
      fields: policy
        ? {
            insurer: sure(policy.insurer),
            policyNo: sure(policy.policy_no),
            validFrom: sure(policy.valid_from),
            validTo: sure(policy.valid_to),
            plate: sure(vehicle.plate),
          }
        : { plate: sure(vehicle.plate) },
    },
    now,
  );
  return { registration, license, policy: insurance };
}
