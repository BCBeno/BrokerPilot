import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT } from "./draft";
import { applyVoiceHandoff, voiceLandingStep } from "./voice-handoff";

const ELIG = { injuries: "nu", twoVehicles: "da", onlyMaterialDamage: "da", bothInsured: "da", agreed: "da" };

describe("voice handoff", () => {
  it("completează eligibilitatea și locul și sare la „Loc și timp”", () => {
    const d = applyVoiceHandoff(EMPTY_DRAFT, {
      eligibility: ELIG,
      claim: { location: "Sensul giratoriu din Mărăști, Cluj", occurred: "acum", damage: "bară față", impact_zone: "front" },
    });
    expect(d.injured).toBe(false);
    expect(d.eligibility).toEqual({ twoVehicles: true, onlyMaterialDamage: true, bothInsured: true, agreed: true });
    expect(d.place).toMatchObject({ address: "Sensul giratoriu din Mărăști, Cluj", source: "manual", whenMode: "now" });
    expect(d.circumstances).toMatchObject({ damage: "bară față", impact: "front" });
    expect(voiceLandingStep(d)).toBe("loc-timp");
  });

  it("nu duce rezumatul vorbit în formular (poate conține asumarea vinei)", () => {
    const d = applyVoiceHandoff(EMPTY_DRAFT, { claim: { summary: "Cred că e vina mea" } as never });
    expect(d.circumstances.notes).toBe("");
  });

  it("nu trece peste siguranță când apelul a spus că sunt răniți sau nu a întrebat", () => {
    expect(voiceLandingStep(applyVoiceHandoff(EMPTY_DRAFT, { eligibility: { ...ELIG, injuries: "da" } }))).toBe("siguranta");
    expect(voiceLandingStep(applyVoiceHandoff(EMPTY_DRAFT, {}))).toBe("siguranta");
  });

  it("cere verificarea când un răspuns e „nu”", () => {
    const d = applyVoiceHandoff(EMPTY_DRAFT, { eligibility: { ...ELIG, bothInsured: "nu" } });
    expect(voiceLandingStep(d)).toBe("eligibilitate");
  });

  it("nu suprascrie ce a completat deja clientul și ignoră valori nevalide", () => {
    const base = { ...EMPTY_DRAFT, place: { ...EMPTY_DRAFT.place, address: "Str. Mea 1" } };
    const d = applyVoiceHandoff(base, { claim: { location: "Altundeva", impact_zone: "sus", damage: 5 } });
    expect(d.place.address).toBe("Str. Mea 1");
    expect(d.circumstances.impact).toBeNull();
    expect(d.circumstances.damage).toBe("");
  });
});
