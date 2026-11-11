import { NextResponse } from "next/server";
import { z } from "zod";
import { GatewayError, assertBudget, openRouterCall } from "@/lib/ai/gateway";
import { extractDocument } from "@/lib/ai/extract";
import { EXTRACT_PROMPT_VERSION } from "@/lib/ai/prompts";
import { MAX_UPLOAD_BYTES, createRateLimiter, sniffMime } from "@/lib/ai/upload";
import { SCANNABLE_TYPES } from "@/lib/amiabila/documents";

export const runtime = "nodejs";

const allow = createRateLimiter(20, 10 * 60_000);
const typeSchema = z.enum(SCANNABLE_TYPES) /* permisul nu se trimite niciodată la AI */;

const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status });
const MANUAL = "Citirea automată nu e disponibilă acum. Completați manual.";

/**
 * Extragere vision dintr-un act. Poza se trimite la providerul AI doar cu consimțământul explicit (câmpul `consent`),
 * nu se păstrează pe server și nu apare în loguri. Răspunsul: câmpuri cu `confidence`, validate cu Zod.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(ip)) return fail(429, "Prea multe încercări. Încercați din nou peste câteva minute.", "rate_limited");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Cerere invalidă.", "bad_request");
  }

  if (form.get("consent") !== "true") {
    return fail(400, "Avem nevoie de acordul dumneavoastră ca să citim actul.", "consent_required");
  }
  const type = typeSchema.safeParse(form.get("type"));
  const file = form.get("file");
  if (!type.success || !(file instanceof File)) return fail(400, "Cerere invalidă.", "bad_request");
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    return fail(413, "Fișierul e prea mare. Încercați o poză mai mică (sub 6 MB).", "too_large");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return fail(415, "Acceptăm poze (JPG, PNG, WebP) sau PDF.", "unsupported_type");

  try {
    const call = openRouterCall(EXTRACT_PROMPT_VERSION);
    await assertBudget();
    const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    const attachment = { mime, dataUrl, filename: mime === "application/pdf" ? "document.pdf" : "document" };
    const result = await extractDocument(type.data, attachment, call);
    if (!result.ok) {
      return fail(422, "Nu am reușit să citim actul. Încercați o poză mai clară sau completați manual.", "unreadable");
    }
    return NextResponse.json({ type: type.data, doc: result.doc });
  } catch (error) {
    if (error instanceof GatewayError) {
      if (error.code === "not_configured" || error.code === "budget_exceeded") return fail(503, MANUAL, error.code);
      return fail(502, "Serviciul de citire nu răspunde. Încercați din nou sau completați manual.", "provider_error");
    }
    return fail(500, "A apărut o eroare. Puteți completa datele manual.", "internal");
  }
}
