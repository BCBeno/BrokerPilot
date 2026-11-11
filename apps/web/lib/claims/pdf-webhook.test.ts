import { describe, expect, it, vi } from "vitest";
import { specimenForm } from "@/lib/amiabila/specimen";
import { makeRenderKey, verifyRenderKey } from "./pdf";
import { buildCompletedPayload, sendClaimCompleted } from "./webhook";

describe("cheia paginii PDF", () => {
  const now = 1_800_000_000_000;
  it("e valabilă pentru dosarul ei, o scurtă vreme", () => {
    const key = makeRenderKey("claim-1", "secret", now);
    expect(verifyRenderKey("claim-1", key, "secret", now + 60_000)).toBe(true);
    expect(verifyRenderKey("claim-1", key, "secret", now + 6 * 60_000)).toBe(false);
  });
  it("nu merge pentru alt dosar, alt secret sau o cheie stricată", () => {
    const key = makeRenderKey("claim-1", "secret", now);
    expect(verifyRenderKey("claim-2", key, "secret", now)).toBe(false);
    expect(verifyRenderKey("claim-1", key, "alt-secret", now)).toBe(false);
    expect(verifyRenderKey("claim-1", undefined, "secret", now)).toBe(false);
    expect(verifyRenderKey("claim-1", "123.abc", "secret", now)).toBe(false);
  });
});

const payload = () =>
  buildCompletedPayload({
    claimId: "c1",
    ref: "BP-2611-00007",
    channel: "web",
    occurredAt: "12.11.2026 10:30",
    form: specimenForm(),
    pdfUrl: "https://example.test/x.pdf",
    appUrl: "https://app.example.test",
    photoCounts: { A: 2, B: 0 },
    missing: [{ code: "photos_B", label: "Nicio poză cu daunele vehiculului B", blocking: false }],
  });

describe("sendClaimCompleted", () => {
  it("fără configurare nu apelează nimic", async () => {
    const fetcher = vi.fn();
    expect(await sendClaimCompleted(payload(), {}, fetcher as unknown as typeof fetch)).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("trimite secretul în antet și payload-ul pe /claim-completed", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const result = await sendClaimCompleted(payload(), { base: "https://n8n.test/webhook/", secret: "s3" }, fetcher as unknown as typeof fetch);
    expect(result).toBe("sent");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://n8n.test/webhook/claim-completed");
    expect((init.headers as Record<string, string>)["x-bp-secret"]).toBe("s3");
    expect(JSON.parse(init.body as string)).toMatchObject({ event: "claim.completed", ref: "BP-2611-00007", photoCounts: { A: 2, B: 0 } });
  });
  it("o eroare de rețea sau un răspuns negativ nu aruncă", async () => {
    const config = { base: "https://n8n.test/webhook", secret: "s" };
    expect(await sendClaimCompleted(payload(), config, vi.fn().mockRejectedValue(new Error("x")) as unknown as typeof fetch)).toBe("failed");
    expect(await sendClaimCompleted(payload(), config, vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch)).toBe("failed");
  });
});

describe("buildCompletedPayload", () => {
  it("rezumă fiecare șofer cu etichetele circumstanțelor", () => {
    const p = payload();
    expect(p.parties.A.circumstances.length).toBeGreaterThan(0);
    expect(p.parties.A.circumstances.every((c) => c.label.length > 0)).toBe(true);
    expect(p.hasSketch).toBe(specimenForm().sketch !== null);
  });
});
