"use client";

import { Ambulance, Phone, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { updateDraft, useDraft } from "@/lib/amiabila/draft-store";
import { ChoiceQuestion } from "./choice";
import { StepFrame } from "./step-frame";

export function SafetyStep() {
  const draft = useDraft();

  if (draft.injured === true) {
    return (
      <StepFrame
        slug="siguranta"
        heading="Sunați acum la 112"
        lead="Când cineva e rănit, amiabila nu se completează. Contează ajutorul."
        continueLabel={null}
      >
        <a
          href="tel:112"
          className="flex h-16 w-full items-center justify-center gap-3 rounded-lg bg-destructive text-xl font-bold text-destructive-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Phone className="size-6" aria-hidden />
          Sună la 112
        </a>
        <Alert variant="destructive" className="border-destructive/30 p-4">
          <TriangleAlert aria-hidden />
          <AlertTitle className="text-base">Până vine ajutorul</AlertTitle>
          <AlertDescription className="text-[17px] text-foreground">
            <ul className="mt-1 list-disc space-y-2 pl-5">
              <li>Spuneți unde sunteți și câți răniți sunt.</li>
              <li>Nu mutați persoanele rănite, decât dacă sunt în pericol imediat.</li>
              <li>Porniți luminile de avarie și rămâneți pe loc.</li>
            </ul>
          </AlertDescription>
        </Alert>
        <Button
          variant="ghost"
          className="h-12 w-full text-base"
          onClick={() => updateDraft((d) => ({ ...d, injured: null }))}
        >
          Am greșit, nu e nimeni rănit
        </Button>
      </StepFrame>
    );
  }

  return (
    <StepFrame
      slug="siguranta"
      heading="Mai întâi, siguranța"
      lead="Porniți luminile de avarie. Dacă e cazul, puneți triunghiul reflectorizant."
      canContinue={draft.injured === false}
      disabledHint="Alegeți un răspuns ca să continuați."
    >
      <ChoiceQuestion
        name="injured"
        icon={Ambulance}
        question="Este cineva rănit?"
        value={draft.injured}
        onChange={(injured) => updateDraft((d) => ({ ...d, injured }))}
        yesLabel="Da, cineva e rănit"
        noLabel="Nu, nimeni nu e rănit"
      />
    </StepFrame>
  );
}
