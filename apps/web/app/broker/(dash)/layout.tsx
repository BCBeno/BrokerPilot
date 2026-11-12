import type { Metadata } from "next";
import { ClaimsList } from "@/components/broker/claims-list";
import { LIST_SELECT, toListRow, type RawClaim } from "@/lib/broker/claims";
import { requireBroker } from "@/lib/broker/session";
import { signOut } from "../actions";

export const metadata: Metadata = { title: "Dosare · BrokerPilot" };
// Depinde de sesiunea brokerului: nu se pre-randează niciodată.
export const dynamic = "force-dynamic";

/** Cadrul dashboardului: bandă sus, lista de dosare în stânga, detaliul (pagina copil) în dreapta. */
export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const { db, broker } = await requireBroker();
  const { data, error } = await db.from("claims").select(LIST_SELECT).order("updated_at", { ascending: false }).limit(200);
  const rows = ((data ?? []) as unknown as RawClaim[]).map(toListRow);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between bg-navy px-4 py-2 text-navy-foreground">
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-semibold">BrokerPilot</span>
          <span className="text-[13px] text-navy-muted">Dosare</span>
        </div>
        <div className="flex items-center gap-3 text-[13px]">
          <span className="hidden text-navy-muted sm:inline">{broker.name}</span>
          <form action={signOut}>
            <button type="submit" className="rounded px-2 py-1 text-navy-foreground hover:bg-white/10">
              Ieșire
            </button>
          </form>
        </div>
      </header>
      {error && (
        <p role="alert" className="bg-[#FDECEA] px-4 py-2 text-[13px] text-destructive">
          Nu am putut încărca dosarele. Reîncărcați pagina.
        </p>
      )}
      <div className="grid min-h-0 flex-1 gap-2.5 p-2.5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ClaimsList rows={rows} />
        {children}
      </div>
    </div>
  );
}
