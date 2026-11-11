import { CIRCUMSTANCES, IMPACT_LABELS } from "@/lib/amiabila/content";
import type { FormData, Party } from "@/lib/amiabila/form";
import type { MissingItem } from "./completeness";

/** Ce primește n8n (WF01) când un dosar e finalizat. Rămâne în rețeaua noastră; nimic din el nu pleacă spre un LLM fără redactare. */
export type ClaimCompletedPayload = {
  event: "claim.completed";
  claimId: string;
  ref: string;
  channel: string;
  occurredAt: string;
  place: string;
  /** Adresă temporară (7 zile) către PDF-ul din Storage; n8n îl atașează pe Telegram. */
  pdfUrl: string;
  appUrl: string;
  parties: Record<"A" | "B", PartySummary>;
  photoCounts: { A: number; B: number };
  hasSketch: boolean;
  missing: MissingItem[];
};

export type PartySummary = {
  driver: string;
  plate: string;
  vehicle: string;
  insurer: string;
  policyNo: string;
  impact: string;
  damage: string;
  observations: string;
  circumstances: { n: number; label: string }[];
};

function partySummary(p: Party): PartySummary {
  const labels = new Map(CIRCUMSTANCES.map((c) => [c.n, c.label]));
  return {
    driver: [p.driver.surname, p.driver.firstName].filter(Boolean).join(" "),
    plate: p.vehicle.plate,
    vehicle: p.vehicle.makeType,
    insurer: p.insurance.company,
    policyNo: p.insurance.policyNo,
    impact: p.impactPoint ? IMPACT_LABELS[p.impactPoint] : "",
    damage: p.visibleDamage,
    observations: p.observations,
    circumstances: p.circumstances.map((n) => ({ n, label: labels.get(n) ?? "" })),
  };
}

export function buildCompletedPayload(input: {
  claimId: string;
  ref: string;
  channel: string;
  occurredAt: string;
  form: FormData;
  pdfUrl: string;
  appUrl: string;
  photoCounts: { A: number; B: number };
  missing: MissingItem[];
}): ClaimCompletedPayload {
  return {
    event: "claim.completed",
    claimId: input.claimId,
    ref: input.ref,
    channel: input.channel,
    occurredAt: input.occurredAt,
    place: input.form.place,
    pdfUrl: input.pdfUrl,
    appUrl: input.appUrl,
    parties: { A: partySummary(input.form.a), B: partySummary(input.form.b) },
    photoCounts: input.photoCounts,
    hasSketch: input.form.sketch !== null,
    missing: input.missing,
  };
}

export type WebhookResult = "sent" | "skipped" | "failed";

/**
 * Anunță n8n. Fără `N8N_WEBHOOK_BASE` și `BP_WEBHOOK_SECRET` nu face nimic („skipped”); o eroare nu oprește finalizarea:
 * dosarul și PDF-ul există deja, iar brokerul îl găsește oricum în dashboard.
 */
export async function sendClaimCompleted(
  payload: ClaimCompletedPayload,
  config: { base?: string; secret?: string },
  fetcher: typeof fetch = fetch,
): Promise<WebhookResult> {
  if (!config.base || !config.secret) return "skipped";
  try {
    const res = await fetcher(`${config.base.replace(/\/$/, "")}/claim-completed`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bp-secret": config.secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
