import { NextResponse } from "next/server";
import { CLAIM_BUCKET, pdfPath } from "@/lib/claims/files";
import { NOT_CONFIGURED, SERVER_ERROR, authorizeA, fail } from "@/lib/claims/server";

export const runtime = "nodejs";

/** Adresă nouă (1 oră) către PDF-ul dosarului, pentru A, dacă dosarul a fost finalizat. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeA(request, (await ctx.params).id);
  if (auth === "not_configured") return NOT_CONFIGURED();
  if (!auth) return fail(404, "Dosarul nu a fost găsit.", "not_found");
  const claim = await auth.db.from("claims").select("pdf_path").eq("id", auth.id).single();
  if (claim.error) return SERVER_ERROR();
  if (!claim.data.pdf_path) return fail(404, "Documentul nu e gata încă.", "not_ready");
  const signed = await auth.db.storage.from(CLAIM_BUCKET).createSignedUrl(pdfPath(auth.id), 3600);
  if (signed.error) return SERVER_ERROR();
  return NextResponse.json({ url: signed.data.signedUrl });
}
