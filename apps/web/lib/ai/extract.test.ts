import { describe, expect, it, vi } from "vitest";
import { extractDocument, jsonSchemaFor, parseJsonReply, type ModelCall } from "./extract";
import { createRateLimiter, sniffMime } from "./upload";

const file = { mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA", filename: "document" };
const NOW = new Date("2026-11-11T12:00:00.000Z");

// Se extrag doar actele scanabile (talon, poliță); permisul și datele de contact se scriu de mână.
const policyReply = JSON.stringify({
  fields: {
    insurer: { value: "Asigurări Demo", confidence: 0.98 },
    policyNo: { value: "RO/40/DEM/1234567", confidence: 0.9 },
    validFrom: { value: "06.03.2029", confidence: 0.99 },
    validTo: { value: "05.03.2030", confidence: 0.8 },
    plate: { value: "b123abc", confidence: 0.9 },
  },
});

describe("extractDocument", () => {
  it("validează și normalizează răspunsul modelului", async () => {
    const call: ModelCall = vi.fn(async () => ({ text: policyReply }));
    const result = await extractDocument("policy", file, call, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(1);
      expect(result.doc.fields.validTo.value).toBe("2030-03-05");
    }
  });

  it("acceptă răspuns învelit în gard de cod", async () => {
    const call: ModelCall = async () => ({ text: "```json\n" + policyReply + "\n```" });
    expect((await extractDocument("policy", file, call, NOW)).ok).toBe(true);
  });

  it("reia o dată cu mesajul de eroare când răspunsul nu respectă schema", async () => {
    const call = vi
      .fn<ModelCall>()
      .mockResolvedValueOnce({ text: JSON.stringify({ fields: { insurer: { value: "X", confidence: 2 } } }) })
      .mockResolvedValueOnce({ text: policyReply });
    const result = await extractDocument("policy", file, call, NOW);
    expect(result.ok && result.attempts).toBe(2);
    const secondMessages = call.mock.calls[1][0].messages;
    expect(secondMessages.at(-1)?.role).toBe("user");
    expect(String(secondMessages.at(-1)?.content)).toContain("nu respectă schema");
  });

  it("renunță după al doilea răspuns invalid", async () => {
    const call = vi.fn<ModelCall>(async () => ({ text: "nu e json" }));
    const result = await extractDocument("policy", file, call, NOW);
    expect(result.ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("trimite și PDF-ul, și pozele ca „image_url” (Gemini respinge tipul „file”)", async () => {
    const call = vi.fn<ModelCall>(async () => ({ text: policyReply }));
    const pdf = { mime: "application/pdf", dataUrl: "data:application/pdf;base64,AAAA", filename: "document.pdf" };
    await extractDocument("policy", pdf, call, NOW);
    const content = call.mock.calls[0][0].messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(content.map((p) => p.type)).toEqual(["text", "image_url"]);
    expect(content[1].image_url?.url).toBe(pdf.dataUrl);
  });
});

describe("jsonSchemaFor", () => {
  it("cere toate câmpurile și interzice cele în plus", () => {
    const schema = jsonSchemaFor("policy") as {
      properties: { fields: { required: string[]; additionalProperties: boolean } };
    };
    expect(schema.properties.fields.required).toEqual(["insurer", "policyNo", "validFrom", "validTo", "plate"]);
    expect(schema.properties.fields.additionalProperties).toBe(false);
  });
});

describe("parseJsonReply", () => {
  it("aruncă pe text care nu e JSON", () => {
    expect(() => parseJsonReply("salut")).toThrow();
  });
});

describe("sniffMime", () => {
  it("recunoaște tipul după primii octeți", () => {
    expect(sniffMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffMime(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(sniffMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });

  it("refuză un executabil sau text deghizat în poză", () => {
    expect(sniffMime(Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(sniffMime(new TextEncoder().encode("<html>"))).toBeNull();
  });
});

describe("createRateLimiter", () => {
  it("blochează după limită și se eliberează după fereastră", () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow("ip", 0)).toBe(true);
    expect(allow("ip", 100)).toBe(true);
    expect(allow("ip", 200)).toBe(false);
    expect(allow("alt-ip", 200)).toBe(true);
    expect(allow("ip", 1500)).toBe(true);
  });
});
