import { NextResponse } from "next/server";
import { z } from "zod";
import { JOIN_TTL_MS } from "@/lib/amiabila/claim";
import { NOT_CONFIGURED, SERVER_ERROR, TOKEN_RE, fail, newToken, sameToken } from "@/lib/claims/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Link nou pentru B (cel vechi a expirat sau s-a pierdut). Cel vechi nu mai funcționează. Cheia: tokenul lui A. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = request.headers.get("x-claim-token");
  if (!z.uuid().safeParse(id).success || !token || !TOKEN_RE.test(token)) return fail(404, "Dosarul nu a fost găsit.", "not_found");
  const db = getAdminClient();
  if (!db) return NOT_CONFIGURED();

  const { data: a } = await db.from("claim_parties").select("join_token").eq("claim_id", id).eq("role", "A").maybeSingle();
  if (!a || !sameToken(a.join_token, token)) return fail(404, "Dosarul nu a fost găsit.", "not_found");

  const joinToken = newToken();
  const joinExpiresAt = new Date(Date.now() + JOIN_TTL_MS).toISOString();
  const { error } = await db
    .from("claim_parties")
    .update({ join_token: joinToken, token_expires_at: joinExpiresAt })
    .eq("claim_id", id)
    .eq("role", "B");
  return error ? SERVER_ERROR() : NextResponse.json({ joinToken, joinExpiresAt });
}
