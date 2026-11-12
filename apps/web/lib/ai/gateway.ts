import { getServerEnv } from "@/lib/env";
import { getAdminClient } from "@/lib/supabase/admin";
import type { ModelCall, ModelReply } from "./extract";
import { estimateCostUsd } from "./pricing";

/**
 * Gatewayul AI al aplicației: toate apelurile LLM trec pe aici (plafon zilnic + log în `ai_calls`).
 * Două provideri, ambii cu API compatibil OpenAI și JSON schema strictă:
 *   - Gemini (direct): extragerea din acte cu imagini (`visionCall`), cea mai bună acuratețe la testul pe acte SPECIMEN;
 *   - Groq: text (`textCall`), de exemplu pasul AI al verificatorului, pe text deja redactat.
 * Redactarea PII nu se aplică extragerii vision: imaginea originală pleacă la provider, cu consimțământul
 * utilizatorului (excepția documentată în ADR). Ce NU se loghează niciodată: conținutul imaginii sau al răspunsului.
 */

export class GatewayError extends Error {
  constructor(
    readonly code: "not_configured" | "budget_exceeded" | "provider_error",
    message: string,
    /** Codul HTTP al providerului (200 = răspuns fără conținut). */
    readonly status?: number,
  ) {
    super(message);
  }
}

export type Provider = "groq" | "gemini";

const ENDPOINTS: Record<Provider, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

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
  provider: Provider;
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
      provider: entry.provider,
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

export type CallOptions = {
  provider: Provider;
  model: string;
  /** Plafonul tokenilor generați. Tokenii de raționament îl consumă: fără limită suficientă, un model „thinking” poate lăsa răspunsul gol. */
  maxTokens?: number;
  /** Textul trimis a trecut prin `redact()`: se scrie în `ai_calls.redacted`. */
  redacted?: boolean;
  /** Efortul de raționament (`reasoning_effort`). La Groq se aplică doar modelelor gpt-oss; acolo „minimal” devine „low”. */
  reasoningEffort?: "minimal" | "low";
  /** Câte încercări la 429/5xx (implicit 2, cu pauză între ele). Cu 1, eșecul trece imediat mai departe (de exemplu la un model de rezervă). */
  attempts?: number;
  /** Timpul maxim al unei cereri (implicit 45 s). */
  timeoutMs?: number;
};

const asRecord = (u: unknown) => (typeof u === "object" && u !== null ? (u as Record<string, unknown>) : {});

function requestBody(options: CallOptions, request: Parameters<ModelCall>[0]) {
  const { provider, model, maxTokens = 2000, reasoningEffort } = options;
  const reasoning =
    provider === "gemini"
      ? reasoningEffort
        ? { reasoning_effort: reasoningEffort }
        : {}
      : reasoningEffort && model.includes("gpt-oss")
        ? { reasoning_effort: "low" }
        : {};
  return {
    model,
    messages: request.messages,
    temperature: 0,
    ...(provider === "groq" ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    ...reasoning,
    response_format: { type: "json_schema", json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema } },
  };
}

/** Pauza înainte de reîncercare: `retry-after` (secunde) dacă providerul îl trimite, dar cel mult 4 s; altfel 1,2 s. */
const backoffMs = (res: Response, attempt: number) => {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 4) * 1000 : 1200 * (attempt + 1);
};

