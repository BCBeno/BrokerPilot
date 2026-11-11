import { NextResponse } from "next/server";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/upload";
import { CLAIM_BUCKET, parseSignature, signaturePath } from "@/lib/claims/files";
import { EXPIRED, NOT_CONFIGURED, NOT_FOUND, SERVER_ERROR, TOO_MANY, authorizeParty, clientIp, fail } from "@/lib/claims/server";

export const runtime = "nodejs";

const allow = createRateLimiter(30, 10 * 60_000);

const bodySchema = z.object({ signature: z.string().max(400_000) });

/** Un șofer își depune semnătura (PNG desenat pe ecran). Când au semnat ambii, dosarul trece în „signed”. */
export async function PUT(request: Request) {
  if (!allow(clientIp(request))) return TOO_MANY();
  const auth = await authorizeParty(request);
  if (auth === "not_configured") return NOT_CONFIGURED();
  if (auth === "expired") return EXPIRED();
  if (!auth) return NOT_FOUND();

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const bytes = body.success ? parseSignature(body.data.signature) : null;
  if (!bytes) return fail(400, "Semnătura nu a putut fi citită. Semnați din nou.", "bad_request");

  const [claim, party] = await Promise.all([
    auth.db.from("claims").select("status").eq("id", auth.claimId).single(),
    auth.db.from("claim_parties").select("driver").eq("id", auth.partyId).single(),
  ]);
  if (claim.error || party.error) return SERVER_ERROR();
  if (claim.data.status === "submitted" || claim.data.status === "closed") return fail(409, "Dosarul a fost deja trimis.", "locked");
  if (party.data.driver === null) return fail(422, "Trimiteți mai întâi datele, apoi semnați.", "not_submitted");

  const path = signaturePath(auth.claimId, auth.role);
  const up = await auth.db.storage.from(CLAIM_BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true });
  if (up.error) return SERVER_ERROR();
  const saved = await auth.db.from("claim_parties").update({ signature_path: path }).eq("id", auth.partyId);
  if (saved.error) return SERVER_ERROR();

  const signed = await auth.db.from("claim_parties").select("id", { count: "exact", head: true }).eq("claim_id", auth.claimId).not("signature_path", "is", null);
  const both = !signed.error && (signed.count ?? 0) === 2;
  if (both) await auth.db.from("claims").update({ status: "signed" }).eq("id", auth.claimId).in("status", ["draft", "awaiting_b"]);
  return NextResponse.json({ ok: true, bothSigned: both });
}
