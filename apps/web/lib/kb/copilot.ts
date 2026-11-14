import { z } from "zod";
import { redact, rehydrate } from "@/lib/verify/redact";
import { citeLabel } from "./cite";

/**
 * Copilotul brokerului (spec 7.6): întrebarea pleacă spre WF04 (`/webhook/kb-ask`, `audience: internal`), care caută în
 * documentele publice + interne și răspunde doar din surse, cu citări. Aici: validarea cererii, redactarea PII înainte de n8n
 * (WF04 mai redactează o dată, după format), validarea răspunsului și separarea citărilor pentru UI.
 */

export const NOT_FOUND = "Nu găsesc în documentele disponibile.";

export const CopilotRequestSchema = z.object({
  question: z.string().trim().min(3).max(600),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(8)
    .default([]),
});
export type CopilotRequest = z.infer<typeof CopilotRequestSchema>;

const SourceSchema = z.object({
  n: z.number().int(),
  title: z.string(),
  insurer: z.string().nullish(),
  docType: z.string().nullish(),
  collection: z.string().nullish(),
  page: z.number().int().nullish(),
  heading: z.string().nullish(),
  url: z.string().nullish(),
  snippet: z.string().default(""),
});
export type KbSource = z.infer<typeof SourceSchema>;

const KbAnswerSchema = z.object({
  found: z.boolean(),
  answer: z.string(),
  sources: z.array(SourceSchema).default([]),
});

export type CopilotAnswer = {
  found: boolean;
  /** Textul răspunsului, fără citările de la final (le arată UI-ul ca butoane). */
  text: string;
  sources: KbSource[];
  /** Întrebarea a avut date personale, înlocuite cu marcaje înainte să plece spre AI. */
  redacted: boolean;
};

/** Scoate citările adăugate de WF04 la finalul răspunsului; dacă nu se potrivesc exact, lasă textul neatins. */
export function stripCitations(answer: string, sources: KbSource[]): string {
  if (sources.length === 0) return answer.trim();
  const tail = " " + sources.map(citeLabel).join(" ");
  return answer.endsWith(tail) ? answer.slice(0, -tail.length).trim() : answer.trim();
}

/**
 * Corpul pentru WF04. Se redactează doar mesajele brokerului (întrebarea și istoricul lui); răspunsurile anterioare vin din
 * documente și au trecut deja prin redactare. `knownNames` = numele clienților agenției, ca „polița lui Popescu” să nu plece cu numele.
 */
export function buildKbRequest(input: CopilotRequest, knownNames: string[] = []) {
  const map: Record<string, string> = {};
  let redacted = false;
  const clean = (text: string) => {
    const r = redact(text, { knownNames });
    Object.assign(map, r.map);
    if (r.text !== text) redacted = true;
    return r.text;
  };
  const history = input.history.slice(-4).map((m) => ({ role: m.role, content: m.role === "user" ? clean(m.content) : m.content }));
  const question = clean(input.question);
  return { body: { question, audience: "internal" as const, history }, map, redacted };
}

export type AskResult = { ok: true; answer: CopilotAnswer } | { ok: false; reason: "not_configured" | "unavailable" };

/** Întreabă WF04. Orice eroare (rețea, 4xx/5xx, JSON invalid) devine „unavailable”: UI-ul spune să încerce din nou. */
export async function askKb(
  input: CopilotRequest,
  config: { base?: string; secret?: string; knownNames?: string[] },
  fetcher: typeof fetch = fetch,
): Promise<AskResult> {
  if (!config.base || !config.secret) return { ok: false, reason: "not_configured" };
  const { body, map, redacted } = buildKbRequest(input, config.knownNames);
  try {
    const res = await fetcher(`${config.base.replace(/\/$/, "")}/kb-ask`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bp-secret": config.secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const parsed = KbAnswerSchema.safeParse(await res.json());
    if (!parsed.success) return { ok: false, reason: "unavailable" };
    const { found, answer, sources } = parsed.data;
    if (!found || sources.length === 0) return { ok: true, answer: { found: false, text: NOT_FOUND, sources: [], redacted } };
    // Marcajele (<NUME_1>) care apar în răspuns se pun la loc doar aici, pentru broker; nu pleacă nicăieri.
    return { ok: true, answer: { found: true, text: rehydrate(stripCitations(answer, sources), map), sources, redacted } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
