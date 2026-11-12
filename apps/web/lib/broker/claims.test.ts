import { describe, expect, it } from "vitest";
import { matchesFilter, matchesQuery, shortTime, toListRow, type RawClaim } from "./claims";

const raw = (over: Partial<RawClaim> = {}): RawClaim => ({
  id: "c1",
  public_ref: "BP-2611-00012",
  status: "submitted",
  channel: "web",
  location_text: "Str. Lalelelor 4, Cluj-Napoca",
  created_at: "2026-11-12T10:00:00+00:00",
  updated_at: "2026-11-12T12:20:00+00:00",
  missing_items: [
    { code: "photos_B", label: "x", blocking: false },
    { code: "signature_B", label: "y", blocking: true },
  ],
  claim_parties: [
    { role: "A", vehicle: { plate: "CJ 12 ABC" } },
    { role: "B", vehicle: { plate: "B 45 XYZ" } },
  ],
  brokers: null,
  ...over,
});

describe("toListRow", () => {
  it("ia numerele lui A și B, lipsurile și brokerul", () => {
    const row = toListRow(raw({ brokers: [{ name: "Elena Ionescu" }] }));
    expect(row).toMatchObject({ plateA: "CJ 12 ABC", plateB: "B 45 XYZ", missingBlocking: 1, missingTotal: 2, brokerName: "Elena Ionescu" });
  });

  it("dosar fără B, fără checklist și cu status necunoscut", () => {
    const row = toListRow(raw({ claim_parties: [{ role: "A", vehicle: null }], missing_items: null, status: "ciudat" }));
    expect(row).toMatchObject({ plateA: "", plateB: "", missingBlocking: null, status: "draft" });
  });
});

describe("filtre", () => {
  it("„De preluat” = trimis sau semnat, fără broker", () => {
    expect(matchesFilter(toListRow(raw()), "new")).toBe(true);
    expect(matchesFilter(toListRow(raw({ brokers: { name: "X" } })), "new")).toBe(false);
    expect(matchesFilter(toListRow(raw({ status: "awaiting_b" })), "new")).toBe(false);
    expect(matchesFilter(toListRow(raw({ status: "awaiting_b" })), "awaiting_b")).toBe(true);
  });

  it("caută după referință, număr fără spații și adresă", () => {
    const row = toListRow(raw());
    expect(matchesQuery(row, "00012")).toBe(true);
    expect(matchesQuery(row, "cj12abc")).toBe(true);
    expect(matchesQuery(row, "b 45")).toBe(true);
    expect(matchesQuery(row, "lalelelor")).toBe(true);
    expect(matchesQuery(row, "IF 33")).toBe(false);
    expect(matchesQuery(row, "  ")).toBe(true);
  });
});

describe("shortTime", () => {
  const now = new Date("2026-11-12T15:00:00+02:00");
  it("ora azi, „ieri”, altfel ziua", () => {
    expect(shortTime("2026-11-12T14:20:00+02:00", now)).toBe("14:20");
    expect(shortTime("2026-11-11T09:00:00+02:00", now)).toBe("ieri");
    expect(shortTime("2026-11-10T09:00:00+02:00", now)).toMatch(/^10 nov/);
  });
});
