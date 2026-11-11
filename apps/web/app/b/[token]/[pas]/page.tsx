import { notFound } from "next/navigation";
import { BWizardStep } from "@/components/wizard/b-wizard-step";
import { B_STEPS } from "@/lib/amiabila/draft";

export default async function BStepPage({ params }: { params: Promise<{ pas: string }> }) {
  const { pas } = await params;
  if (pas !== "rezumat" && !B_STEPS.some((s) => s.slug === pas)) notFound();
  return <BWizardStep slug={pas as "acte" | "circumstante" | "impact" | "rezumat"} />;
}
