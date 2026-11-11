import { NextResponse } from "next/server";
import { documentsFromColumns, type PartyBResponse } from "@/lib/amiabila/claim";
import { draftSchema } from "@/lib/amiabila/draft";
import { NOT_CONFIGURED, SERVER_ERROR, authorizeA, fail } from "@/lib/claims/server";

export const runtime = "nodejs";

/**
 * Datele pe care B le-a trimis, pentru formularul lui A (coloana B). Sunt datele din constatarea amiabilă,
 * pe care ambele părți le văd oricum pe document. Cheia: tokenul lui A.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeA(request, (await ctx.params).id);
  if (auth === "not_configured") return NOT_CONFIGURED();
  if (!auth) return fail(404, "Dosarul nu a fost găsit.", "not_found");

  const [party, claim] = await Promise.all([
    auth.db
      .from("claim_parties")
      .select("driver, vehicle, insurance, extraction_confidence")
      .eq("claim_id", auth.id)
      .eq("role", "B")
      .single(),
    auth.db.from("claims").select("circumstances_b").eq("id", auth.id).single(),
  ]);
  if (party.error || claim.error) return SERVER_ERROR();

  const documents = documentsFromColumns(party.data);
  const circumstances = draftSchema.shape.circumstances.safeParse(claim.data.circumstances_b);
  const body: PartyBResponse =
    documents && circumstances.success ? { submitted: true, documents, circumstances: circumstances.data } : { submitted: false };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
