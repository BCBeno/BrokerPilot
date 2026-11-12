import type { ModelCall } from "../ai/extract";
import { normalizeDate } from "../amiabila/documents";
import { aiCheckDocument } from "./ai-check";
import { runDeterministicChecks, type DocFields, type Issue, type Reference, type Severity } from "./checks";
import { missingRequired, parsePolicyText } from "./parse";
import { PiiLeakError, redact, rehydrate, type RedactKind } from "./redact";

/**
 * Pipeline-ul verificatorului (spec 7.8), pe text deja extras din PDF:
 * parsare locală → verificări deterministe pe valorile reale → redactare → AI pe text redactat → re-hidratare → highlight.
 * Harta token → valoare nu iese din această funcție decât prin textele re-hidratate din raport (doar pentru UI-ul brokerului).
 */

export type AiStatus =
  | { status: "ok" }
  | { status: "skipped"; message: string }
  | { status: "blocked"; message: string }
  | { status: "failed"; message: string };

export type Highlight = { start: number; end: number; issueId: string; severity: Severity };

export type VerifyReport = {
  fields: DocFields;
  /** Probleme sigure (deterministe) întâi, apoi sugestiile AI; în fiecare grup, cele mai grave primele. */
  issues: Issue[];
  ai: AiStatus & {
    /** Exact ce a primit AI-ul (redactat), arătat brokerului ca dovadă. Gol dacă AI-ul nu a rulat. */
    sentText: string;
    redactionCounts: Partial<Record<RedactKind, number>>;
  };
  text: string;
  highlights: Highlight[];
};

export type VerifyInput = {
  pages: Array<{ page: number; text: string }>;
  reference?: Reference;
  now?: Date;
  /** `null` = fără pas AI (de exemplu modelul nu e configurat). */
  callModel: ModelCall | null;
  /** Mesajul afișat când `callModel` e `null`. */
  skipReason?: string;
};

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const bySeverity = (a: Issue, b: Issue) => RANK[a.severity] - RANK[b.severity];

export function joinPages(pages: Array<{ page: number; text: string }>): string {
  return pages.map((p) => p.text).join("\n\n");
}

/** Fragmentele de evidențiat: prima apariție a fiecărui citat, fără suprapuneri (rămâne cel mai grav). */
export function computeHighlights(text: string, issues: Issue[]): Highlight[] {
  const found: Highlight[] = [];
  const lower = text.toLowerCase();
  for (const issue of [...issues].sort(bySeverity)) {
    const quote = issue.quote?.trim();
    if (!quote || quote.length < 3) continue;
    let start = text.indexOf(quote);
    if (start === -1) start = lower.indexOf(quote.toLowerCase());
    if (start === -1) continue;
    const end = start + quote.length;
    if (found.some((h) => start < h.end && end > h.start)) continue;
    found.push({ start, end, issueId: issue.id, severity: issue.severity });
  }
  return found.sort((a, b) => a.start - b.start);
}

export async function verifyDocument(input: VerifyInput): Promise<VerifyReport> {
  const now = input.now ?? new Date();
  const text = joinPages(input.pages);
  const fields = parsePolicyText(text);

  const deterministic: Issue[] = runDeterministicChecks(fields, { now, reference: input.reference }).map((issue) => ({
    ...issue,
    quote: issue.field ? (fields[issue.field as keyof DocFields] as string | undefined) : undefined,
  }));
  for (const m of missingRequired(fields)) {
    deterministic.push({
      id: `missing:${m.key}`,
      source: "determinist",
      severity: "warning",
      field: m.key,
      explanation: `Nu am găsit în document ${m.label}.`,
      suggestedFix: "Verifică dacă lipsește din document sau dacă e scris într-un format neobișnuit.",
    });
  }
  deterministic.sort(bySeverity);

  const empty = { sentText: "", redactionCounts: {} as Partial<Record<RedactKind, number>> };
  if (!input.callModel) {
    const message = input.skipReason ?? "Pasul AI nu e configurat.";
    return finish(text, fields, deterministic, { status: "skipped", message, ...empty });
  }
  if (text.trim().length < 40) {
    return finish(text, fields, deterministic, { status: "skipped", message: "Documentul are prea puțin text pentru pasul AI.", ...empty });
  }

  const birth = fields.holderBirthDate ? normalizeDate(fields.holderBirthDate) : null;
  const redacted = redact(text, {
    knownNames: [fields.holderName, input.reference?.name].filter((n): n is string => !!n),
    knownBirthDates: birth ? [birth] : [],
  });
  const redactionCounts = redacted.counts;

  try {
    const result = await aiCheckDocument(redacted.text, fields.type, input.callModel);
    if (!result.ok) {
      return finish(text, fields, deterministic, { status: "failed", message: "Răspunsul AI nu a respectat formatul cerut.", sentText: redacted.text, redactionCounts });
    }
    const ai = result.issues
      .map((i) => ({
        ...i,
        explanation: rehydrate(i.explanation, redacted.map),
        suggestedFix: i.suggestedFix ? rehydrate(i.suggestedFix, redacted.map) : undefined,
        quote: i.quote ? rehydrate(i.quote, redacted.map) : undefined,
      }))
      .sort(bySeverity);
    return finish(text, fields, [...deterministic, ...ai], { status: "ok", sentText: redacted.text, redactionCounts });
  } catch (error) {
    if (error instanceof PiiLeakError) {
      return finish(text, fields, deterministic, { status: "blocked", message: error.message, sentText: "", redactionCounts });
    }
    // Eroare de rețea sau de provider: raportul determinist rămâne valabil.
    const status = error instanceof Error ? /\b(402|429)\b/.exec(error.message)?.[1] : undefined;
    const message =
      status === "402"
        ? "Pasul AI nu a rulat: contul providerului nu are destul credit (HTTP 402). Verificările sigure sunt complete."
        : status === "429"
          ? "Pasul AI nu a rulat: limita providerului a fost atinsă (HTTP 429). Încercați din nou peste un minut. Verificările sigure sunt complete."
          : "Pasul AI nu a răspuns. Verificările sigure sunt complete.";
    return finish(text, fields, deterministic, { status: "failed", message, sentText: redacted.text, redactionCounts });
  }
}

function finish(text: string, fields: DocFields, issues: Issue[], ai: VerifyReport["ai"]): VerifyReport {
  return { fields, issues, ai, text, highlights: computeHighlights(text, issues) };
}