/** Apelează providerul cu JSON schema strictă. Un 429 sau 5xx se reia o dată, după o scurtă pauză. */
export function llmCall(taskLabel: string, options: CallOptions): ModelCall {
  const env = getServerEnv();
  const { provider, model } = options;
  const key = provider === "groq" ? env.GROQ_API_KEY : env.GEMINI_API_KEY;
  if (!key || !model) throw new GatewayError("not_configured", `${provider === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY"} sau modelul lipsește.`);
  const redacted = options.redacted ?? false;
  const attempts = Math.max(1, options.attempts ?? 2);

  return async (request) => {
    const started = Date.now();
    let lastStatus = 0;
    let emptyReason = "";
    for (let attempt = 0; attempt < attempts; attempt++) {
      let res: Response;
      try {
        res = await fetch(ENDPOINTS[provider], {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(requestBody(options, request)),
          signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
        });
      } catch {
        // Timeout sau eroare de rețea: tratată ca eroare trecătoare a providerului (status 0 = fără răspuns).
        lastStatus = 0;
        if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, backoffMs(res, attempt)));
        continue;
      }
      if (!res.ok) break;
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; usage?: unknown };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== "string") {
        // 200 fără text: de obicei raționamentul a consumat tot `max_tokens` (finish_reason „length”).
        emptyReason = `fără conținut (${body.choices?.[0]?.finish_reason ?? "fără finish_reason"})`;
        break;
      }
      const usage = asRecord(body.usage);
      const inputTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
      const outputTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined;
      const reply: ModelReply = { text, inputTokens, outputTokens, costUsd: estimateCostUsd(model, inputTokens, outputTokens) };
      await logAiCall({ task: taskLabel, provider, model, latencyMs: Date.now() - started, success: true, reply, redacted });
      return reply;
    }
    await logAiCall({
      task: taskLabel,
      provider,
      model,
      latencyMs: Date.now() - started,
      success: false,
      error: `HTTP ${lastStatus}${emptyReason ? `, ${emptyReason}` : ""}`,
      redacted,
    });
    throw new GatewayError(
      "provider_error",
      `Providerul AI (${provider}) a răspuns cu ${lastStatus || "eroare"}${emptyReason ? `, ${emptyReason}` : ""}.`,
      lastStatus || undefined,
    );
  };
}

/** Erori trecătoare ale providerului: suprasolicitare (5xx), cotă (429) sau răspuns gol. O cheie greșită sau o cerere invalidă (4xx) nu se maschează cu un fallback. */
const isTransient = (e: GatewayError) => e.status === undefined || e.status === 200 || e.status === 429 || e.status >= 500;

/** Încearcă pe rând mai multe apeluri; trece mai departe doar la erori trecătoare de provider, nu la lipsa configurării sau la 4xx. */
export function withFallback(calls: ModelCall[]): ModelCall {
  return async (request) => {
    let last: unknown;
    for (const call of calls) {
      try {
        return await call(request);
      } catch (error) {
        if (!(error instanceof GatewayError) || error.code !== "provider_error" || !isTransient(error)) throw error;
        last = error;
      }
    }
    throw last;
  };
}

/**
 * Modelul de vedere: Gemini, direct. `MODEL_VISION` poate avea prefixul vechi de OpenRouter („google/…”).
 * Pe planul gratuit Gemini dă des 503 („high demand”) sau 429 (cotă) pe modelele mari (observat 12 nov), deci există un model de rezervă.
 */
export const DEFAULT_VISION_MODEL = "gemini-3.6-flash";
export const VISION_FALLBACK_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_TEXT_MODEL = "openai/gpt-oss-20b";

/**
 * Extragerea din acte (imagini sau PDF). `reasoning_effort: low` a înjumătățit timpul (~3,5 s → ~1,7 s) fără pierdere de acuratețe pe actele SPECIMEN.
 * Modelul principal are o singură încercare și un timeout scurt (15 s): la 503/429/timeout se trece imediat la cel de rezervă
 * (mai puțin precis, 27/30 câmpuri pe testul cu acte SPECIMEN, dar disponibil).
 */
export function visionCall(taskLabel: string, options: { model?: string } = {}): ModelCall {
  const env = getServerEnv();
  const primary = (options.model ?? env.MODEL_VISION ?? DEFAULT_VISION_MODEL).replace(/^google\//, "");
  const base = { provider: "gemini" as const, maxTokens: 2000, reasoningEffort: "low" as const };
  if (primary === VISION_FALLBACK_MODEL) return llmCall(taskLabel, { ...base, model: primary });
  return withFallback([
    llmCall(taskLabel, { ...base, model: primary, attempts: 1, timeoutMs: 15_000 }),
    llmCall(taskLabel, { ...base, model: VISION_FALLBACK_MODEL, timeoutMs: 25_000 }),
  ]);
}

/** Text redactat (de exemplu pasul AI al verificatorului), pe Groq. */
export function textCall(taskLabel: string, options: { model?: string; maxTokens?: number; redacted?: boolean } = {}): ModelCall {
  const env = getServerEnv();
  const model = options.model ?? env.MODEL_TEXT ?? DEFAULT_TEXT_MODEL;
  return llmCall(taskLabel, { provider: "groq", model, maxTokens: options.maxTokens ?? 2000, redacted: options.redacted, reasoningEffort: "low" });
}
