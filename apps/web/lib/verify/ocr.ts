import { z } from "zod";

/**
 * Client pentru serviciul OCR local (`infra/ocr`, Tesseract `ron`). Fișierul se trimite doar spre acest serviciu
 * (rețea internă), niciodată spre un LLM cloud; textul rezultat intră în același pipeline ca un PDF cu text.
 */

export type OcrPage = { page: number; text: string };

export class OcrError extends Error {
  constructor(
    public readonly code: "not_configured" | "unavailable" | "bad_response",
    message: string,
  ) {
    super(message);
    this.name = "OcrError";
  }
}

const responseSchema = z.object({ pages: z.array(z.object({ page: z.number().int(), text: z.string() })) });

export type OcrOptions = {
  url?: string;
  secret?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/** Tesseract pe o poză slabă dă zgomot, nu text: sub acest prag de caractere utile considerăm că nu s-a citit nimic. */
export const MIN_OCR_CHARS = 40;

export async function ocrDocument(bytes: Uint8Array, options: OcrOptions): Promise<OcrPage[]> {
  if (!options.url) throw new OcrError("not_configured", "Serviciul OCR nu e configurat (lipsește OCR_URL).");
  const doFetch = options.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(new URL("/ocr", options.url), {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...(options.secret ? { "x-bp-secret": options.secret } : {}) },
      body: bytes as BodyInit,
      signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
    });
  } catch {
    throw new OcrError("unavailable", "Serviciul OCR nu răspunde.");
  }
  if (!res.ok) throw new OcrError("unavailable", `Serviciul OCR a răspuns cu HTTP ${res.status}.`);

  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new OcrError("bad_response", "Răspuns OCR neașteptat.");
  return parsed.data.pages.filter((p) => p.text.trim().length > 0);
}

export function ocrTextLength(pages: OcrPage[]): number {
  return pages.reduce((sum, p) => sum + p.text.replace(/\s+/g, "").length, 0);
}
