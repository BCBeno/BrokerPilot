import { NextResponse } from "next/server";
import { z } from "zod";
import { GatewayError, assertBudget, textCall } from "@/lib/ai/gateway";
import { createRateLimiter, sniffMime } from "@/lib/ai/upload";
import { getBrokerOrNull } from "@/lib/broker/session";
import { fail, SERVER_ERROR, TOO_MANY } from "@/lib/claims/server";
import { getServerEnv } from "@/lib/env";
import { KbParseError, parseKbFile } from "@/lib/kb/parse";
import { VERIFY_PROMPT_VERSION } from "@/lib/verify/ai-check";
import type { Reference } from "@/lib/verify/checks";
import { verifyDocument } from "@/lib/verify/pipeline";

export const runtime = "nodejs";

const MAX_VERIFY_BYTES = 10 * 1024 * 1024;
const allow = createRateLimiter(15, 10 * 60_000);

/**
 * Verificatorul de documente (spec 7.8), doar pentru brokeri autentificați. Primește un PDF cu text (câmpul `file`) și,
 * opțional, `clientId` pentru verificarea față de dosarul clientului. Textul se extrage și se verifică local; spre AI pleacă doar
 * text redactat (vezi `lib/verify/pipeline.ts`). Fișierul nu se păstrează. Scanurile (fără text) cer OCR, care urmează.
 */
export async function POST(request: Request) {
  const session = await getBrokerOrNull();
  if (!session) return fail(401, "Autentificați-vă ca broker.", "unauthorized");
  if (!allow(session.broker.id)) return TOO_MANY();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "Lipsește fișierul.", "bad_request");
  if (file.size === 0 || file.size > MAX_VERIFY_BYTES) return fail(413, "Fișierul e gol sau depășește 10 MB.", "too_large");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniffMime(bytes) !== "application/pdf") {
    return fail(415, "Deocamdată acceptăm doar PDF cu text. Scanurile și pozele (OCR) urmează.", "unsupported_type");
  }

  let pages;
  try {
    pages = (await parseKbFile(bytes)).pages;
  } catch (err) {
    if (err instanceof KbParseError) return fail(422, "PDF-ul nu a putut fi citit.", err.code);
    return SERVER_ERROR();
  }
  if (pages.length === 0) {
    return fail(422, "PDF-ul nu conține text (pare un scan). Verificarea scanurilor, cu OCR, urmează.", "no_text");
  }

  // Clientul de referință: RLS pe agenție decide ce poate vedea brokerul. Plăcuța și VIN-ul se compară doar dacă clientul are un singur vehicul.
  let reference: Reference | undefined;
  const clientId = z.uuid().safeParse(form?.get("clientId"));
  if (clientId.success) {
    const { data: client } = await session.db.from("clients").select("full_name, vehicles(plate, vin)").eq("id", clientId.data).maybeSingle();
    if (client) {
      const vehicles = (client.vehicles ?? []) as Array<{ plate: string; vin: string | null }>;
      const only = vehicles.length === 1 ? vehicles[0] : undefined;
      reference = { name: client.full_name.replace(/\s*\(fictiv\)\s*$/i, ""), plate: only?.plate, vin: only?.vin ?? undefined };
    }
  }

  const env = getServerEnv();
  let callModel = null;
  let skipReason = "Pasul AI nu e configurat (lipsește GROQ_API_KEY).";
  if (env.GROQ_API_KEY) {
    try {
      await assertBudget();
      // Text redactat, pe Groq (`MODEL_TEXT`, implicit gpt-oss-20b). Modelele „thinking” consumă `max_tokens` și pe raționament
      // (~700 de tokeni pentru un răspuns de 2 probleme): plafon mare, cu efort de raționament mic (setat în `textCall`).
      callModel = textCall(VERIFY_PROMPT_VERSION, { maxTokens: 4000, redacted: true });
    } catch (err) {
      if (!(err instanceof GatewayError)) return SERVER_ERROR();
      skipReason = err.code === "budget_exceeded" ? "Plafonul zilnic de cost AI a fost atins; verificările sigure au rulat." : skipReason;
    }
  }

  try {
    const report = await verifyDocument({ pages, reference, callModel, skipReason });
    return NextResponse.json({ ...report, fileName: file.name.slice(0, 120), pageCount: pages.length });
  } catch {
    return SERVER_ERROR();
  }
}
