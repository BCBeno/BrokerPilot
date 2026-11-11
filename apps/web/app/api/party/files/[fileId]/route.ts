import { NextResponse } from "next/server";
import { z } from "zod";
import { CLAIM_BUCKET } from "@/lib/claims/files";
import { EXPIRED, NOT_CONFIGURED, NOT_FOUND, SERVER_ERROR, authorizeParty, fail } from "@/lib/claims/server";

export const runtime = "nodejs";

/** Un șofer își șterge una dintre pozele lui (nu le poate atinge pe ale celuilalt). */
export async function DELETE(request: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const auth = await authorizeParty(request);
  if (auth === "not_configured") return NOT_CONFIGURED();
  if (auth === "expired") return EXPIRED();
  if (!auth) return NOT_FOUND();

  const { fileId } = await ctx.params;
  if (!z.uuid().safeParse(fileId).success) return NOT_FOUND();

  const claim = await auth.db.from("claims").select("status").eq("id", auth.claimId).single();
  if (claim.error) return SERVER_ERROR();
  if (claim.data.status === "submitted" || claim.data.status === "closed") return fail(409, "Dosarul a fost deja trimis.", "locked");

  const file = await auth.db
    .from("claim_files")
    .select("id, storage_path")
    .eq("id", fileId)
    .eq("claim_id", auth.claimId)
    .eq("party_role", auth.role)
    .eq("kind", "damage")
    .maybeSingle();
  if (file.error) return SERVER_ERROR();
  if (!file.data) return NOT_FOUND();

  const removed = await auth.db.from("claim_files").delete().eq("id", fileId);
  if (removed.error) return SERVER_ERROR();
  await auth.db.storage.from(CLAIM_BUCKET).remove([file.data.storage_path]);
  return NextResponse.json({ ok: true });
}
