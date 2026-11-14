import { describe, expect, it, vi } from "vitest";
import { askKb, buildKbRequest, CopilotRequestSchema, NOT_FOUND, stripCitations, type KbSource } from "./copilot";

const src = (n: number, title: string, page: number | null): KbSource => ({ n, title, page, snippet: "fragment " + n });
const cfg = { base: "https://n8n.example/webhook/", secret: "s3", knownNames: ["Andreea Grigore"] };
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("CopilotRequestSchema", () => {
  it("cere o întrebare între 3 și 600 de caractere", () => {
    expect(CopilotRequestSchema.safeParse({ question: " a " }).success).toBe(false);
    expect(CopilotRequestSchema.safeParse({ question: "x".repeat(601) }).success).toBe(false);
    expect(CopilotRequestSchema.parse({ question: "Ce acoperă RCA?" }).history).toEqual([]);
  });
});

describe("buildKbRequest", () => {
  it("redactează numele clienților și CNP-ul din mesajele brokerului, nu și din răspunsuri", () => {
    const { body, redacted, map } = buildKbRequest(
      {
        question: "Ce acoperă polița Andreei Grigore, CNP 2850315410012?",
        history: [
          { role: "user", content: "Clientul Grigore a avut o daună" },
          { role: "assistant", content: "Conform documentului Allianz..." },
        ],
      },
      ["Andreea Grigore"],
    );
    const sent = JSON.stringify(body);
    expect(sent).not.toMatch(/Grigore|2850315410012/);
    expect(body.audience).toBe("internal");
    expect(body.history[1].content).toBe("Conform documentului Allianz...");
    expect(redacted).toBe(true);
    expect(Object.values(map)).toContain("Andreea Grigore");
  });

  it("nu marchează ca redactată o întrebare fără date personale", () => {
    expect(buildKbRequest({ question: "Ce acoperă CASCO la furtul de oglinzi?", history: [] }).redacted).toBe(false);
  });
});

describe("stripCitations", () => {
  it("scoate citările adăugate de WF04 la final", () => {
    const sources = [src(1, "Allianz IPID RCA", 2), src(3, "BAAR întrebări", null)];
    expect(stripCitations("Acoperă daunele. [Allianz IPID RCA, pag. 2] [BAAR întrebări]", sources)).toBe("Acoperă daunele.");
  });
  it("lasă textul neatins dacă citările nu se potrivesc", () => {
    expect(stripCitations("Text [Alt document]", [src(1, "Allianz", 2)])).toBe("Text [Alt document]");
  });
});

describe("askKb", () => {
  it("trimite cu secret la /kb-ask și întoarce textul fără citări", async () => {
    const fetcher = reply(200, { found: true, answer: "Da, e acoperit. [Allianz IPID RCA, pag. 2]", sources: [src(1, "Allianz IPID RCA", 2)] });
    const out = await askKb({ question: "E acoperit?", history: [] }, cfg, fetcher);
    expect(out).toMatchObject({ ok: true, answer: { found: true, text: "Da, e acoperit.", redacted: false } });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://n8n.example/webhook/kb-ask");
    expect((init.headers as Record<string, string>)["x-bp-secret"]).toBe("s3");
  });

  it("re-hidratează marcajele din răspuns doar pentru broker", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const q = JSON.parse(String(init.body)).question as string;
      const token = q.match(/<NUME_\d+>/)?.[0] ?? "";
      return new Response(JSON.stringify({ found: true, answer: `${token} are RCA. [Doc]`, sources: [src(1, "Doc", null)] }), { status: 200 });
    });
    const out = await askKb({ question: "Ce poliță are Andreea Grigore?", history: [] }, cfg, fetcher as unknown as typeof fetch);
    expect(out).toMatchObject({ ok: true, answer: { text: "Andreea Grigore are RCA.", redacted: true } });
  });

  it("fără surse → răspunsul standard „Nu găsesc”", async () => {
    const out = await askKb({ question: "Cât costă?", history: [] }, cfg, reply(200, { found: false, answer: NOT_FOUND, sources: [] }));
    expect(out).toEqual({ ok: true, answer: { found: false, text: NOT_FOUND, sources: [], redacted: false } });
  });

  it("502, JSON invalid sau eroare de rețea → unavailable", async () => {
    const q = { question: "Ce acoperă?", history: [] };
    expect(await askKb(q, cfg, reply(502, { error: "kb_unavailable" }))).toEqual({ ok: false, reason: "unavailable" });
    expect(await askKb(q, cfg, reply(200, { nimic: 1 }))).toEqual({ ok: false, reason: "unavailable" });
    expect(await askKb(q, cfg, vi.fn(async () => Promise.reject(new Error("net"))))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("fără configurare nu apelează nimic", async () => {
    const fetcher = vi.fn();
    expect(await askKb({ question: "Ce acoperă?", history: [] }, {}, fetcher)).toEqual({ ok: false, reason: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
