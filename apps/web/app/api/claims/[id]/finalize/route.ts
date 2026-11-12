import { NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/ai/upload";
import { isComplete, missingItems } from "@/lib/claims/completeness";
import { CLAIM_BUCKET, pdfPath } from "@/lib/claims/files";
import { loadClaimDocument } from "@/lib/claims/form-data";
import { linkClaimParties } from "@/lib/claims/link-client";
import { PdfUnavailableError, internalBaseUrl, makeRenderKey, renderPdf } from "@/lib/claims/pdf";
import { NOT_CONFIGURED, SERVER_ERROR, TOO_MANY, authorizeA, clientIp, fail } from "@/lib/claims/server";
import { buildCompletedPayload, sendClaimCompleted, type WebhookResult } from "@/lib/claims/webhook";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
// Chromium + încărcare: poate dura câteva zeci de secunde.
export const maxDuration = 90;

const allow = createRateLimiter(6, 10 * 60_000);

type Ctx = { params: Promise<{ id: string }> };

export type FinalizeResponse = { pdfUrl: string; ref: string; webhook: WebhookResult };

const DAY = 24 * 3600;

/**
 * A finalizează dosarul după ce au semnat ambii: se generează PDF-ul (formular + anexă cu poze), dosarul trece în „submitted”
 * și n8n (WF01) e anunțat. Apelul repetat întoarce același PDF, fără să regenereze nimic.
 */
export async function POST(request: Request, ctx: Ctx) {
  if (!allow(clientIp(request))) return TOO_MANY();
  const { id } = await ctx.params;
  const auth = await authorizeA(request, id);
  if (auth === "not_configured") return NOT_CONFIGURED();
  if (!auth) return fail(404, "Dosarul nu a fost găsit.", "not_found");
  const { db } = auth;
  const env = getServerEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return NOT_CONFIGURED();

  const doc = await loadClaimDocument(db, id);
  if (!doc) return fail(404, "Dosarul nu a fost găsit.", "not_found");

  if (doc.status === "submitted" || doc.status === "closed") {
    const again = await db.storage.from(CLAIM_BUCKET).createSignedUrl(pdfPath(id), 3600);
    if (again.error) return SERVER_ERROR();
    return NextResponse.json({ pdfUrl: again.data.signedUrl, ref: doc.ref, webhook: "skipped" } satisfies FinalizeResponse);
  }

  const missing = missingItems(doc.facts);
  if (!isComplete(missing)) {
    return NextResponse.json(
      { error: "Dosarul nu e complet: lipsesc semnăturile sau datele unui șofer.", code: "incomplete", missing },
      { status: 422 },
    );
  }

  let pdf: Uint8Array;
  try {
    pdf = await renderPdf(`${internalBaseUrl()}/amiabila/pdf/${id}?k=${makeRenderKey(id, env.SUPABASE_SERVICE_ROLE_KEY)}`);
  } catch (error) {
    console.error("[finalize] PDF", error instanceof Error ? error.message : error);
    const unavailable = error instanceof PdfUnavailableError;
    return fail(503, "Nu am putut genera documentul acum. Datele și semnăturile sunt salvate; încercați din nou.", unavailable ? "pdf_unavailable" : "pdf_failed");
  }

  const path = pdfPath(id);
  const up = await db.storage.from(CLAIM_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) return SERVER_ERROR();
  const saved = await db.from("claims").update({ pdf_path: path, status: "submitted", missing_items: missing }).eq("id", id);
  if (saved.error) return SERVER_ERROR();
  // Recunoaște clienții agenției după poliță sau număr de înmatriculare (fără LLM; nu blochează finalizarea).
  await linkClaimParties(db, id);

  const [forClient, forN8n] = await Promise.all([
    db.storage.from(CLAIM_BUCKET).createSignedUrl(path, 3600),
    db.storage.from(CLAIM_BUCKET).createSignedUrl(path, 7 * DAY),
  ]);
  if (forClient.error || forN8n.error) return SERVER_ERROR();

  const webhook = await sendClaimCompleted(
    buildCompletedPayload({
      claimId: id,
      ref: doc.ref,
      channel: doc.channel,
      occurredAt: doc.form.date ? `${doc.form.date} ${doc.form.time}` : "",
      form: doc.form,
      pdfUrl: forN8n.data.signedUrl,
      appUrl: env.NEXT_PUBLIC_APP_URL,
      photoCounts: { A: doc.facts.photosA, B: doc.facts.photosB },
      missing,
    }),
    { base: env.N8N_WEBHOOK_BASE, secret: env.BP_WEBHOOK_SECRET },
  );
  if (webhook === "failed") console.error("[finalize] webhook n8n nereușit pentru", doc.ref);

  return NextResponse.json({ pdfUrl: forClient.data.signedUrl, ref: doc.ref, webhook } satisfies FinalizeResponse);
}
