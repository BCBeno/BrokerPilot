import { getServerEnv } from "@/lib/env";
import { getAdminClient } from "@/lib/supabase/admin";
import type { ModelCall, ModelReply } from "./extract";

/**
 * Gatewayul AI al aplicației: toate apelurile LLM trec pe aici (plafon zilnic + log în `ai_calls`).
 * Redactarea PII nu se aplică extragerii vision: imaginea originală pleacă la provider, cu consimțământul
 * utilizatorului (excepția documentată în ADR). Ce NU se loghează niciodată: conținutul imaginii sau al răspunsului.
 */

export class GatewayError extends Error {
  constructor(
    readonly code: "not_configured" | "budget_exceeded" | "provider_error",
    message: string,
  ) {
    super(message);
  }
}

export async function spentTodayUsd(): Promise<number | null> {
  const db = getAdminClient();
  if (!db) return null;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await db.from("ai_calls").select("cost_usd").gte("at", start.toISOString());
  if (error || !data) return null;
  return data.reduce((sum, row: { cost_usd: number | null }) => sum + (row.cost_usd ?? 0), 0);
}

export async function assertBudget(): Promise<void> {
  const spent = await spentTodayUsd();
  if (spent !== null && spent >= getServerEnv().AI_DAILY_BUDGET_USD) {
    throw new GatewayError("budget_exceeded", "Plafonul zilnic de cost AI a fost atins.");
  }
}

type LogEntry = {
  task: string;
  model: string;
  latencyMs: number;
  success: boolean;
  error?: string;
  reply?: ModelReply;
  redacted?: boolean;
};

/** Best effort: un eșec la log nu strică fluxul utilizatorului. */
export async function logAiCall(entry: LogEntry): Promise<void> {
  const db = getAdminClient();
  if (!db) return;
  try {
    await db.from("ai_calls").insert({
      workflow: "web",
      task: entry.task,
      provider: "openrouter",
      model: entry.model,
      input_tokens: entry.reply?.inputTokens ?? null,
      output_tokens: entry.reply?.outputTokens ?? null,
      cost_usd: entry.reply?.costUsd ?? null,
      latency_ms: entry.latencyMs,
      success: entry.success,
      error: entry.error?.slice(0, 300) ?? null,
      redacted: entry.redacted ?? false,
    });
  } catch {
    /* ignorat */
  }
}

const OpenRouterUsage = (u: unknown) => (typeof u === "object" && u !== null ? (u as Record<string, unknown>) : {});

/** Apelează OpenRouter cu JSON schema strictă. Un 429 sau 5xx se reia o dată, după o scurtă pauză. */
export function openRouterCall(taskLabel: string): ModelCall {
  const env = getServerEnv();
  const model = env.MODEL_VISION;
  const key = env.OPENROUTER_API_KEY;
  if (!key || !model) throw new GatewayError("not_configured", "OPENROUTER_API_KEY sau MODEL_VISION lipsește.");

  return async ({ messages, schemaName, jsonSchema }) => {
    const started = Date.now();
    let lastStatus = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          max_tokens: 900,
          // Doar provideri care nu colectează date și care chiar suportă json_schema (ADR-0001).
          provider: { data_collection: "deny", require_parameters: true },
          response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema: jsonSchema } },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      if (!res.ok) break;
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== "string") break;
      const usage = OpenRouterUsage(body.usage);
      const reply: ModelReply = {
        text,
        inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
        outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
        costUsd: typeof usage.cost === "number" ? usage.cost : undefined,
      };
      await logAiCall({ task: taskLabel, model, latencyMs: Date.now() - started, success: true, reply });
      return reply;
    }
    await logAiCall({
      task: taskLabel,
      model,
      latencyMs: Date.now() - started,
      success: false,
      error: `HTTP ${lastStatus}`,
    });
    throw new GatewayError("provider_error", `OpenRouter a răspuns cu ${lastStatus || "eroare"}.`);
  };
}
