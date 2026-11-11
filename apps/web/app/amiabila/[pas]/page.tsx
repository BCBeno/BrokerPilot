import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WizardStep } from "@/components/wizard/wizard-step";
import { STEPS, isStepSlug } from "@/lib/amiabila/draft";

export const metadata: Metadata = {
  title: "Amiabilă digitală | BrokerPilot",
  robots: { index: false },
};

export function generateStaticParams() {
  return [...STEPS.map((s) => ({ pas: s.slug })), { pas: "rezumat" }];
}

export default async function AmiabilaStepPage({ params }: { params: Promise<{ pas: string }> }) {
  const { pas } = await params;
  if (!isStepSlug(pas)) notFound();
  return <WizardStep slug={pas} />;
}
