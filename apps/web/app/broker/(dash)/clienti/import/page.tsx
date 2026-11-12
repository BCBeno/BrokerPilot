import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ImportForm } from "@/components/broker/import-form";
import { requireBroker } from "@/lib/broker/session";

/** Importul portofoliului (CSV exportat din sistemul brokerului), în panoul din dreapta al secțiunii Clienți. */
export default async function ImportPage() {
  await requireBroker();
  return (
    <article aria-labelledby="import-titlu" className="min-h-0 overflow-y-auto bg-card text-[13px]">
      <header className="border-b border-border px-4 py-3">
        <Link href="/broker/clienti" className="mb-1 inline-flex items-center gap-1 text-[12px] text-muted-foreground lg:hidden">
          <ArrowLeft aria-hidden className="size-3.5" /> Clienți
        </Link>
        <h1 id="import-titlu" className="text-[17px] font-semibold">
          Importă portofoliul
        </h1>
        <p className="mt-0.5 text-muted-foreground">
          Încărcați clienții, vehiculele și polițele exportate din sistemul agenției. După import apar în Clienți și, dacă expiră curând, în
          Reînnoiri; daunele noi îi recunosc automat.
        </p>
      </header>
      <div className="p-4">
        <ImportForm />
      </div>
    </article>
  );
}
