import type { Metadata } from "next";
import { DocumentView } from "@/components/amiabila-form/document-view";
import { specimenForm } from "@/lib/amiabila/specimen";

export const metadata: Metadata = {
  title: "Constatare amiabilă, specimen | BrokerPilot",
  robots: { index: false },
};

export default function SpecimenPage() {
  return (
    <DocumentView
      form={specimenForm()}
      backHref="/amiabila/document"
      notice="Specimen cu date inventate, ca să vezi formularul complet completat."
    />
  );
}
