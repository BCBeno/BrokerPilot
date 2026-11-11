import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";

/** Token opac (24 de caractere URL-safe, 144 de biți). Cheia lui A pentru status și linkul lui B sunt astfel de tokenuri. */
export const newToken = () => randomBytes(18).toString("base64url");

/** Tokenurile au forma de mai sus; orice altceva e respins înainte să ajungă la baza de date. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;

export function sameToken(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status });

export const clientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

export const NOT_CONFIGURED = () => fail(503, "Serviciul nu e disponibil acum. Încercați din nou în câteva minute.", "not_configured");
export const SERVER_ERROR = () => fail(500, "A apărut o eroare. Încercați din nou.", "internal");
export const TOO_MANY = () => fail(429, "Prea multe încercări. Încercați din nou peste câteva minute.", "rate_limited");

/** Cheia lui A: tokenul din antetul `x-claim-token`, comparat cu cel al părții A. Orice nepotrivire = `null` (rutele răspund 404, fără să confirme că dosarul există). */
export async function authorizeA(request: Request, id: string) {
  const token = request.headers.get("x-claim-token");
  if (!z.uuid().safeParse(id).success || !token || !TOKEN_RE.test(token)) return null;
  const db = getAdminClient();
  if (!db) return "not_configured" as const;
  const { data } = await db.from("claim_parties").select("join_token").eq("claim_id", id).eq("role", "A").maybeSingle();
  return data && sameToken(data.join_token, token) ? { db, id } : null;
}
