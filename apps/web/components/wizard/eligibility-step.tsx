"use client";

import { CarFront, HeartPulse, Handshake, Phone, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ELIGIBILITY_KEYS, ELIGIBILITY_QUESTIONS, DISCLAIMER, type EligibilityKey } from "@/lib/amiabila/content";
import { evaluateEligibility } from "@/lib/amiabila/draft";
import { updateDraft, useDraft } from "@/lib/amiabila/draft-store";
import { ChoiceQuestion } from "./choice";
import { StepFrame } from "./step-frame";

const ICONS: Record<EligibilityKey, LucideIcon> = {
  twoVehicles: CarFront,
  onlyMaterialDamage: HeartPulse,
  bothInsured: ShieldCheck,
  agreed: Handshake,
};

export function EligibilityStep() {
  const draft = useDraft();
  const e = draft.eligibility;
  const result = evaluateEligibility(e);

  // Întrebările apar pe rând: toate cele răspunse cu „da” și prima rămasă (fără răspuns sau cu „nu”).
  const stop = ELIGIBILITY_KEYS.findIndex((k) => e[k] !== true);
  const shown = stop === -1 ? ELIGIBILITY_KEYS : ELIGIBILITY_KEYS.slice(0, stop + 1);

  return (
    <StepFrame
      slug="eligibilitate"
      heading="Se poate completa amiabila?"
      lead="Patru întrebări despre accident. Durează un minut."
      canContinue={result.status === "eligible"}
      disabledHint={
        result.status === "blocked" ? "Aici nu putem continua amiabila." : "Răspundeți la întrebări ca să continuați."
      }
      footnote={DISCLAIMER}
    >
      {shown.map((key) => {
        const q = ELIGIBILITY_QUESTIONS[key];
        return (
          <ChoiceQuestion
            key={key}
            name={key}
            icon={ICONS[key]}
            question={q.question}
            hint={q.hint}
            yesLabel={q.yes}
            noLabel={q.no}
            value={e[key]}
            onChange={(value) => updateDraft((d) => ({ ...d, eligibility: { ...d.eligibility, [key]: value } }))}
          />
        );
      })}

      {result.status === "blocked" ? (
        <Alert className="gap-y-2 border-2 border-primary p-4" aria-live="polite">
          <TriangleAlert aria-hidden />
          <AlertTitle className="text-lg">Este nevoie de poliție</AlertTitle>
          <AlertDescription className="space-y-3 text-[17px] text-foreground [&_a]:no-underline">
            <ul className="list-disc space-y-1 pl-5">
              {result.failed.map((k) => (
                <li key={k}>{ELIGIBILITY_QUESTIONS[k].blockedReason}</li>
              ))}
            </ul>
            <p className="font-semibold">Ce faceți acum</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Sunați la 112 și cereți să fie constatat accidentul.</li>
              <li>Rămâneți pe loc până vine poliția.</li>
              <li>Fotografiați vehiculele și locul accidentului.</li>
            </ol>
            <a
              href="tel:112"
              className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Phone className="size-5" aria-hidden />
              Sună la 112
            </a>
            <p className="text-[15px] text-muted-foreground">Ați răspuns greșit? Schimbați răspunsul mai sus.</p>
          </AlertDescription>
        </Alert>
      ) : null}
    </StepFrame>
  );
}
