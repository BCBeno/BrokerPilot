import { describe, expect, it } from "vitest";
import {
  addDays,
  daysUntil,
  expiryBadge,
  expiryLabel,
  inRenewalWindow,
  matchesRenewalFilter,
  renewalState,
  roDate,
  todayRo,
  type PolicyLite,
  type RenewalEvent,
} from "./renewals";

const TODAY = "2026-11-12";
const rca = (over: Partial<PolicyLite> = {}): PolicyLite => ({
  id: "p1",
  client_id: "c1",
  vehicle_id: "v1",
  type: "RCA",
  valid_from: "2025-11-20",
  valid_to: "2026-11-19",
  ...over,
});
const ev = (type: string, at: string, payload: RenewalEvent["payload"] = { broker_id: "b1" }): RenewalEvent => ({
  entity_id: "p1",
  type,
  at,
  payload,
});

describe("termene", () => {
  it("ziua din România, nu din UTC", () => {
    // 23:30 UTC pe 12 = 01:30 pe 13 în București (iarna, UTC+2)
    expect(todayRo(new Date("2026-11-12T23:30:00Z"))).toBe("2026-11-13");
  });

  it("zile până la expirare și adunare de zile", () => {
    expect(daysUntil("2026-11-19", TODAY)).toBe(7);
    expect(daysUntil("2026-11-08", TODAY)).toBe(-4);
    expect(addDays(TODAY, 3)).toBe("2026-11-15");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("etichete în română", () => {
    expect(expiryLabel(0)).toBe("expiră azi");
    expect(expiryLabel(1)).toBe("expiră mâine");
    expect(expiryLabel(12)).toBe("expiră în 12 zile");
    expect(expiryLabel(-1)).toBe("expirată ieri");
    expect(expiryLabel(-4)).toBe("expirată de 4 zile");
  });

  it("tonul etichetei și fereastra de 30 de zile", () => {
    expect(expiryBadge(-4).tone).toBe("danger");
    expect(expiryBadge(-400)).toEqual({ label: "expirată", tone: "danger" });
    expect(expiryBadge(5).tone).toBe("danger");
    expect(expiryBadge(20).tone).toBe("todo");
    expect(expiryBadge(200)).toEqual({ label: "valabilă", tone: "ok" });
    expect(inRenewalWindow(30)).toBe(true);
    expect(inRenewalWindow(31)).toBe(false);
    expect(inRenewalWindow(-30)).toBe(true);
    expect(inRenewalWindow(-31)).toBe(false);
  });

  it("data ca pe acte", () => {
    expect(roDate("2026-11-08")).toBe("08.11.2026");
  });
});

describe("starea reînnoirii", () => {
  it("fără acțiuni = de contactat", () => {
    expect(renewalState(rca(), [rca()], [], TODAY)).toEqual({ kind: "todo", reminderDue: false });
  });

  it("o poliță nouă de același tip pe același vehicul = reînnoită", () => {
    const next = rca({ id: "p2", valid_from: "2026-11-20", valid_to: "2027-11-19" });
    expect(renewalState(rca(), [rca(), next], [], TODAY)).toEqual({ kind: "renewed" });
    // alt vehicul sau alt tip nu contează
    const other = rca({ id: "p3", vehicle_id: "v2", valid_to: "2027-11-19" });
    const casco = rca({ id: "p4", type: "CASCO", valid_to: "2027-11-19" });
    expect(renewalState(rca(), [rca(), other, casco], [], TODAY).kind).toBe("todo");
  });

  it("ultima acțiune câștigă", () => {
    const events = [ev("renewal_snoozed", "2026-11-10T08:00:00Z", { broker_id: "b1", until: "2026-11-20" }), ev("renewal_contacted", "2026-11-11T09:00:00Z")];
    expect(renewalState(rca(), [rca()], events, TODAY)).toEqual({ kind: "contacted", at: "2026-11-11T09:00:00Z", brokerId: "b1" });
  });

  it("amânarea ține până la data aleasă, apoi revine ca reamintire", () => {
    const snooze = [ev("renewal_snoozed", "2026-11-10T08:00:00Z", { broker_id: "b1", until: "2026-11-15" })];
    expect(renewalState(rca(), [rca()], snooze, TODAY)).toEqual({ kind: "snoozed", until: "2026-11-15", brokerId: "b1" });
    expect(renewalState(rca(), [rca()], snooze, "2026-11-15")).toEqual({ kind: "todo", reminderDue: true });
  });

  it("filtre", () => {
    expect(matchesRenewalFilter({ kind: "todo", reminderDue: true }, "todo")).toBe(true);
    expect(matchesRenewalFilter({ kind: "renewed" }, "todo")).toBe(false);
    expect(matchesRenewalFilter({ kind: "renewed" }, "all")).toBe(true);
  });
});
