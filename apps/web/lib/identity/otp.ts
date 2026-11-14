import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "@/lib/amiabila/documents";

/**
 * Regulile OTP din spec (04, D): 6 cifre, expiră în 5 minute, maximum 3 încercări; în baza de date stă doar hash-ul codului
 * (cu Twilio Verify nici atât: codul îl generează și îl păstrează Twilio). După verificare, wizardul primește un token
 * semnat, valabil 2 ore, cu care cere datele mașinii alese și cu care se leagă dosarul de client.
 */
export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 3;
export const IDENTITY_TTL_MS = 2 * 60 * 60_000;
/** Legătura număr de telefon → client din `client_identities` (spec: 90 de zile). */
export const IDENTITY_LINK_DAYS = 90;

export const CODE_RE = /^\d{6}$/;

/** „0722 123 456” / „+40722123456” → „+40722123456” (E.164, cum cere Twilio). `null` dacă nu e un număr valid. */
export function toE164(raw: string): string | null {
  const normalized = normalizePhone(raw);
  if (!normalized) return null;
  if (normalized.startsWith("+")) return normalized;
  return `+40${normalized.replace(/\s/g, "").slice(1)}`;
}

/** Forma în care e salvat telefonul în `clients.phone` (10 cifre, „0722123456”); `null` pentru numerele din afara României. */
export function toLocalDigits(e164: string): string | null {
  return /^\+40\d{9}$/.test(e164) ? `0${e164.slice(3)}` : null;
}

/** „+40722123456” → „07•• ••• 456”: destul cât omul să-și recunoască numărul, nu cât să-l afle altcineva. */
export function maskPhone(e164: string): string {
  const local = toLocalDigits(e164) ?? e164;
  return `${local.slice(0, 2)}•• ••• ${local.slice(-3)}`;
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const hmac = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("base64url");

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Hash-ul codului, legat de verificarea lui (același cod la altă verificare dă alt hash). */
export const hashCode = (secret: string, verificationId: string, code: string) => hmac(secret, `otp:${verificationId}:${code}`);

export const codeMatches = (secret: string, verificationId: string, code: string, storedHash: string) =>
  same(hashCode(secret, verificationId, code), storedHash);

/** Hash-ul numărului pentru `client_identities.value_hash` (căutăm după el, fără să păstrăm numărul în clar a doua oară). */
export const hashPhone = (secret: string, e164: string) => hmac(secret, `phone:${e164}`);

/**
 * Secretul pentru hash-uri și tokenuri: `OTP_HASH_PEPPER` sau, dacă lipsește, unul derivat din cheia service role
 * (tot un secret al serverului, deci nimeni din afară nu îl poate reproduce). `null` = serverul nu e configurat.
 */
export function otpSecret(env: { OTP_HASH_PEPPER?: string; SUPABASE_SERVICE_ROLE_KEY?: string }): string | null {
  if (env.OTP_HASH_PEPPER) return env.OTP_HASH_PEPPER;
  if (env.SUPABASE_SERVICE_ROLE_KEY) return hmac(env.SUPABASE_SERVICE_ROLE_KEY, "bp-otp-pepper");
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Token de identitate: `<verificationId>.<expirare>.<semnătură>`. Clientul îl ține în ciornă; serverul îl verifică la fiecare cerere. */
export function makeIdentityToken(secret: string, verificationId: string, now = Date.now()): string {
  const exp = now + IDENTITY_TTL_MS;
  return `${verificationId}.${exp}.${hmac(secret, `id:${verificationId}:${exp}`)}`;
}

/** Întoarce `verificationId` dacă tokenul e al nostru și încă valabil; altfel `null`. */
export function readIdentityToken(secret: string, token: unknown, now = Date.now()): string | null {
  if (typeof token !== "string") return null;
  const m = /^([0-9a-f-]{36})\.(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m || !UUID_RE.test(m[1])) return null;
  const exp = Number(m[2]);
  if (!Number.isFinite(exp) || exp < now) return null;
  return same(hmac(secret, `id:${m[1]}:${exp}`), m[3]) ? m[1] : null;
}
