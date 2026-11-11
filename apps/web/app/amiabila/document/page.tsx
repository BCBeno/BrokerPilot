import type { Metadata } from "next";
import { DraftDocument } from "@/components/amiabila-form/draft-document";

export const metadata: Metadata = {
  title: "Constatare amiabilă | BrokerPilot",
  robots: { index: false },
};

export default function DocumentPage() {
  return <DraftDocument />;
}
