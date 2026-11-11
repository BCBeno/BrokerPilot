"use client";

import { BSummaryStep } from "./b-summary-step";
import { CircumstancesStep } from "./circumstances-step";
import { DocsStep } from "./docs-step";
import { ImpactStep } from "./impact-step";

export function BWizardStep({ slug }: { slug: "acte" | "circumstante" | "impact" | "rezumat" }) {
  switch (slug) {
    case "acte":
      return <DocsStep />;
    case "circumstante":
      return <CircumstancesStep />;
    case "impact":
      return <ImpactStep />;
    case "rezumat":
      return <BSummaryStep />;
  }
}
