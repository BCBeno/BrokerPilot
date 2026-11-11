import { z } from "zod";
import { ELIGIBILITY_KEYS, IMPACT_ZONES, type EligibilityKey } from "./content";
import { DOC_TYPES, extractedDocSchema, isDocConfirmed, type DocType } from "./documents";
import { sketchSchema } from "./sketch";

/** Pașii wizard-ului, în ordine. „rezumat” și „semnatura” vin la final și nu intră în progres. */
export const STEPS = [
  { slug: "siguranta", title: "Siguranță" },
  { slug: "eligibilitate", title: "Verificare" },
  { slug: "loc-timp", title: "Loc și timp" },
  { slug: "acte", title: "Acte" },
  { slug: "sofer-b", title: "Șofer B" },
  { slug: "circumstante", title: "Circumstanțe" },
  { slug: "impact", title: "Impact" },
  { slug: "schita", title: "Schiță" },
  { slug: "poze", title: "Poze" },
] as const;
export type StepSlug = (typeof STEPS)[number]["slug"] | "rezumat" | "semnatura";

/** Pașii șoferului B, pe telefonul lui (`/b/[token]`). „rezumat” = verificare și trimitere. */
export const B_STEPS = [
  { slug: "acte", title: "Acte" },
  { slug: "circumstante", title: "Circumstanțe" },
  { slug: "impact", title: "Impact" },
  { slug: "poze", title: "Poze" },
] as const;
export type StepList = readonly { readonly slug: Exclude<StepSlug, "rezumat" | "semnatura">; readonly title: string }[];

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
  /** Acordul pentru trimiterea pozelor de acte la serviciul AI (excepția GDPR din ADR). */
  documentsConsent: z.boolean(),
  documents: z.object(
    Object.fromEntries(DOC_TYPES.map((t) => [t, extractedDocSchema.nullable()])) as Record<
      DocType,
      z.ZodNullable<typeof extractedDocSchema>
    >,
  ),
  circumstances: z.object({
    checked: z.array(z.number().int().min(1).max(17)).max(17),
    impact: z.enum(IMPACT_ZONES).nullable(),
    damage: z.string().max(1000),
    notes: z.string().max(1000),
  }),
  /** Schița accidentului (caseta 13), în modul ales de șofer. `default` păstrează ciornele salvate înainte să existe schița. */
  sketch: sketchSchema.nullable().default(null),
  /** Dosarul creat pe server la pasul „Șofer B”. `aToken` = cheia lui A pentru status și actualizări; `joinToken` = linkul lui B. */
  claim: z
    .object({
      id: z.string().uuid(),
      ref: z.string().max(40),
      aToken: z.string().max(64),
      joinToken: z.string().max(64),
      joinExpiresAt: z.string(),
    })
    .nullable()
    .default(null),
});
export type Draft = z.infer<typeof draftSchema>;

export const EMPTY_DRAFT: Draft = {
  injured: null,
  eligibility: { twoVehicles: null, onlyMaterialDamage: null, bothInsured: null, agreed: null },
  place: { address: "", lat: null, lng: null, source: null, whenMode: "now", customWhen: "", occurredAt: null },
  documentsConsent: false,
  documents: { registration: null, license: null, policy: null },
  circumstances: { checked: [], impact: null, damage: "", notes: "" },
  sketch: null,
  claim: null,
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
    case "acte":
      return DOC_TYPES.every((t) => isDocConfirmed(t, draft.documents[t]));
    case "sofer-b":
      return draft.claim !== null;
    case "circumstante":
      return draft.circumstances.checked.length > 0;
    case "impact":
      return draft.circumstances.impact !== null;
    case "schita":
      return true; // schița se recomandă, dar nu blochează: se poate completa și la poliție
    case "poze": // pozele se recomandă, dar nu blochează
    case "rezumat":
    case "semnatura":
      return true;
  }
}

export function stepIndex(slug: StepSlug, steps: StepList = STEPS): number {
  return steps.findIndex((s) => s.slug === slug);
}

export function nextSlug(slug: StepSlug, steps: StepList = STEPS): StepSlug | null {
  if (slug === "rezumat" || slug === "semnatura") return null;
  const i = stepIndex(slug, steps);
  return i === steps.length - 1 ? "rezumat" : steps[i + 1].slug;
}

export function prevSlug(slug: StepSlug, steps: StepList = STEPS): StepSlug | null {
  if (slug === "semnatura") return "rezumat";
  if (slug === "rezumat") return steps[steps.length - 1].slug;
  const i = stepIndex(slug, steps);
  return i <= 0 ? null : steps[i - 1].slug;
}

export function isStepSlug(value: string): value is StepSlug {
  return value === "rezumat" || value === "semnatura" || STEPS.some((s) => s.slug === value);
}

export function toggleCircumstance(checked: number[], n: number): number[] {
  return checked.includes(n) ? checked.filter((x) => x !== n) : [...checked, n].sort((a, b) => a - b);
}
