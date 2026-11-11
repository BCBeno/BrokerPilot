import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  STEPS,
  canContinue,
  evaluateEligibility,
  nextSlug,
  parseDraft,
  prevSlug,
  resolveOccurredAt,
  toggleCircumstance,
  type Draft,
} from "./draft";
import { CIRCUMSTANCES } from "./content";

const NOW = new Date("2026-11-11T12:00:00.000Z");

describe("evaluateEligibility", () => {
  it("e incomplet cât timp există răspunsuri lipsă", () => {
    expect(evaluateEligibility(EMPTY_DRAFT.eligibility)).toEqual({ status: "incomplete" });
  });

  it("e eligibil doar cu toate răspunsurile „da”", () => {
    const all = { twoVehicles: true, onlyMaterialDamage: true, bothInsured: true, agreed: true };
    expect(evaluateEligibility(all)).toEqual({ status: "eligible" });
  });

  it("listează condițiile nerespectate, chiar dacă restul nu sunt completate", () => {
    const e = { ...EMPTY_DRAFT.eligibility, bothInsured: false, agreed: false };
    expect(evaluateEligibility(e)).toEqual({ status: "blocked", failed: ["bothInsured", "agreed"] });
  });
});

describe("navigare", () => {
  it("parcurge pașii în ordine și se oprește la rezumat", () => {
    const seen: string[] = [];
    let slug: ReturnType<typeof nextSlug> = STEPS[0].slug;
    while (slug) {
      seen.push(slug);
      slug = nextSlug(slug);
    }
    expect(seen).toEqual([...STEPS.map((s) => s.slug), "rezumat"]);
  });

  it("înapoi de la rezumat duce la ultimul pas, iar primul pas nu are anterior", () => {
    expect(prevSlug("rezumat")).toBe(STEPS[STEPS.length - 1].slug);
    expect(prevSlug(STEPS[0].slug)).toBeNull();
    expect(prevSlug("semnatura")).toBe("rezumat");
    expect(nextSlug("semnatura")).toBeNull();
  });
});

describe("canContinue", () => {
  it("blochează pasul de siguranță dacă sunt răniți sau nu s-a răspuns", () => {
    expect(canContinue("siguranta", EMPTY_DRAFT, NOW)).toBe(false);
    expect(canContinue("siguranta", { ...EMPTY_DRAFT, injured: true }, NOW)).toBe(false);
    expect(canContinue("siguranta", { ...EMPTY_DRAFT, injured: false }, NOW)).toBe(true);
  });

  it("cere adresă și o oră validă la loc și timp", () => {
    const base: Draft = { ...EMPTY_DRAFT, place: { ...EMPTY_DRAFT.place, address: "Bd. Unirii 12" } };
    expect(canContinue("loc-timp", base, NOW)).toBe(true);
    expect(canContinue("loc-timp", { ...base, place: { ...base.place, address: "  " } }, NOW)).toBe(false);
    expect(canContinue("loc-timp", { ...base, place: { ...base.place, whenMode: "custom", customWhen: "" } }, NOW)).toBe(
      false,
    );
  });

  it("cere cel puțin o circumstanță și o zonă de impact", () => {
    expect(canContinue("circumstante", EMPTY_DRAFT, NOW)).toBe(false);
    const withOne = { ...EMPTY_DRAFT, circumstances: { ...EMPTY_DRAFT.circumstances, checked: [1] } };
    expect(canContinue("circumstante", withOne, NOW)).toBe(true);
    expect(canContinue("impact", withOne, NOW)).toBe(false);
    const withImpact = { ...withOne, circumstances: { ...withOne.circumstances, impact: "front" as const } };
    expect(canContinue("impact", withImpact, NOW)).toBe(true);
  });
});

describe("resolveOccurredAt", () => {
  const place = EMPTY_DRAFT.place;

  it("„acum” folosește ora primită", () => {
    expect(resolveOccurredAt(place, NOW)).toBe(NOW.toISOString());
  });

  it("respinge ore în viitor și formate greșite", () => {
    expect(resolveOccurredAt({ ...place, whenMode: "custom", customWhen: "2026-11-12T10:00" }, NOW)).toBeNull();
    expect(resolveOccurredAt({ ...place, whenMode: "custom", customWhen: "ieri" }, NOW)).toBeNull();
  });

  it("acceptă o oră din trecut", () => {
    expect(resolveOccurredAt({ ...place, whenMode: "custom", customWhen: "2026-11-11T10:30" }, NOW)).not.toBeNull();
  });
});

describe("parseDraft", () => {
  it("revine la ciorna goală pe date lipsă sau stricate", () => {
    expect(parseDraft(null)).toBe(EMPTY_DRAFT);
    expect(parseDraft("{nu e json")).toBe(EMPTY_DRAFT);
    expect(parseDraft(JSON.stringify({ injured: "poate" }))).toBe(EMPTY_DRAFT);
  });

  it("citește o ciornă validă", () => {
    const draft: Draft = { ...EMPTY_DRAFT, injured: false };
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
  });
});

describe("circumstanțe", () => {
  it("sunt exact 17, numerotate 1–17", () => {
    expect(CIRCUMSTANCES.map((c) => c.n)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  });

  it("bifarea adaugă sortat, debifarea scoate", () => {
    expect(toggleCircumstance([3, 11], 5)).toEqual([3, 5, 11]);
    expect(toggleCircumstance([3, 5, 11], 5)).toEqual([3, 11]);
  });
});
