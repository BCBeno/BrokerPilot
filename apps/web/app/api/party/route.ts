import { NextResponse } from "next/server";
import type { PartyState } from "@/lib/amiabila/claim";
import { CLAIM_BUCKET } from "@/lib/claims/files";
import { EXPIRED, NOT_CONFIGURED, NOT_FOUND, SERVER_ERROR, authorizeParty } from "@/lib/claims/server";

export const runtime = "nodejs";

/** Starea șoferului care întreabă: dosarul, dacă a semnat și pozele lui (cu adrese temporare). Fără datele celuilalt șofer. */
export async function GET(request: Request) {
  const auth = await authorizeParty(request);
  if (auth === "not_configured") return NOT_CONFIGURED();
  if (auth === "expired") return EXPIRED();
  if (!auth) return NOT_FOUND();

  const [claim, party, files] = await Promise.all([
    auth.db.from("claims").select("public_ref, status").eq("id", auth.claimId).single(),
    auth.db.from("claim_parties").select("driver").eq("id", auth.partyId).single(),
    auth.db
      .from("claim_files")
      .select("id, storage_path")
      .eq("claim_id", auth.claimId)
      .eq("party_role", auth.role)
      .eq("kind", "damage")
      .order("created_at"),
  ]);
  if (claim.error || party.error || files.error) return SERVER_ERROR();

  const rows = files.data ?? [];
  const signed = rows.length
    ? await auth.db.storage.from(CLAIM_BUCKET).createSignedUrls(
        rows.map((r) => r.storage_path),
        3600,
      )
    : { data: [], error: null };
  if (signed.error) return SERVER_ERROR();
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  const state: PartyState = {
    role: auth.role,
    claimId: auth.claimId,
    ref: claim.data.public_ref,
    status: claim.data.status,
    submitted: auth.role === "A" || party.data.driver !== null,
    signed: auth.signaturePath !== null,
    photos: rows.flatMap((r) => (urls.get(r.storage_path) ? [{ id: r.id as string, url: urls.get(r.storage_path)! }] : [])),
  };
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}
