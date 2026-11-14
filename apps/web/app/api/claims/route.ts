import { NextResponse } from "next/server";
import { JOIN_TTL_MS, createClaimSchema, documentsProblem, partyColumns } from "@/lib/amiabila/claim";
import { NOT_CONFIGURED, SERVER_ERROR, TOO_MANY, clientIp, fail, newToken } from "@/lib/claims/server";
import { createRateLimiter } from "@/lib/ai/upload";
import { identityContext, verifiedClientId } from "@/lib/identity/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const allow = createRateLimiter(10, 10 * 60_000);

/**
 * Creează dosarul din ciorna lui A: dosar (`awaiting_b`), partea A (cu `aToken`, cheia lui A pentru status)
 * și partea B (cu `joinToken`, valabil 2 ore, pentru QR). Nu avem conturi: tokenurile sunt singura cheie de acces.
 */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return TOO_MANY();

  const body = createClaimSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Cerere invalidă.", "bad_request");
  const problem = documentsProblem(body.data.documents);
  if (problem) return fail(422, problem, "incomplete");

  const db = getAdminClient();
  if (!db) return NOT_CONFIGURED();

  const { place, eligibility, documents, identityToken } = body.data;
  // Client verificat prin OTP: legătura e directă, nu prin potrivirea de la finalizare (spec 04, E). Token invalid = dosar anonim.
  const identity = identityToken ? identityContext() : null;
  const clientId = identity ? await verifiedClientId(identity, identityToken) : null;

  const claim = await db
    .from("claims")
    .insert({
      channel: "web",
      status: "awaiting_b",
      accident_at: place.occurredAt,
      location_text: place.address,
      lat: place.lat,
      lng: place.lng,
      eligibility,
    })
    .select("id, public_ref")
    .single();
  if (claim.error || !claim.data) return SERVER_ERROR();

  const aToken = newToken();
  const joinToken = newToken();
  const joinExpiresAt = new Date(Date.now() + JOIN_TTL_MS).toISOString();
  const parties = await db.from("claim_parties").insert([
    { claim_id: claim.data.id, role: "A", join_token: aToken, client_id: clientId, ...partyColumns(documents) },
    { claim_id: claim.data.id, role: "B", join_token: joinToken, token_expires_at: joinExpiresAt },
  ]);
  if (parties.error) {
    await db.from("claims").delete().eq("id", claim.data.id); // fără dosare orfane
    return SERVER_ERROR();
  }
  if (clientId) {
    await db.from("events").insert({
      entity_type: "claim",
      entity_id: claim.data.id,
      type: "client_linked",
      payload: { role: "A", client_id: clientId, method: "verified_client" },
    });
  }

  return NextResponse.json({ id: claim.data.id, ref: claim.data.public_ref, aToken, joinToken, joinExpiresAt });
}
