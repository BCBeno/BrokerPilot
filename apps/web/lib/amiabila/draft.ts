import { z } from "zod";
import { ELIGIBILITY_KEYS, IMPACT_ZONES, type EligibilityKey } from "./content";

/** Pașii wizard-ului, în ordine. S3 adaugă aici „acte”, „sofer-b”, „poze”, „semnatura”. „rezumat” nu intră în progres. */
export const STEPS = [
  { slug: "siguranta", title: "Siguranță" },
  { slug: "eligibilitate", title: "Verificare" },
  { slug: "loc-timp", title: "Loc și timp" },
  { slug: "circumstante", title: "Circumstanțe" },
  { slug: "impact", title: "Impact" },
] as const;
export type StepSlug = (typeof STEPS)[number]["slug"] | "rezumat";

const answer = z.boolean().nullable();

export const draftSchema = z.object({
  injured: answer,
  eligibility: z.object(
    Object.fromEntries(ELIGIBILITY_KEYS.map((k) => [k, answer])) as Record<EligibilityKey, typeof answer>,
  ),
  place: z.object({
    address: z.string().max(300),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    source: z.enum(["gps", "manual"]).nullable(),
    whenMode: z.enum(["now", "custom"]),
    /** Format `YYYY-MM-DDTHH:mm`, ora locală a telefonului. Contează doar când `whenMode` e „custom”. */
    customWhen: z.string().max(16),
    /** ISO complet, completat la „Continuă”. */
    occurredAt: z.string().nullable(),
  }),
  circumstances: z.object({
    checked: z.array(z.number().int().min(1).max(17)).max(17),
    impact: z.enum(IMPACT_ZONES).nullable(),
    damage: z.string().max(1000),
    notes: z.string().max(1000),
  }),
});
export type Draft = z.infer<typeof draftSchema>;

export const EMPTY_DRAFT: Draft = {
  injured: null,
  eligibility: { twoVehicles: null, onlyMaterialDamage: null, bothInsured: null, agreed: null },
  place: { address: "", lat: null, lng: null, source: null, whenMode: "now", customWhen: "", occurredAt: null },
  circumstances: { checked: [], impact: null, damage: "", notes: "" },
};

/** Parsează ce e în storage. La orice nepotrivire (versiune veche, date stricate) pornește de la zero. */
export function parseDraft(raw: string | null): Draft {
  if (!raw) return EMPTY_DRAFT;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export type EligibilityResult =
  | { status: "incomplete" }
  | { status: "eligible" }
  | { status: "blocked"; failed: EligibilityKey[] };

export function evaluateEligibility(e: Draft["eligibility"]): EligibilityResult {
  const failed = ELIGIBILITY_KEYS.filter((k) => e[k] === false);
  if (failed.length > 0) return { status: "blocked", failed };
  if (ELIGIBILITY_KEYS.some((k) => e[k] === null)) return { status: "incomplete" };
  return { status: "eligible" };
}

/** `now` e parametru ca funcția să rămână pură și testabilă. */
export function resolveOccurredAt(place: Draft["place"], now: Date): string | null {
  if (place.whenMode === "now") return now.toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(place.customWhen)) return null;
  const parsed = new Date(place.customWhen);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now.getTime() + 5 * 60_000) return null;
  return parsed.toISOString();
}

export function canContinue(slug: StepSlug, draft: Draft, now: Date): boolean {
  switch (slug) {
    case "siguranta":
      return draft.injured === false;
    case "eligibilitate":
      return evaluateEligibility(draft.eligibility).status === "eligible";
    case "loc-timp":
      return draft.place.address.trim().length >= 3 && resolveOccurredAt(draft.place, now) !== null;
    case "circumstante":
      return draft.circumstances.checked.length > 0;
    case "impact":
      return draft.circumstances.impact !== null;
    case "rezumat":
      return true;
  }
}

export function stepIndex(slug: StepSlug): number {
  return STEPS.findIndex((s) => s.slug === slug);
}

export function nextSlug(slug: StepSlug): StepSlug | null {
  if (slug === "rezumat") return null;
  const i = stepIndex(slug);
  return i === STEPS.length - 1 ? "rezumat" : STEPS[i + 1].slug;
}

export function prevSlug(slug: StepSlug): StepSlug | null {
  if (slug === "rezumat") return STEPS[STEPS.length - 1].slug;
  const i = stepIndex(slug);
  return i <= 0 ? null : STEPS[i - 1].slug;
}

export function isStepSlug(value: string): value is StepSlug {
  return value === "rezumat" || STEPS.some((s) => s.slug === value);
}

export function toggleCircumstance(checked: number[], n: number): number[] {
  return checked.includes(n) ? checked.filter((x) => x !== n) : [...checked, n].sort((a, b) => a - b);
}
