import { ELIGIBILITY_KEYS, IMPACT_ZONES, type ImpactZone } from "./content";
import type { Draft, StepSlug } from "./draft";

/**
 * Ce a aflat asistentul vocal în apel și poate pune în ciorna wizard-ului, ca clientul să nu mai răspundă a doua oară.
 * Valorile vin din argumentele uneltelor Vapi (`check_eligibility`, `start_claim`), deci le tratăm ca input nesigur.
 */
export type VoiceHandoff = {
  eligibility?: Partial<Record<"injuries" | (typeof ELIGIBILITY_KEYS)[number], unknown>>;
  claim?: { location?: unknown; occurred?: unknown; damage?: unknown; impact_zone?: unknown };
};

const yesNo = (v: unknown): boolean | null => {
  const t = String(v ?? "").trim().toLowerCase();
  if (t === "da" || t === "true") return true;
  if (t === "nu" || t === "false") return false;
  return null;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Completează doar ce lipsește în ciornă: ce a scris deja clientul nu se suprascrie. */
export function applyVoiceHandoff(draft: Draft, h: VoiceHandoff): Draft {
  const next: Draft = structuredClone(draft);

  const inj = yesNo(h.eligibility?.injuries);
  if (inj !== null && next.injured === null) next.injured = inj;
  for (const k of ELIGIBILITY_KEYS) {
    const v = yesNo(h.eligibility?.[k]);
    if (v !== null && next.eligibility[k] === null) next.eligibility[k] = v;
  }

  const c = h.claim ?? {};
  const location = text(c.location, 300);
  if (location.length >= 3 && next.place.address.trim() === "") {
    next.place.address = location;
    next.place.source = "manual";
  }
  if (typeof c.occurred === "string" && /^acum|chiar/i.test(c.occurred.trim())) next.place.whenMode = "now";
  const damage = text(c.damage, 1000);
  if (damage && next.circumstances.damage === "") next.circumstances.damage = damage;
  const zone = text(c.impact_zone, 20) as ImpactZone;
  if ((IMPACT_ZONES as readonly string[]).includes(zone) && next.circumstances.impact === null) next.circumstances.impact = zone;
  // `summary` NU intră în ciornă: „Observații” ajunge în formularul oficial, iar rezumatul vorbit poate conține o asumare de vină.
  return next;
}

/** Primul pas pe care clientul trebuie încă să-l vadă: sărim siguranța și verificarea dacă apelul le-a acoperit. */
export function voiceLandingStep(draft: Draft): StepSlug {
  if (draft.injured !== false) return "siguranta";
  if (ELIGIBILITY_KEYS.some((k) => draft.eligibility[k] !== true)) return "eligibilitate";
  return "loc-timp";
}
