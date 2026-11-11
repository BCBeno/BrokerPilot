import { NextResponse } from "next/server";
import { claimPatchSchema, documentsProblem, partyColumns, type ClaimStatus } from "@/lib/amiabila/claim";
import { CLAIM_BUCKET, sketchPath } from "@/lib/claims/files";
import { NOT_CONFIGURED, SERVER_ERROR, authorizeA, fail } from "@/lib/claims/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const authorize = async (request: Request, ctx: Ctx) => authorizeA(request, (await ctx.params).id);

/** Starea dosarului pentru A: dacă B a trimis și până când e valabil linkul. Fără date personale. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await authorize(request, ctx);
  if (auth === "not_configured") return NOT_CONFIGURED();
  if (!auth) return fail(404, "Dosarul nu a fost găsit.", "not_found");

  const [claim, parties] = await Promise.all([
    auth.db.from("claims").select("status, pdf_path").eq("id", auth.id).single(),
    auth.db.from("claim_parties").select("role, driver, token_expires_at, signature_path").eq("claim_id", auth.id),
  ]);
  if (claim.error || parties.error) return SERVER_ERROR();
  const a = parties.data.find((p) => p.role === "A");
  const b = parties.data.find((p) => p.role === "B");
  if (!a || !b) return SERVER_ERROR();
  const status: ClaimStatus = {
    status: claim.data.status,
    bSubmitted: b.driver !== null,
    joinExpiresAt: b.token_expires_at,
    signedA: a.signature_path !== null,
    signedB: b.signature_path !== null,
    pdfReady: claim.data.pdf_path !== null,
  };
  return NextResponse.json(status);
}

/** A își actualizează actele și circumstanțele după ce dosarul există. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await authorize(request, ctx);
  if (auth === "not_configured") return NOT_CONFIGURED();
  if (!auth) return fail(404, "Dosarul nu a fost găsit.", "not_found");

  const body = claimPatchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Cerere invalidă.", "bad_request");
  const { circumstances, documents, sketch } = body.data;
  const locked = await auth.db.from("claims").select("status").eq("id", auth.id).single();
  if (locked.error) return SERVER_ERROR();
  if (locked.data.status === "submitted" || locked.data.status === "closed") return fail(409, "Dosarul a fost deja trimis.", "locked");
  if (documents) {
    const problem = documentsProblem(documents);
    if (problem) return fail(422, problem, "incomplete");
    const saved = await auth.db.from("claim_parties").update(partyColumns(documents)).eq("claim_id", auth.id).eq("role", "A");
    if (saved.error) return SERVER_ERROR();
  }
  if (circumstances) {
    const saved = await auth.db.from("claims").update({ circumstances_a: circumstances }).eq("id", auth.id);
    if (saved.error) return SERVER_ERROR();
  }
  if (sketch !== undefined) {
    // O singură schiță pe dosar: JSON în Storage + un rând în `claim_files`.
    const old = await auth.db.from("claim_files").delete().eq("claim_id", auth.id).eq("kind", "sketch");
    if (old.error) return SERVER_ERROR();
    const path = sketchPath(auth.id);
    if (sketch === null) {
      await auth.db.storage.from(CLAIM_BUCKET).remove([path]);
    } else {
      const up = await auth.db.storage
        .from(CLAIM_BUCKET)
        .upload(path, new TextEncoder().encode(JSON.stringify(sketch)), { contentType: "application/json", upsert: true });
      if (up.error) return SERVER_ERROR();
      const row = await auth.db.from("claim_files").insert({ claim_id: auth.id, party_role: "A", kind: "sketch", storage_path: path });
      if (row.error) return SERVER_ERROR();
    }
  }
  return NextResponse.json({ ok: true });
}
