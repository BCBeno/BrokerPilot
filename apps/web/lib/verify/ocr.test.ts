import { describe, expect, it, vi } from "vitest";
import { MIN_OCR_CHARS, OcrError, ocrDocument, ocrTextLength } from "./ocr";

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("ocrDocument", () => {
  it("cere OCR_URL", async () => {
    await expect(ocrDocument(bytes, {})).rejects.toMatchObject({ code: "not_configured" });
  });

  it("trimite fișierul cu secretul și întoarce paginile cu text", async () => {
    const fetchImpl = vi.fn(async () => json({ pages: [{ page: 1, text: "Poliță RCA" }, { page: 2, text: "   " }] }));
    const pages = await ocrDocument(bytes, { url: "http://ocr:8080", secret: "s3cret", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(pages).toEqual([{ page: 1, text: "Poliță RCA" }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://ocr:8080/ocr");
    expect((init.headers as Record<string, string>)["x-bp-secret"]).toBe("s3cret");
  });

  it("raportează serviciul indisponibil (rețea sau HTTP)", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(ocrDocument(bytes, { url: "http://ocr:8080", fetchImpl: down as unknown as typeof fetch })).rejects.toBeInstanceOf(OcrError);
    const err500 = vi.fn(async () => json({ error: "ocr_failed" }, 500));
    await expect(ocrDocument(bytes, { url: "http://ocr:8080", fetchImpl: err500 as unknown as typeof fetch })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("respinge un răspuns cu altă formă", async () => {
    const bad = vi.fn(async () => json({ text: "x" }));
    await expect(ocrDocument(bytes, { url: "http://ocr:8080", fetchImpl: bad as unknown as typeof fetch })).rejects.toMatchObject({ code: "bad_response" });
  });
});

describe("ocrTextLength", () => {
  it("numără doar caracterele utile", () => {
    expect(ocrTextLength([{ page: 1, text: " a b \n c " }])).toBe(3);
    expect(MIN_OCR_CHARS).toBeGreaterThan(10);
  });
});
