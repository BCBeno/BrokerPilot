import { describe, expect, it } from "vitest";
import { DOC_META, type DocType, type ExtractedDoc } from "@/lib/amiabila/documents";
import type { PartySubmission } from "@/lib/amiabila/claim";
import { isComplete, missingItems, type CompletenessInput } from "./completeness";
import { MAX_SIGNATURE_BYTES, parseSignature, photoPath, signaturePath } from "./files";

const filled = (type: DocType): ExtractedDoc => ({
  fields: Object.fromEntries(DOC_META[type].fields.map((f) => [f.key, { value: "x", confidence: 1 }])),
});
const party = (): PartySubmission => ({
  documents: { registration: filled("registration"), license: filled("license"), policy: filled("policy") },
  circumstances: { checked: [3], impact: "front", damage: "", notes: "" },
});
const full = (): CompletenessInput => ({
  partyA: party(),
  partyB: party(),
  photosA: 2,
  photosB: 1,
  hasSketch: true,
  signedA: true,
  signedB: true,
});

const png = (extra = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8 + extra, 1)]);
const url = (buf: Buffer, mime = "image/png") => `data:${mime};base64,${buf.toString("base64")}`;

describe("missingItems", () => {
  it("dosar complet: nimic lipsă", () => {
    expect(missingItems(full())).toEqual([]);
    expect(isComplete(missingItems(full()))).toBe(true);
  });
  it("semnăturile lipsă blochează", () => {
    const items = missingItems({ ...full(), signedB: false });
    expect(items.map((i) => i.code)).toEqual(["signature_B"]);
    expect(isComplete(items)).toBe(false);
  });
  it("pozele și schița lipsă sunt doar recomandări", () => {
    const items = missingItems({ ...full(), photosA: 0, photosB: 0, hasSketch: false });
    expect(items.map((i) => i.code)).toEqual(["photos_A", "photos_B", "sketch"]);
    expect(isComplete(items)).toBe(true);
  });
  it("B netrimis: datele lui lipsesc și blochează", () => {
    const items = missingItems({ ...full(), partyB: null });
    expect(items).toContainEqual({ code: "party_B", label: "Datele șoferului B lipsesc", blocking: true });
    expect(isComplete(items)).toBe(false);
  });
  it("acte nesigure sau circumstanțe goale sunt blocante", () => {
    const a = party();
    a.documents.policy = null;
    a.circumstances.checked = [];
    a.circumstances.impact = null;
    const codes = missingItems({ ...full(), partyA: a }).map((i) => i.code);
    expect(codes).toEqual(["docs_A", "circumstances_A", "impact_A"]);
  });
});

describe("parseSignature", () => {
  it("acceptă un PNG în format data URL", () => {
    expect(parseSignature(url(png()))?.length).toBe(png().length);
  });
  it("respinge alt tip, antet greșit, gol sau prea mare", () => {
    expect(parseSignature(url(png(), "image/jpeg"))).toBeNull();
    expect(parseSignature(url(Buffer.alloc(20, 7)))).toBeNull();
    expect(parseSignature("data:image/png;base64,")).toBeNull();
    expect(parseSignature(url(png(MAX_SIGNATURE_BYTES)))).toBeNull();
    expect(parseSignature(123)).toBeNull();
    expect(parseSignature("data:image/png;base64,@@@")).toBeNull();
  });
});

describe("căile din Storage", () => {
  it("sunt separate pe dosar și șofer", () => {
    expect(signaturePath("c1", "A")).toBe("claims/c1/signature-A.png");
    expect(photoPath("c1", "B", "f9")).toBe("claims/c1/photo-B-f9.jpg");
  });
});
