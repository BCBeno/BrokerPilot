import { describe, expect, it } from "vitest";
import { describeWhen } from "./resume-banner";

describe("describeWhen", () => {
  const now = new Date(2026, 10, 12, 18, 0);

  it("spune azi, ieri sau data", () => {
    expect(describeWhen(new Date(2026, 10, 12, 14, 32).toISOString(), now)).toBe("azi, la 14:32");
    expect(describeWhen(new Date(2026, 10, 11, 9, 5).toISOString(), now)).toBe("ieri, la 09:05");
    expect(describeWhen(new Date(2026, 10, 3, 18, 5).toISOString(), now)).toBe("pe 3 noiembrie, la 18:05");
  });

  it("ignoră o dată stricată", () => {
    expect(describeWhen("nu e dată", now)).toBeNull();
  });
});
