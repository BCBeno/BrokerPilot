import { describe, expect, it } from "vitest";
import {
  DOC_META,
  SCANNABLE_TYPES,
  confirmDoc,
  emptyDoc,
  policyMatchesVehicle,
  LOW_CONFIDENCE,
  editField,
  extractionSchema,
  isDocConfirmed,
  normalizeDate,
  normalizeExtraction,
  normalizePlate,
  normalizeVin,
  normalizeYear,
  policyCoversDate,
  type ExtractedDoc,
} from "./documents";

const NOW = new Date("2026-11-11T12:00:00.000Z");

describe("normalizePlate", () => {
  it("formatează numere românești în câteva scrieri", () => {
    expect(normalizePlate("b123abc")).toBe("B 123 ABC");
    expect(normalizePlate("B-45-XYZ")).toBe("B 45 XYZ");
    expect(normalizePlate("cj 12 abc")).toBe("CJ 12 ABC");
  });

  it("refuză ce nu arată a număr de înmatriculare", () => {
    expect(normalizePlate("ABC 123")).toBeNull();
    expect(normalizePlate("B 1234 ABC")).toBeNull();
    expect(normalizePlate("")).toBeNull();
  });
});

describe("normalizeVin", () => {
  it("cere 17 caractere fără I, O, Q", () => {
    expect(normalizeVin("wvwzzz1jzxw000001")).toBe("WVWZZZ1JZXW000001");
    expect(normalizeVin("WVWZZZ1JZXW00000")).toBeNull();
    expect(normalizeVin("WVWZZZ1JZXW00000I")).toBeNull();
  });
});

describe("normalizeDate", () => {
  it("acceptă ISO și formatul românesc", () => {
    expect(normalizeDate("2027-03-05")).toBe("2027-03-05");
    expect(normalizeDate("5.3.2027")).toBe("2027-03-05");
    expect(normalizeDate("05/03/2027")).toBe("2027-03-05");
  });

  it("refuză date care nu există", () => {
    expect(normalizeDate("2027-02-30")).toBeNull();
    expect(normalizeDate("31.04.2027")).toBeNull();
    expect(normalizeDate("mâine")).toBeNull();
  });
});

describe("normalizeYear", () => {
  it("acceptă ani plauzibili", () => {
    expect(normalizeYear("2018", NOW)).toBe("2018");
    expect(normalizeYear("1900", NOW)).toBeNull();
    expect(normalizeYear("2099", NOW)).toBeNull();
  });
});

describe("normalizeExtraction", () => {
  const doc: ExtractedDoc = {
    fields: {
      plate: { value: "b123abc", confidence: 0.95 },
      vin: { value: "prea scurt", confidence: 0.9 },
      make: { value: "  Dacia ", confidence: 0.99 },
      model: { value: null, confidence: 0.2 },
    },
  };

  it("curăță valorile valide și păstrează încrederea", () => {
    const out = normalizeExtraction("registration", doc, NOW);
    expect(out.fields.plate).toEqual({ value: "B 123 ABC", confidence: 0.95 });
    expect(out.fields.make).toEqual({ value: "Dacia", confidence: 0.99 });
  });

  it("păstrează valoarea nevalidă, dar coboară încrederea sub prag", () => {
    const out = normalizeExtraction("registration", doc, NOW);
    expect(out.fields.vin.value).toBe("prea scurt");
    expect(out.fields.vin.confidence).toBeLessThan(LOW_CONFIDENCE);
  });

  it("completează câmpurile care lipsesc cu null și încredere 0", () => {
    const out = normalizeExtraction("registration", doc, NOW);
    expect(out.fields.model).toEqual({ value: null, confidence: 0 });
    expect(out.fields.year).toEqual({ value: null, confidence: 0 });
    expect(Object.keys(out.fields)).toEqual(DOC_META.registration.fields.map((f) => f.key));
  });
});

describe("extractionSchema", () => {
  it("cere toate câmpurile documentului", () => {
    const schema = extractionSchema("license");
    expect(schema.safeParse({ fields: {} }).success).toBe(false);
    const full = Object.fromEntries(DOC_META.license.fields.map((f) => [f.key, { value: null, confidence: 0 }]));
    expect(schema.safeParse({ fields: full }).success).toBe(true);
  });

  it("respinge încrederea în afara intervalului 0–1", () => {
    const full = Object.fromEntries(DOC_META.license.fields.map((f) => [f.key, { value: "x", confidence: 1.4 }]));
    expect(extractionSchema("license").safeParse({ fields: full }).success).toBe(false);
  });
});

