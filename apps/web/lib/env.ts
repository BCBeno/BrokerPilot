import { z } from "zod";

/** Variabilele de mediu din `.env.example`, validate la prima citire (server). */
const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  N8N_WEBHOOK_BASE: z.url().optional(),
  BP_WEBHOOK_SECRET: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  MODEL_VISION: z.string().min(1).optional(),
  AI_DAILY_BUDGET_USD: z.coerce.number().positive().default(5),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function getServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  // Șirurile goale din .env (ex. `KEY=`) sunt tratate ca lipsă.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  return serverSchema.parse(cleaned);
}
