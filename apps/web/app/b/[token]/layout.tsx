import type { Metadata } from "next";
import { BWizardProvider } from "@/components/wizard/wizard-context";

export const metadata: Metadata = {
  title: "Amiabilă digitală, șofer B | BrokerPilot",
  robots: { index: false },
  referrer: "no-referrer", // tokenul din adresă nu trebuie să ajungă în antetul Referer
};

export default async function BLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BWizardProvider token={token}>{children}</BWizardProvider>;
}
