import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { KbParseError, MAX_KB_FILE_BYTES, parseKbFile } from "@/lib/kb/parse";
import { NOT_CONFIGURED, SERVER_ERROR, fail, sameToken } from "@/lib/claims/server";

export const runtime = "nodejs";

/**
 * Folosit doar de WF08 (ingestia din Drive): primește fișierul (multipart, câmpul `file`) și întoarce textul pe pagini,
 * ca fragmentele din baza de cunoștințe să poată fi citate cu numărul paginii. Cere secretul webhook-urilor (`x-bp-secret`).
 * Nu salvează nimic și nu apelează niciun LLM.
 */
export async function POST(request: Request) {
  const secret = getServerEnv().BP_WEBHOOK_SECRET;
  if (!secret) return NOT_CONFIGURED();
  if (!sameToken(request.headers.get("x-bp-secret"), secret)) return fail(401, "Neautorizat.", "unauthorized");

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "Lipsește fișierul (câmpul „file”).", "bad_request");
  if (file.size > MAX_KB_FILE_BYTES) return fail(413, "Fișierul e prea mare.", "too_large");

  try {
    const parsed = await parseKbFile(new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json(parsed);
  } catch (err) {
    if (err instanceof KbParseError) return fail(err.code === "unsupported" ? 415 : 422, err.message, err.code);
    return SERVER_ERROR();
  }
}
