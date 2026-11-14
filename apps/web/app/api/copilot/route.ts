import { NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/ai/upload";
import { getBrokerOrNull } from "@/lib/broker/session";
import { fail, NOT_CONFIGURED, TOO_MANY } from "@/lib/claims/server";
import { getServerEnv } from "@/lib/env";
import { askKb, CopilotRequestSchema } from "@/lib/kb/copilot";

export const runtime = "nodejs";

const allow = createRateLimiter(30, 10 * 60_000);

/**
 * Copilotul brokerului (spec 7.6), doar cu sesiune de broker. Răspunsul vine din WF04 (n8n), care scrie și în `ai_calls`.
 * Numele clienților agenției (RLS) se redactează din întrebare înainte să plece spre n8n și LLM.
 */
export async function POST(request: Request) {
  const session = await getBrokerOrNull();
  if (!session) return fail(401, "Autentificați-vă ca broker.", "unauthorized");
  if (!allow(session.broker.id)) return TOO_MANY();

  const parsed = CopilotRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Întrebarea trebuie să aibă între 3 și 600 de caractere.", "bad_request");

  const env = getServerEnv();
  const { data: clients } = await session.db.from("clients").select("full_name").limit(1000);
  const knownNames = (clients ?? []).map((c: { full_name: string }) => c.full_name.replace(/\s*\(fictiv\)\s*$/i, ""));

  const result = await askKb(parsed.data, { base: env.N8N_WEBHOOK_BASE, secret: env.BP_WEBHOOK_SECRET, knownNames });
  if (!result.ok) {
    return result.reason === "not_configured"
      ? NOT_CONFIGURED()
      : fail(502, "Căutarea în documente nu răspunde acum. Încercați din nou peste puțin timp.", "kb_unavailable");
  }
  return NextResponse.json(result.answer);
}
