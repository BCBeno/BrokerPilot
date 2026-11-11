import { describe, expect, it } from "vitest";
import { FORM_CIRCUMSTANCES } from "./content";
import { EMPTY_DRAFT, type Draft } from "./draft";
import { buildForm, countChecked, emptyParty, formatFormDate, splitName } from "./form";
import { endAngle, pathData, sketchSchema } from "./sketch";
import { specimenForm } from "./specimen";

describe("formular amiabilă", () => {
  it("are cele 17 formulări oficiale ale circumstanțelor", () => {
    expect(FORM_CIRCUMSTANCES).toHaveLength(17);
  });

  it("împarte numele „NUME Prenume” și formatează datele", () => {
    expect(splitName("POPESCU Ion Mihai")).toEqual({ surname: "POPESCU", firstName: "Ion Mihai" });
    expect(splitName("")).toEqual({ surname: "", firstName: "" });
    expect(formatFormDate("2031-09-20")).toBe("20.09.2031");
    expect(formatFormDate("nu-e-data")).toBe("nu-e-data");
  });

  it("lasă coloana B goală și nu inventează nimic dintr-o ciornă goală", () => {
    const form = buildForm(EMPTY_DRAFT);
    expect(form.a.holder.surname).toBe("");
    expect(form.date).toBe("");
    expect(form.injured).toBeNull();
    expect(form.b).toEqual(emptyParty());
    expect(form.sketch).toBeNull();
  });

  it("mapează ciorna șoferului A pe casete", () => {
    const draft: Draft = {
      ...EMPTY_DRAFT,
      injured: false,
      eligibility: { ...EMPTY_DRAFT.eligibility, twoVehicles: true },
      place: { ...EMPTY_DRAFT.place, address: "Str. Test 1, București", occurredAt: "2026-11-10T06:45:00.000Z" },
      documents: {
        registration: {
          fields: {
            plate: { value: "B 123 ABC", confidence: 1 },
            make: { value: "Dacia", confidence: 1 },
            model: { value: "Logan", confidence: 1 },
            holderName: { value: "IONESCU Mihai", confidence: 1 },
          },
        },
        license: {
          fields: {
            fullName: { value: "IONESCU Mihai", confidence: 1 },
            licenseNo: { value: "B0000001", confidence: 1 },
            categories: { value: "B", confidence: 1 },
            expiresOn: { value: "2031-09-20", confidence: 1 },
          },
        },
        policy: {
          fields: {
            insurer: { value: "Asigurări Demo", confidence: 1 },
            policyNo: { value: "RO/1", confidence: 1 },
            validFrom: { value: "2026-03-01", confidence: 1 },
            validTo: { value: "2027-02-28", confidence: 1 },
            plate: { value: "B 123 ABC", confidence: 1 },
          },
        },
      },
      circumstances: { checked: [13, 2], impact: "right", damage: "Portieră", notes: "Observație" },
    };
    const form = buildForm(draft);
    expect(form.place).toBe("Str. Test 1, București");
    expect(form.date).toBe("10.11.2026");
    expect(form.time).toBe("08:45"); // 06:45 UTC = 08:45 în România, iarna
    expect(form.otherVehiclesDamaged).toBe(false);
    expect(form.a.vehicle).toMatchObject({ makeType: "Dacia Logan", plate: "B 123 ABC" });
    expect(form.a.holder).toMatchObject({ surname: "IONESCU", firstName: "Mihai" });
    expect(form.a.driver).toMatchObject({ licenseNo: "B0000001", licenseValidTo: "20.09.2031" });
    expect(form.a.insurance).toMatchObject({ validFrom: "01.03.2026", validTo: "28.02.2027" });
    expect(form.a.impactPoint).toBe("right");
    expect(countChecked(form.a)).toBe(2);
  });

  it("specimenul e marcat și are o schiță validă", () => {
    const form = specimenForm();
    expect(form.specimen).toBe(true);
    expect(form.sketch).not.toBeNull();
    expect(sketchSchema.safeParse(form.sketch).success).toBe(true);
    expect(countChecked(form.a)).toBe(1);
    expect(countChecked(form.b)).toBe(1);
  });
});

describe("schiță", () => {
  it("construiește traseul: linie frântă sau curbă la 3 puncte", () => {
    expect(pathData([{ x: 0, y: 0 }])).toBe("");
    expect(pathData([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe("M0 0 L10 0");
    expect(pathData([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }])).toBe("M0 0 Q5 5 10 0");
  });

  it("calculează direcția vârfului săgeții", () => {
    expect(endAngle([{ x: 0, y: 0 }])).toBeNull();
    expect(endAngle([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(0);
    expect(endAngle([{ x: 0, y: 10 }, { x: 0, y: 0 }])).toBe(-90);
  });
});
