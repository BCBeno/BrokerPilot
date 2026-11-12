import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "./pricing";

describe("estimateCostUsd", () => {
  it("calculează din tokeni la prețul de listă", () => {
    // 1000 de tokeni la 0,75 $/M + 200 la 3,75 $/M = 0,00075 + 0,00075
    expect(estimateCostUsd("gemini-3.6-flash", 1000, 200)).toBeCloseTo(0.0015, 6);
    expect(estimateCostUsd("openai/gpt-oss-120b", 2500, 120)).toBeCloseTo(0.000447, 6);
  });

  it("nu inventează un cost pentru un model necunoscut sau fără tokeni", () => {
    expect(estimateCostUsd("alt/model", 1000, 100)).toBeUndefined();
    expect(estimateCostUsd("gemini-3.6-flash", undefined, 100)).toBeUndefined();
    expect(estimateCostUsd("gemini-3.6-flash", 100, undefined)).toBeUndefined();
  });
});
