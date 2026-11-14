import { NextResponse } from "next/server";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/upload";
import { NOT_CONFIGURED, SERVER_ERROR, TOO_MANY, clientIp, fail } from "@/lib/claims/server";
import { OTP_TTL_MS, generateCode, hashCode, maskPhone, toE164, toLocalDigits } from "@/lib/identity/otp";
import { identityContext } from "@/lib/identity/server";
import { smsMode, twilioSend } from "@/lib/identity/sms";

export const runtime = "nodejs";

const allowIp = createRateLimiter(5, 10 * 60_000);
const allowPhone = createRateLimiter(3, 10 * 60_000);

const bodySchema = z.object({ phone: z.string().max(30) });

/**
 * Pasul 1 al OTP-ului din wizard: „Sunteți deja client al agenției?”. Răspunsul e același dacă numărul e sau nu în fișele
 * agenției (spec: mesajele nu dezvăluie dacă există un cont); pentru un număr necunoscut se creează o verificare fără client,
 * pe care niciun cod nu o deblochează, iar SMS-ul nu pleacă.
 */
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const e164 = body.success ? toE164(body.data.phone) : null;
  if (!e164) return fail(400, "Numărul nu pare corect. Scrieți-l ca pe telefon, de ex. 0722 123 456.", "bad_phone");
  if (!allowIp(clientIp(request)) || !allowPhone(e164)) return TOO_MANY();

  const ctx = identityContext();
  if (!ctx) return NOT_CONFIGURED();
  const mode = smsMode(ctx.env);
  if (mode === "off") return NOT_CONFIGURED();

  const local = toLocalDigits(e164);
  const found = await ctx.db.from("clients").select("id").eq("phone", local ?? e164).limit(2);
  if (found.error) return SERVER_ERROR();
  // Doi clienți cu același număr: nu ghicim care e (ca la legarea automată).
  const clientId = found.data?.length === 1 ? (found.data[0].id as string) : null;

  const masked = maskPhone(e164);
  const row = await ctx.db
    .from("identity_verifications")
    .insert({
      client_id: clientId,
      channel: "phone",
      destination_masked: masked,
      method: "sms_otp",
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (row.error || !row.data) return SERVER_ERROR();
  const verificationId = row.data.id as string;

  if (!clientId) {
    // Doar în log: clientul vede același mesaj, ca să nu afle cine e în fișele agenției.
    console.info(`[otp] ${masked}: ${found.data?.length ? "mai mulți clienți" : "niciun client"} cu acest număr, SMS-ul nu pleacă`);
  } else if (mode === "twilio") {
    // Un eșec (de ex. numărul nu e verificat în contul trial) rămâne în log; clientului îi răspundem la fel.
    await twilioSend(ctx.env, e164);
  } else if (mode === "local") {
    const code = generateCode();
    const saved = await ctx.db
      .from("identity_verifications")
      .update({ code_hash: hashCode(ctx.secret, verificationId, code) })
      .eq("id", verificationId);
    if (saved.error) return SERVER_ERROR();
    console.info(`[otp] mod local (fără Twilio): codul pentru ${masked} este ${code}`);
  }

  return NextResponse.json({ verificationId, masked, local: mode === "local" });
}
