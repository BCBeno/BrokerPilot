import { NextResponse } from "next/server";
import { claimPatchSchema, documentsProblem, partyColumns, type ClaimStatus } from "@/lib/amiabila/claim";
import { NOT_CONFIGURED, SERVER_ERROR, authorizeA, fail } from "@/lib/claims/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const authorize = async (request: Request, ctx: Ctx) => authorizeA(request, (await ctx.params).id);

/** Starea dosarului pentru A: dacă B a trimis și până când e valabil linkul. Fără date personale. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await authorize(request, ctx);
  if (auth === "not_configured") return NOT_CONFIGURED();
  if (!auth) return fail(404, "Dosarul nu a fost găsit.", "not_found");

  const [claim, partyB] = await Promise.all([
    auth.db.from("claims").select("status").eq("id", auth.id).single(),
    auth.db.from("claim_parties").select("driver, token_expires_at").eq("claim_id", auth.id).eq("role", "B").single(),
  ]);
  if (claim.error || partyB.error) return SERVER_ERROR();
  const status: ClaimStatus = {
    status: claim.data.status,
    bSubmitted: partyB.data.driver !== null,
    joinExpiresAt: partyB.data.token_expires_at,
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
  const { circumstances, documents } = body.data;
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
  return NextResponse.json({ ok: true });
}
