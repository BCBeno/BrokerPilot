import { describe, expect, it } from "vitest";
import { buildHealthReport } from "@/lib/health";

describe("buildHealthReport", () => {
  it("este ok când toate verificările trec", () => {
    const r = buildHealthReport({ app: { ok: true }, supabase: { ok: true, detail: "neconfigurat" } });
    expect(r.status).toBe("ok");
  });

  it("este degraded când o verificare pică", () => {
    const r = buildHealthReport({ app: { ok: true }, n8n: { ok: false, detail: "timeout" } });
    expect(r.status).toBe("degraded");
  });
});
