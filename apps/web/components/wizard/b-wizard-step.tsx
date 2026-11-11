"use client";

import { BSummaryStep } from "./b-summary-step";
import { CircumstancesStep } from "./circumstances-step";
import { DocsStep } from "./docs-step";
import { ImpactStep } from "./impact-step";
import { PhotosStep } from "./photos-step";
import { SignatureStep } from "./signature-step";

export function BWizardStep({ slug }: { slug: "acte" | "circumstante" | "impact" | "poze" | "rezumat" | "semnatura" }) {
  switch (slug) {
    case "acte":
      return <DocsStep />;
    case "circumstante":
      return <CircumstancesStep />;
    case "impact":
      return <ImpactStep />;
    case "poze":
      return <PhotosStep />;
    case "rezumat":
      return <BSummaryStep />;
    case "semnatura":
      return <SignatureStep />;
  }
}
