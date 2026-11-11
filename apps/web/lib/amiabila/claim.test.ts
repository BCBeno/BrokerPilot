import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT } from "./draft";
import { DOC_META, DOC_TYPES, type DocType, type ExtractedDoc } from "./documents";
import { createClaimSchema, documentsFromColumns, isExpired, partyColumns, submissionProblem, type PartySubmission } from "./claim";

const filled = (type: DocType): ExtractedDoc => ({
  fields: Object.fromEntries(DOC_META[type].fields.map((f) => [f.key, { value: "x", confidence: 1 }])),
});

const complete = (): PartySubmission => ({
  documents: { registration: filled("registration"), license: filled("license"), policy: filled("policy") },
  circumstances: { checked: [3], impact: "front", damage: "", notes: "" },
});

describe("submissionProblem", () => {
  it("acceptă o trimitere completă", () => {
    expect(submissionProblem(complete())).toBeNull();
  });
  it("refuză acte lipsă, nesigure sau neverificate", () => {
    const s = complete();
    s.documents.policy = null;
    expect(submissionProblem(s)).toMatch(/acte/i);
    const low = complete();
    low.documents.license = { fields: { ...filled("license").fields, fullName: { value: "x", confidence: 0.2 } } };
    expect(submissionProblem(low)).toMatch(/acte/i);
  });
  it("cere circumstanțe și zona lovită", () => {
    const a = complete();
    a.circumstances.checked = [];
    expect(submissionProblem(a)).toMatch(/circumstanță/i);
    const b = complete();
    b.circumstances.impact = null;
    expect(submissionProblem(b)).toMatch(/zona/i);
  });
});

describe("partyColumns", () => {
  it("separă valorile de încredere", () => {
    const c = partyColumns(complete().documents);
    expect(c.vehicle).toMatchObject({ plate: "x", vin: "x" });
    expect(c.driver).toHaveProperty("licenseNo", "x");
    expect(c.insurance).toHaveProperty("policyNo", "x");
    expect(c.extraction_confidence.registration).toMatchObject({ plate: 1 });
  });
  it("acoperă toate tipurile de acte, chiar și lipsă", () => {
    const c = partyColumns({ registration: null, license: null, policy: null });
    expect(c.vehicle).toEqual({});
    expect(Object.keys(c.extraction_confidence)).toEqual([...DOC_TYPES]);
  });
});

describe("createClaimSchema", () => {
  const base = {
    documents: complete().documents,
    eligibility: EMPTY_DRAFT.eligibility,
    place: { address: "Str. Test 1, București", lat: 44.4, lng: 26.1, occurredAt: "2026-11-11T10:00:00.000Z" },
  };
  it("acceptă o cerere validă", () => {
    expect(createClaimSchema.safeParse(base).success).toBe(true);
  });
  it("refuză adresa scurtă și coordonatele imposibile", () => {
    expect(createClaimSchema.safeParse({ ...base, place: { ...base.place, address: "a" } }).success).toBe(false);
    expect(createClaimSchema.safeParse({ ...base, place: { ...base.place, lat: 123 } }).success).toBe(false);
  });
});

describe("isExpired", () => {
  const now = new Date("2026-11-11T12:00:00.000Z");
  it("compară cu momentul dat", () => {
    expect(isExpired("2026-11-11T11:59:59.000Z", now)).toBe(true);
    expect(isExpired("2026-11-11T12:00:01.000Z", now)).toBe(false);
    expect(isExpired(null, now)).toBe(false);
  });
});

describe("documentsFromColumns", () => {
  it("refă actele lui B exact așa cum au fost salvate", () => {
    const docs = complete().documents;
    const back = documentsFromColumns(partyColumns(docs));
    expect(back).toEqual(docs);
  });
  it("întoarce null cât timp B nu a trimis (driver e null)", () => {
    expect(documentsFromColumns({ driver: null, vehicle: null, insurance: null, extraction_confidence: null })).toBeNull();
  });
});