describe("verificare de către om", () => {
  const ok = (value: string) => ({ value, confidence: 0.95 });
  const policy = (over: Partial<Record<string, { value: string | null; confidence: number }>> = {}): ExtractedDoc => ({
    fields: {
      insurer: ok("Asigurator Fictiv SA"),
      policyNo: ok("RCA 0001234"),
      validFrom: ok("2026-01-01"),
      validTo: ok("2026-12-31"),
      plate: ok("B 123 ABC"),
      ...over,
    },
  });

  it("un act e confirmat doar dacă toate câmpurile sunt completate și sigure", () => {
    expect(isDocConfirmed("policy", policy())).toBe(true);
    expect(isDocConfirmed("policy", policy({ insurer: { value: null, confidence: 0 } }))).toBe(false);
    expect(isDocConfirmed("policy", policy({ validTo: { value: "2026-12-31", confidence: 0.5 } }))).toBe(false);
    expect(isDocConfirmed("policy", null)).toBe(false);
  });

  it("o valoare editată de om primește încredere maximă dacă trece validarea", () => {
    const def = DOC_META.policy.fields.find((f) => f.key === "validTo")!;
    expect(editField(def, "31.12.2026", NOW)).toEqual({ value: "2026-12-31", confidence: 1 });
    expect(editField(def, "", NOW)).toEqual({ value: null, confidence: 0 });
    expect(editField(def, "curând", NOW).confidence).toBeLessThan(LOW_CONFIDENCE);
  });

  it("verifică dacă polița acoperă data accidentului", () => {
    expect(policyCoversDate(policy(), NOW)).toBe(true);
    expect(policyCoversDate(policy({ validTo: ok("2026-10-01") }), NOW)).toBe(false);
    expect(policyCoversDate(policy({ validTo: { value: null, confidence: 0 } }), NOW)).toBeNull();
  });
});

describe("confirmDoc / emptyDoc / policyMatchesVehicle", () => {
  it("emptyDoc are toate câmpurile goale și nu e confirmat", () => {
    const empty = emptyDoc("license");
    expect(Object.keys(empty.fields)).toEqual(DOC_META.license.fields.map((f) => f.key));
    expect(isDocConfirmed("license", empty)).toBe(false);
  });

  it("confirmDoc ridică încrederea câmpurilor valide, dar nu și pe cele goale sau în format greșit", () => {
    const doc: ExtractedDoc = {
      fields: {
        fullName: { value: "POPESCU ION", confidence: 0.5 },
        licenseNo: { value: null, confidence: 0 },
        categories: { value: "B", confidence: 0.6 },
        expiresOn: { value: "curând", confidence: 0.4 },
      },
    };
    const out = confirmDoc("license", doc, NOW);
    expect(out.fields.fullName.confidence).toBe(1);
    expect(out.fields.categories.confidence).toBe(1);
    expect(out.fields.licenseNo.confidence).toBe(0);
    expect(out.fields.expiresOn.confidence).toBeLessThan(LOW_CONFIDENCE);
    expect(isDocConfirmed("license", out)).toBe(false);
  });

  it("compară numerele fără spații", () => {
    const reg: ExtractedDoc = { fields: { plate: { value: "B 123 ABC", confidence: 1 } } };
    const pol: ExtractedDoc = { fields: { plate: { value: "B123ABC", confidence: 1 } } };
    expect(policyMatchesVehicle(reg, pol)).toBe(true);
    expect(policyMatchesVehicle(reg, { fields: { plate: { value: "CJ 12 XYZ", confidence: 1 } } })).toBe(false);
    expect(policyMatchesVehicle(reg, null)).toBeNull();
  });
});

describe("minimizarea datelor", () => {
  it("nu cerem și nu stocăm numele titularului din talon sau poliță", () => {
    const keys = [...DOC_META.registration.fields, ...DOC_META.policy.fields].map((f) => f.key);
    expect(keys).not.toContain("holderName");
    expect(keys).not.toContain("insuredName");
  });

  it("permisul nu se poate scana, doar talonul și polița", () => {
    expect(SCANNABLE_TYPES).toEqual(["registration", "policy"]);
    expect(DOC_META.license.scannable).toBe(false);
  });
});
