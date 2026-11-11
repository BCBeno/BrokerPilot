import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/ai/upload";
import { CLAIM_BUCKET, MAX_PHOTOS_PER_PARTY, MAX_PHOTO_BYTES, isJpeg, photoPath } from "@/lib/claims/files";
import { EXPIRED, NOT_CONFIGURED, NOT_FOUND, SERVER_ERROR, TOO_MANY, authorizeParty, clientIp, fail } from "@/lib/claims/server";

export const runtime = "nodejs";

const allow = createRateLimiter(40, 10 * 60_000);

/** Un șofer încarcă o poză cu daunele (JPEG, deja comprimat pe telefon). */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return TOO_MANY();
  const auth = await authorizeParty(request);
  if (auth === "not_configured") return NOT_CONFIGURED();
  if (auth === "expired") return EXPIRED();
  if (!auth) return NOT_FOUND();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "Cerere invalidă.", "bad_request");
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) return fail(413, "Poza e prea mare. Încercați din nou.", "too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isJpeg(bytes)) return fail(415, "Poza nu are un format acceptat.", "bad_type");

  const claim = await auth.db.from("claims").select("status").eq("id", auth.claimId).single();
  if (claim.error) return SERVER_ERROR();
  if (claim.data.status === "submitted" || claim.data.status === "closed") {
    return fail(409, "Dosarul a fost deja trimis.", "locked");
  }

  const count = await auth.db
    .from("claim_files")
    .select("id", { count: "exact", head: true })
    .eq("claim_id", auth.claimId)
    .eq("party_role", auth.role)
    .eq("kind", "damage");
  if (count.error) return SERVER_ERROR();
  if ((count.count ?? 0) >= MAX_PHOTOS_PER_PARTY) {
    return fail(422, `Puteți încărca cel mult ${MAX_PHOTOS_PER_PARTY} poze.`, "too_many");
  }

  const id = randomUUID();
  const path = photoPath(auth.claimId, auth.role, id);
  const up = await auth.db.storage.from(CLAIM_BUCKET).upload(path, bytes, { contentType: "image/jpeg" });
  if (up.error) return SERVER_ERROR();
  const row = await auth.db
    .from("claim_files")
    .insert({ id, claim_id: auth.claimId, party_role: auth.role, kind: "damage", storage_path: path });
  if (row.error) {
    await auth.db.storage.from(CLAIM_BUCKET).remove([path]);
    return SERVER_ERROR();
  }
  return NextResponse.json({ id }, { status: 201 });
}
