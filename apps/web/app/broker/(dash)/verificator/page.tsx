import type { Metadata } from "next";
import { DocumentVerifier } from "@/components/broker/document-verifier";
import { requireBroker } from "@/lib/broker/session";

export const metadata: Metadata = { title: "Verificator · BrokerPilot" };

/** Verificatorul de documente: brokerul încarcă un PDF și primește raportul cu probleme sigure și sugestii AI (pe text redactat). */
export default async function VerifierPage() {
  const { db } = await requireBroker();
  const { data } = await db.from("clients").select("id, full_name").order("full_name").limit(500);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-card">
      <header className="border-b border-border px-5 py-3">
        <h1 className="text-[20px] leading-tight font-semibold">Verificator de documente</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Încărcați o poliță sau o ofertă în PDF. Datele, identificatorii și sumele se verifică local, cu reguli; pentru textul liber, modelul AI primește
          doar o variantă din care numele, CNP-ul, telefoanele, plăcuțele și IBAN-urile au fost scoase.
        </p>
      </header>
      <DocumentVerifier clients={data ?? []} />
    </main>
  );
}
