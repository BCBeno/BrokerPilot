import { DOC_META, extractedDocSchema, extractionSchema, normalizeExtraction, type DocType, type ExtractedDoc } from "@/lib/amiabila/documents";
import { DOC_TYPE_INSTRUCTIONS, EXTRACT_SYSTEM_PROMPT } from "./prompts";

export type Attachment = { mime: string; dataUrl: string; filename: string };

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "assistant"; content: string }
  | { role: "user"; content: string | Array<Record<string, unknown>> };

export type ModelReply = { text: string; inputTokens?: number; outputTokens?: number; costUsd?: number };
export type ModelCall = (request: { messages: ChatMessage[]; schemaName: string; jsonSchema: object }) => Promise<ModelReply>;

export type ExtractionResult =
  | { ok: true; doc: ExtractedDoc; attempts: number; replies: ModelReply[] }
  | { ok: false; reason: "invalid_output"; message: string; replies: ModelReply[] };

/** JSON Schema scris de mână (strict, fără cuvinte-cheie pe care unii provideri le resping). */
export function jsonSchemaFor(type: DocType): object {
  const field = {
    type: "object",
    properties: { value: { type: ["string", "null"] }, confidence: { type: "number" } },
    required: ["value", "confidence"],
    additionalProperties: false,
  };
  const keys = DOC_META[type].fields.map((f) => f.key);
  return {
    type: "object",
    properties: {
      fields: {
        type: "object",
        properties: Object.fromEntries(keys.map((k) => [k, field])),
        required: keys,
        additionalProperties: false,
      },
    },
    required: ["fields"],
    additionalProperties: false,
  };
}

export function buildUserContent(type: DocType, file: Attachment): Array<Record<string, unknown>> {
  const part =
    file.mime === "application/pdf"
      ? { type: "file", file: { filename: file.filename, file_data: file.dataUrl } }
      : { type: "image_url", image_url: { url: file.dataUrl } };
  return [{ type: "text", text: DOC_TYPE_INSTRUCTIONS[type] }, part];
}

/** Scoate eventualele garduri ```json din răspuns. */
export function parseJsonReply(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

/**
 * Extrage datele unui act: apel către model, validare Zod, un singur retry cu mesajul de eroare (regula proiectului).
 * `callModel` e injectat, ca să testăm fără rețea.
 */
export async function extractDocument(
  type: DocType,
  file: Attachment,
  callModel: ModelCall,
  now: Date = new Date(),
): Promise<ExtractionResult> {
  const schema = extractionSchema(type);
  const jsonSchema = jsonSchemaFor(type);
  const messages: ChatMessage[] = [
    { role: "system", content: EXTRACT_SYSTEM_PROMPT },
    { role: "user", content: buildUserContent(type, file) },
  ];
  const replies: ModelReply[] = [];
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callModel({ messages, schemaName: `extract_${type}`, jsonSchema });
    replies.push(reply);
    try {
      const parsed = schema.parse(parseJsonReply(reply.text));
      const doc = normalizeExtraction(type, extractedDocSchema.parse(parsed), now);
      return { ok: true, doc, attempts: attempt, replies };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "răspuns invalid";
      messages.push(
        { role: "assistant", content: reply.text },
        { role: "user", content: `Răspunsul nu respectă schema: ${lastError.slice(0, 400)}. Returnează doar JSON-ul corectat.` },
      );
    }
  }
  return { ok: false, reason: "invalid_output", message: lastError, replies };
}
