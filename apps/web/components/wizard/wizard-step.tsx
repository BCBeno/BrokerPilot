"use client";

import type { StepSlug } from "@/lib/amiabila/draft";
import { CircumstancesStep } from "./circumstances-step";
import { EligibilityStep } from "./eligibility-step";
import { ImpactStep } from "./impact-step";
import { PlaceStep } from "./place-step";
import { SafetyStep } from "./safety-step";
import { SummaryStep } from "./summary-step";

export function WizardStep({ slug }: { slug: StepSlug }) {
  switch (slug) {
    case "siguranta":
      return <SafetyStep />;
    case "eligibilitate":
      return <EligibilityStep />;
    case "loc-timp":
      return <PlaceStep />;
    case "circumstante":
      return <CircumstancesStep />;
    case "impact":
      return <ImpactStep />;
    case "rezumat":
      return <SummaryStep />;
  }
}
