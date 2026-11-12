import type { Metadata } from "next";
import { ClaimsList } from "@/components/broker/claims-list";
import { LIST_SELECT, toListRow, type RawClaim } from "@/lib/broker/claims";
import { requireBroker } from "@/lib/broker/session";

export const metadata: Metadata = { title: "Dosare · BrokerPilot" };

/** Lista de dosare în stânga, detaliul (pagina copil) în dreapta. */
export default async function ClaimsLayout({ children }: { children: React.ReactNode }) {
  const { db } = await requireBroker();
  const { data, error } = await db.from("claims").select(LIST_SELECT).order("updated_at", { ascending: false }).limit(200);
  const rows = ((data ?? []) as unknown as RawClaim[]).map(toListRow);

  return (
    <>
      {error && (
        <p role="alert" className="bg-tone-danger px-4 py-2 text-[13px] text-tone-danger-foreground">
          Nu am putut încărca dosarele. Reîncărcați pagina.
        </p>
      )}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ClaimsList rows={rows} />
        {children}
      </div>
    </>
  );
}
