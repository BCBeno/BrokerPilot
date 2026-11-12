import { NextResponse } from "next/server";
import { isExpired, partySubmissionSchema, partyColumns, submissionProblem, type JoinInfo } from "@/lib/amiabila/claim";
import { NOT_CONFIGURED, SERVER_ERROR, TOKEN_RE, TOO_MANY, clientIp, fail } from "@/lib/claims/server";
import { createRateLimiter } from "@/lib/ai/upload";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const allow = createRateLimiter(60, 10 * 60_000);

type Ctx = { params: Promise<{ token: string }> };

const EXPIRED = () => fail(410, "Linkul a expirat. Rugați-l pe celălalt șofer să genereze unul nou.", "expired");
const NOT_FOUND = () => fail(404, "Linkul nu e valid. Cereți celuilalt șofer să vă arate din nou codul QR.", "not_found");

async function findParty(token: string) {
  const db = getAdminClient();
  if (!db) return { db: null, party: null };
  const { data } = await db
    .from("claim_parties")
    .select("id, claim_id, token_expires_at, claims(public_ref, location_text, accident_at, status)")
    .eq("join_token", token)
    .eq("role", "B")
    .maybeSingle();
  return { db, party: data };
}

/** Ce vede B când deschide linkul: doar locul și momentul accidentului, nu datele lui A. */
export async function GET(request: Request, ctx: Ctx) {
  if (!allow(clientIp(request))) return TOO_MANY();
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) return NOT_FOUND();
  const { db, party } = await findParty(token);
  if (!db) return NOT_CONFIGURED();
  if (!party) return NOT_FOUND();
  if (isExpired(party.token_expires_at, new Date())) return EXPIRED();

  const claim = Array.isArray(party.claims) ? party.claims[0] : party.claims;
  if (!claim) return SERVER_ERROR();
  const info: JoinInfo = {
    claimId: party.claim_id,
    ref: claim.public_ref,
    address: claim.location_text ?? "",
    occurredAt: claim.accident_at,
  };
  return NextResponse.json(info);
}

/** B trimite actele și circumstanțele lui. Se poate retrimite cât timp linkul e valabil. */
export async function POST(request: Request, ctx: Ctx) {
  if (!allow(clientIp(request))) return TOO_MANY();
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) return NOT_FOUND();

  const body = partySubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Cerere invalidă.", "bad_request");
  const problem = submissionProblem(body.data);
  if (problem) return fail(422, problem, "incomplete");

  const { db, party } = await findParty(token);
  if (!db) return NOT_CONFIGURED();
  if (!party) return NOT_FOUND();
  if (isExpired(party.token_expires_at, new Date())) return EXPIRED();

  const saved = await db.from("claim_parties").update(partyColumns(body.data.documents)).eq("id", party.id);
  if (saved.error) return SERVER_ERROR();
  // Ora primei bifări rămâne dovada acordului; debifarea (la o retrimitere) îl retrage.
  const consent = body.data.contactConsent;
  if (consent !== undefined) {
    const upd = db.from("claim_parties").update({ contact_consent_at: consent ? new Date().toISOString() : null }).eq("id", party.id);
    const done = consent ? await upd.is("contact_consent_at", null) : await upd;
    if (done.error) return SERVER_ERROR();
  }
  const claim = await db.from("claims").update({ circumstances_b: body.data.circumstances }).eq("id", party.claim_id);
  if (claim.error) return SERVER_ERROR();
  return NextResponse.json({ ok: true, claimId: party.claim_id });
}
