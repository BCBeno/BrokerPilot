import { describe, expect, it } from "vitest";
import { FORM_CIRCUMSTANCES } from "./content";
import { EMPTY_DRAFT, type Draft } from "./draft";
import { buildForm, countChecked, emptyParty, formatFormDate, splitName } from "./form";
import {
  angleToward,
  defaultTemplateSketch,
  endAngle,
  extendStroke,
  fitWithin,
  isSketchEmpty,
  moveVehicle,
  pathData,
  placeMark,
  rotateMark,
  rotateVehicle,
  sketchSchema,
  trailFor,
} from "./sketch";
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
            birthDate: { value: "1988-05-14", confidence: 1 },
            address: { value: "Str. Fictivă 12, București", confidence: 1 },
            phone: { value: "0722 123 456", confidence: 1 },
            email: { value: "mihai@example.ro", confidence: 1 },
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
    expect(form.a.driver).toMatchObject({
      licenseNo: "B0000001",
      licenseValidTo: "20.09.2031",
      birthDate: "14.05.1988",
      address: "Str. Fictivă 12, București",
      country: "România",
      contact: "0722 123 456 / mihai@example.ro",
    });
    expect(form.a.holder).toMatchObject({ address: "Str. Fictivă 12, București", contact: "0722 123 456 / mihai@example.ro" });
    expect(form.a.insurance.branchCountry).toBe("România");
    expect(form.a.insurance).toMatchObject({ validFrom: "01.03.2026", validTo: "28.02.2027" });
    expect(form.a.impactPoint).toBe("right");
    expect(countChecked(form.a)).toBe(2);
    expect(form.b).toEqual(emptyParty()); // B nu a trimis încă
  });

  it("umple coloana B din datele trimise de șoferul B, cu aceleași reguli ca la A", () => {
    const field = (value: string) => ({ value, confidence: 1 });
    const form = buildForm(EMPTY_DRAFT, {
      documents: {
        registration: { fields: { plate: field("CJ 99 XYZ"), make: field("Ford"), model: field("Focus") } },
        license: { fields: { fullName: field("POPA Ana"), licenseNo: field("C1"), categories: field("B"), expiresOn: field("2030-05-05") } },
        policy: { fields: { insurer: field("Alt SA"), policyNo: field("RCA2"), validFrom: field("2026-02-01"), validTo: field("2027-01-31") } },
      },
      circumstances: { checked: [1, 12], impact: "rear", damage: "bara spate", notes: "" },
    });
    expect(form.b.vehicle).toMatchObject({ makeType: "Ford Focus", plate: "CJ 99 XYZ" });
    expect(form.b.driver).toMatchObject({ surname: "POPA", firstName: "Ana", licenseValidTo: "05.05.2030" });
    expect(form.b.insurance).toMatchObject({ company: "Alt SA", validTo: "31.01.2027" });
    expect(form.b.impactPoint).toBe("rear");
    expect(countChecked(form.b)).toBe(2);
    expect(countChecked(form.a)).toBe(0);
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

describe("schiță: moduri și editare", () => {
  it("validează cele trei moduri și respinge ce nu e poză", () => {
    expect(sketchSchema.safeParse(defaultTemplateSketch()).success).toBe(true);
    expect(sketchSchema.safeParse({ mode: "drawing", strokes: [[[1, 2], [3, 4]]], marks: [{ who: "A", x: 10, y: 10 }] }).success).toBe(true);
    expect(sketchSchema.safeParse({ mode: "photo", image: "data:image/jpeg;base64,AAAA" }).success).toBe(true);
    expect(sketchSchema.safeParse({ mode: "photo", image: "https://exemplu.ro/x.jpg" }).success).toBe(false);
    expect(sketchSchema.safeParse({ mode: "drawing", strokes: [[[1000, 2]]], marks: [] }).success).toBe(false);
  });

  it("recunoaște o schiță goală", () => {
    expect(isSketchEmpty(null)).toBe(true);
    expect(isSketchEmpty({ mode: "drawing", strokes: [], marks: [] })).toBe(true);
    expect(isSketchEmpty(defaultTemplateSketch())).toBe(false);
  });

  it("urma vehiculului stă în spatele lui, pe direcția de mers", () => {
    const [start, end] = trailFor({ x: 200, y: 100, angle: 0 }); // merge în sus, deci urma e dedesubt
    expect(end.y).toBeGreaterThan(100);
    expect(start.y).toBeGreaterThan(end.y);
    expect(start.x).toBe(200);
    const [, east] = trailFor({ x: 200, y: 100, angle: 90 }); // merge spre dreapta, deci urma e în stânga
    expect(east.x).toBeLessThan(200);
  });

  it("mută vehiculul în limitele caietului și îi recalculează urma", () => {
    const v = defaultTemplateSketch().vehicles.A;
    const moved = moveVehicle(v, { x: 9999, y: -50 });
    expect(moved.x).toBe(450);
    expect(moved.y).toBe(0);
    expect(moved.path).toEqual(trailFor(moved));
  });

  it("rotește vehiculul și păstrează unghiul în intervalul -180..180", () => {
    const v = { ...defaultTemplateSketch().vehicles.A, angle: 170 };
    expect(rotateVehicle(v, 30).angle).toBe(-160);
    expect(rotateVehicle(v, -15).angle).toBe(155);
  });

  it("desenul: ignoră punctele prea apropiate și ține câte un marcaj A și B", () => {
    let s = extendStroke([], { x: 10, y: 10 }, 0);
    s = extendStroke(s, { x: 10.5, y: 10.5 });
    expect(s).toHaveLength(1);
    s = extendStroke(s, { x: 30, y: 40 });
    expect(s).toEqual([[10, 10], [30, 40]]);
    const marks = placeMark(placeMark([], "A", { x: 5, y: 5 }), "A", { x: 50, y: 60 });
    expect(marks).toEqual([{ who: "A", x: 50, y: 60, angle: 0 }]);
  });

  it("mașinile de pe desen se rotesc și își păstrează orientarea când sunt mutate", () => {
    let marks = placeMark([], "B", { x: 100, y: 100 });
    marks = rotateMark(marks, "B", 90);
    expect(marks[0].angle).toBe(90);
    marks = placeMark(marks, "B", { x: 200, y: 50 });
    expect(marks).toEqual([{ who: "B", x: 200, y: 50, angle: 90 }]);
    expect(rotateMark(marks, "B", 100)[0].angle).toBe(-170);
    expect(rotateMark(marks, "A", 45)).toEqual(marks); // A nu e pe desen: nimic de rotit
    const parsed = sketchSchema.parse({ mode: "drawing", strokes: [], marks: [{ who: "A", x: 1, y: 1 }] });
    expect(parsed.mode === "drawing" && parsed.marks[0].angle).toBe(0); // desenele vechi, fără unghi, rămân valide
  });

  it("calculează unghiul spre cursor, în trepte de 5°", () => {
    const o = { x: 100, y: 100 };
    expect(angleToward(o, { x: 100, y: 50 })).toBe(0);
    expect(angleToward(o, { x: 150, y: 100 })).toBe(90);
    expect(angleToward(o, { x: 100, y: 150 })).toBe(180);
    expect(angleToward(o, { x: 50, y: 100 })).toBe(-90);
    expect(angleToward(o, { x: 150, y: 52 })).toBe(45); // ~46,2° se rotunjește la 45°
    expect(angleToward(o, { x: 101, y: 101 })).toBeNull(); // prea aproape de centru
  });

  it("micșorează poza fără s-o mărească", () => {
    expect(fitWithin(4000, 3000, 1000)).toEqual({ width: 1000, height: 750 });
    expect(fitWithin(800, 600, 1000)).toEqual({ width: 800, height: 600 });
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
