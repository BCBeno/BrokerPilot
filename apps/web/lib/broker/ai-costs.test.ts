import { describe, expect, it } from "vitest";
import { buildCostReport, modelName, taskName, usd, type AiCallRow } from "./ai-costs";

const now = new Date("2026-11-12T16:00:00Z");
const row = (over: Partial<AiCallRow>): AiCallRow => ({
  at: "2026-11-12T10:00:00Z",
  workflow: "web",
  task: "extract-document@2",
  provider: "gemini",
  model: "gemini-3.6-flash",
  input_tokens: 1000,
  output_tokens: 200,
  cost_usd: 0.004,
  latency_ms: 2000,
  success: true,
  ...over,
});

describe("raportul costurilor AI", () => {
  it("adună azi, pe zile, pe model și pe task; versiunea promptului nu desparte rândurile", () => {
    const rows = [
      row({}),
      row({ task: "extract-document@3", cost_usd: "0.006", latency_ms: 4000 }),
      row({ at: "2026-11-11T09:00:00Z", cost_usd: 0.01 }),
      row({ workflow: "WF03", task: "voice_call", provider: "vapi", model: null, cost_usd: 0.5, input_tokens: null, output_tokens: null, latency_ms: null }),
    ];
    const r = buildCostReport(rows, { now, windowDays: 3, budgetUsd: 5 });
    expect(r.todayUsd).toBeCloseTo(0.51);
    expect(r.windowUsd).toBeCloseTo(0.52);
    expect(r.days.map((d) => d.day)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(r.days[0]).toMatchObject({ calls: 0, costUsd: 0 });
    expect(r.byTask.map((g) => [g.key, g.calls])).toEqual([["voice_call", 1], ["extract-document", 3]]);
    const gemini = r.byModel.find((g) => g.key === "gemini-3.6-flash");
    expect(gemini).toMatchObject({ calls: 3, tokens: 3600 });
    expect(gemini?.avgLatencyMs).toBe(2667);
    expect(r.byModel.some((g) => g.key === "vapi (apel întreg)")).toBe(true);
  });

  it("numără eșecurile și apelurile fără cost; exclude ce e în afara ferestrei", () => {
    const rows = [row({ success: false, cost_usd: null }), row({ at: "2026-10-01T10:00:00Z", cost_usd: 9 })];
    const r = buildCostReport(rows, { now, windowDays: 7, budgetUsd: 5 });
    expect(r).toMatchObject({ calls: 1, failed: 1, withoutCost: 1, windowUsd: 0, todayUsd: 0 });
  });

  it("nume și sume", () => {
    expect(taskName(null)).toBe("necunoscut");
    expect(taskName("extract-document@12")).toBe("extract-document");
    expect(modelName({ model: null, provider: null })).toBe("necunoscut");
    expect(usd(0.0575)).toBe("$0,0575");
    expect(usd(0)).toBe("$0,00");
    expect(usd(12.345)).toBe("$12,35");
  });
});
