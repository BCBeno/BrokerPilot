import { NextResponse } from "next/server";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/upload";
import { NOT_CONFIGURED, SERVER_ERROR, TOO_MANY, clientIp, fail } from "@/lib/claims/server";
import {
  CODE_RE,
  IDENTITY_LINK_DAYS,
  OTP_MAX_ATTEMPTS,
  codeMatches,
  hashPhone,
  makeIdentityToken,
  maskPhone,
  toE164,
} from "@/lib/identity/otp";
import { vehicleCards } from "@/lib/identity/prefill";
import { accidentDay, identityContext, loadClientCar } from "@/lib/identity/server";
import { smsMode, twilioCheck } from "@/lib/identity/sms";

export const runtime = "nodejs";

const allow = createRateLimiter(10, 10 * 60_000);

const bodySchema = z.object({
  verificationId: z.uuid(),
  code: z.string().trim().regex(CODE_RE),
  occurredAt: z.string().max(40).nullish(),
});

const EXPIRED = () => fail(410, "Codul a expirat. Cereți unul nou.", "expired");

/**
 * Pasul 2: verifică codul (max. 3 încercări, 5 minute). La succes: legătura telefon → client în `client_identities`,
 * un token de identitate pentru wizard și **doar** cardurile mașinilor clientului (fără VIN, fără numărul complet al poliței).
 */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return TOO_MANY();
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Codul are 6 cifre.", "bad_code");
  const { verificationId, code, occurredAt } = body.data;

  const ctx = identityContext();
  if (!ctx) return NOT_CONFIGURED();
  const { db, secret, env } = ctx;

  const found = await db
    .from("identity_verifications")
    .select("id, client_id, status, attempts, expires_at, code_hash")
    .eq("id", verificationId)
    .maybeSingle();
  if (found.error) return SERVER_ERROR();
  const v = found.data;
  if (!v || v.status !== "pending") return EXPIRED();
  if (new Date(v.expires_at).getTime() < Date.now()) {
    await db.from("identity_verifications").update({ status: "expired" }).eq("id", v.id);
    return EXPIRED();
  }

  // Încercarea se numără înainte de verificare; condiția pe `attempts` oprește două cereri simultane să numere la fel.
  const attempts = v.attempts + 1;
  const counted = await db
    .from("identity_verifications")
    .update({ attempts, status: attempts >= OTP_MAX_ATTEMPTS ? "failed" : "pending" })
    .eq("id", v.id)
    .eq("attempts", v.attempts)
    .select("id");
  if (counted.error) return SERVER_ERROR();
  if (!counted.data?.length) return TOO_MANY();

  const car = v.client_id ? await loadClientCar(db, v.client_id) : null;
  const e164 = car?.client.phone ? toE164(car.client.phone) : null;
  let ok = false;
  if (car && e164) {
    ok = smsMode(env) === "twilio" ? await twilioCheck(env, e164, code) : !!v.code_hash && codeMatches(secret, v.id, code, v.code_hash);
  }

  if (!ok || !car || !e164) {
    const left = OTP_MAX_ATTEMPTS - attempts;
    if (left <= 0) return fail(429, "Prea multe încercări greșite. Cereți un cod nou.", "locked");
    return NextResponse.json(
      { error: `Codul nu e corect. Mai aveți ${left} ${left === 1 ? "încercare" : "încercări"}.`, code: "wrong_code", attemptsLeft: left },
      { status: 400 },
    );
  }

  const now = new Date();
  const verified = await db.from("identity_verifications").update({ status: "verified" }).eq("id", v.id);
  if (verified.error) return SERVER_ERROR();
  await Promise.all([
    db.from("client_identities").upsert(
      {
        client_id: v.client_id,
        channel: "phone",
        value_hash: hashPhone(secret, e164),
        value_masked: maskPhone(e164),
        method: "sms_otp",
        verified_at: now.toISOString(),
        expires_at: new Date(now.getTime() + IDENTITY_LINK_DAYS * 86_400_000).toISOString(),
      },
      { onConflict: "channel,value_hash" },
    ),
    db.from("events").insert({ entity_type: "client", entity_id: v.client_id, type: "identity_verified", payload: { method: "sms_otp", channel: "web" } }),
  ]);

  return NextResponse.json({
    token: makeIdentityToken(secret, v.id),
    // Numele întreg (nu ghicim care e prenumele), fără mențiuni ca „(fictiv)”.
    name: car.client.full_name.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim() || null,
    vehicles: vehicleCards(car.vehicles, car.policies, accidentDay(occurredAt)),
  });
}
