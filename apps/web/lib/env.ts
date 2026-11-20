import { z } from "zod";

/** Variabilele de mediu din `.env.example`, validate la prima citire (server). */
const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  N8N_WEBHOOK_BASE: z.url().optional(),
  BP_WEBHOOK_SECRET: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  /** Extragerea din acte (Gemini, direct), de ex. `gemini-3.6-flash`. */
  MODEL_VISION: z.string().min(1).optional(),
  /** Text redactat (Groq), de ex. `openai/gpt-oss-20b`. */
  MODEL_TEXT: z.string().min(1).optional(),
  /** Serviciul OCR local (`infra/ocr`), de ex. `http://localhost:8080` în dev sau `http://ocr:8080` în compose. Fără el, scanurile nu se verifică. */
  OCR_URL: z.url().optional(),
  OCR_SECRET: z.string().min(1).optional(),
  AI_DAILY_BUDGET_USD: z.coerce.number().positive().default(5),
  /** OTP pe SMS (Twilio Verify). Fără ele, în dev codul apare în consola serverului. */
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().min(1).optional(),
  OTP_HASH_PEPPER: z.string().min(16).optional(),
  /** Linkurile de acces pentru brokeri, trimise pe e-mail. Fără cheie, adminul copiază linkul. */
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Expeditorul, de pe un domeniu verificat în Resend. `onboarding@resend.dev` trimite doar spre adresa contului Resend. */
  MAIL_FROM: z.string().min(3).default("BrokerPilot <onboarding@resend.dev>"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function getServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  // Șirurile goale din .env (ex. `KEY=`) sunt tratate ca lipsă.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  return serverSchema.parse(cleaned);
}
