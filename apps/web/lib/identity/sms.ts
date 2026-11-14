/**
 * Trimiterea și verificarea codului prin SMS, cu Twilio Verify (codul îl generează, îl trimite și îl păstrează Twilio).
 * Contul trial trimite doar spre numerele verificate în consola Twilio (max. 5), ceea ce ajunge pentru demo.
 *
 * Fără chei Twilio și în afara producției, modul „local”: codul îl generăm noi, salvăm doar hash-ul și îl scriem
 * în consola serverului, ca fluxul să poată fi încercat pe orice calculator.
 */
export type SmsConfig = {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
};

export type SmsMode = "twilio" | "local" | "off";

export function smsMode(env: SmsConfig, nodeEnv = process.env.NODE_ENV): SmsMode {
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID) return "twilio";
  return nodeEnv === "production" ? "off" : "local";
}

const TIMEOUT_MS = 10_000;

async function verifyApi(env: SmsConfig, path: "Verifications" | "VerificationCheck", form: Record<string, string>) {
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${path}`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; code?: number; message?: string };
  return { ok: res.ok, httpStatus: res.status, ...json };
}

/** Pornește o verificare Twilio. `false` = nu s-a trimis (numărul nu e verificat în trial, cheie greșită etc.). */
export async function twilioSend(env: SmsConfig, e164: string): Promise<boolean> {
  try {
    const r = await verifyApi(env, "Verifications", { To: e164, Channel: "sms", Locale: "ro" });
    if (!r.ok) console.error("[sms] Twilio Verify", r.httpStatus, r.code, r.message);
    return r.ok;
  } catch (error) {
    console.error("[sms] Twilio Verify", error instanceof Error ? error.message : error);
    return false;
  }
}

/** `true` doar dacă Twilio spune „approved”. Un cod greșit întoarce „pending”; o verificare expirată, 404. */
export async function twilioCheck(env: SmsConfig, e164: string, code: string): Promise<boolean> {
  try {
    const r = await verifyApi(env, "VerificationCheck", { To: e164, Code: code });
    return r.ok && r.status === "approved";
  } catch (error) {
    console.error("[sms] Twilio Verify check", error instanceof Error ? error.message : error);
    return false;
  }
}
