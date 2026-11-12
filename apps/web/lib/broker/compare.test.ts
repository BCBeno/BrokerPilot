import { describe, expect, it } from "vitest";
import { emptyForm, emptyParty, type FormData } from "@/lib/amiabila/form";
import { crossChecks, dayKey } from "./compare";

function form(): FormData {
  const f = emptyForm();
  f.date = "12.11.2026";
  f.a = emptyParty();
  f.b = emptyParty();
  f.a.vehicle.plate = "CJ 12 ABC";
  f.b.vehicle.plate = "B 45 XYZ";
  f.a.insurance = { ...f.a.insurance, company: "Allianz", policyNo: "RO/1", validFrom: "01.01.2026", validTo: "31.12.2026" };
  f.b.insurance = { ...f.b.insurance, company: "Generali", policyNo: "RO/2", validFrom: "01.06.2026", validTo: "31.05.2027" };
  return f;
}

describe("crossChecks", () => {
  it("dosar curat: nicio verificare", () => {
    expect(crossChecks(form())).toEqual([]);
  });

  it("același număr la A și B (cu spații diferite)", () => {
    const f = form();
    f.b.vehicle.plate = "CJ12ABC";
    expect(crossChecks(f)).toContainEqual(expect.objectContaining({ field: "vehicle", level: "danger", role: null }));
  });

  it("poliță expirată, poliță încă nevalabilă, permis expirat", () => {
    const f = form();
    f.a.insurance.validTo = "10.04.2021";
    f.b.insurance.validFrom = "01.12.2026";
    f.b.driver.licenseValidTo = "01.01.2020";
    const checks = crossChecks(f);
    expect(checks).toContainEqual(expect.objectContaining({ field: "policy", role: "A", level: "danger" }));
    expect(checks).toContainEqual(expect.objectContaining({ field: "policy", role: "B", level: "danger" }));
    expect(checks).toContainEqual(expect.objectContaining({ field: "license", role: "B", level: "warn" }));
  });

  it("ambii în staționare", () => {
    const f = form();
    f.a.circumstances = [1];
    f.b.circumstances = [1, 12];
    expect(crossChecks(f)).toContainEqual(expect.objectContaining({ field: "circumstances" }));
  });

  it("fără B sau fără dată nu compară", () => {
    const f = form();
    f.b = emptyParty();
    f.date = "";
    f.a.insurance.validTo = "10.04.2021";
    expect(crossChecks(f)).toEqual([]);
  });

  it("dayKey", () => {
    expect(dayKey("05.03.2026")).toBe("20260305");
    expect(dayKey("2026-03-05")).toBeNull();
  });
});
