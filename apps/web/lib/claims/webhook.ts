import { CIRCUMSTANCES, IMPACT_LABELS } from "@/lib/amiabila/content";
import type { FormData, Party } from "@/lib/amiabila/form";
import { summarizeClaim } from "@/lib/broker/claim-summary";
import { crossChecks } from "@/lib/broker/compare";
import { displayName, insurerName, vehicleName } from "@/lib/broker/format";
import type { MissingItem } from "./completeness";

/** Ce primește n8n (WF01) când un dosar e finalizat. Rămâne în rețeaua noastră; nimic din el nu pleacă spre un LLM fără redactare. */
export type ClaimCompletedPayload = {
  event: "claim.completed";
  claimId: string;
  ref: string;
  channel: string;
  occurredAt: string;
  place: string;
  /** Adresă temporară (7 zile) către PDF-ul din Storage; n8n îl descarcă și îl atașează pe Telegram ca `<ref>.pdf`. */
  pdfUrl: string;
  appUrl: string;
  /** Fișa dosarului în dashboard. */
  brokerUrl: string;
  parties: Record<"A" | "B", PartySummary>;
  photoCounts: { A: number; B: number };
  hasSketch: boolean;
  missing: MissingItem[];
  /** Aceeași concluzie ca în capul fișei din dashboard (lipsuri în propoziții + nepotriviri A/B). */
  conclusion: { complete: boolean; status: string[]; warnings: string[]; extras: string | null };
};

export type PartySummary = {
  driver: string;
  /** Telefon / e-mail, cum le-a scris șoferul. */
  contact: string;
  plate: string;
  vehicle: string;
  insurer: string;
  policyNo: string;
  impact: string;
  damage: string;
  observations: string;
  circumstances: { n: number; label: string }[];
  /** Numele clientului agenției, dacă șoferul a fost recunoscut; altfel `null`. */
  client: string | null;
};

function partySummary(p: Party, client: string | null): PartySummary {
  const labels = new Map(CIRCUMSTANCES.map((c) => [c.n, c.label]));
  return {
    driver: [p.driver.firstName, p.driver.surname].filter(Boolean).join(" "),
    contact: p.driver.contact,
    plate: p.vehicle.plate,
    vehicle: vehicleName(p.vehicle.makeType),
    insurer: insurerName(p.insurance.company),
    policyNo: p.insurance.policyNo,
    impact: p.impactPoint ? IMPACT_LABELS[p.impactPoint] : "",
    damage: p.visibleDamage,
    observations: p.observations,
    circumstances: p.circumstances.map((n) => ({ n, label: labels.get(n) ?? "" })),
    client: client ? displayName(client) : null,
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
  clients?: Partial<Record<"A" | "B", string | null>>;
}): ClaimCompletedPayload {
  const summary = summarizeClaim(input.missing, crossChecks(input.form));
  return {
    event: "claim.completed",
    claimId: input.claimId,
    ref: input.ref,
    channel: input.channel,
    occurredAt: input.occurredAt,
    place: input.form.place,
    pdfUrl: input.pdfUrl,
    appUrl: input.appUrl,
    brokerUrl: `${input.appUrl.replace(/\/$/, "")}/broker/dosare/${input.claimId}`,
    parties: {
      A: partySummary(input.form.a, input.clients?.A ?? null),
      B: partySummary(input.form.b, input.clients?.B ?? null),
    },
    photoCounts: input.photoCounts,
    hasSketch: input.form.sketch !== null,
    missing: input.missing,
    conclusion: { complete: summary.tone === "ok", status: summary.status, warnings: summary.warnings, extras: summary.extras },
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
