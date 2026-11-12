import { BrokerNav } from "@/components/broker/broker-nav";
import { displayName } from "@/lib/broker/format";
import { requireBroker } from "@/lib/broker/session";
import { signOut } from "../actions";

// Depinde de sesiunea brokerului: nu se pre-randează niciodată.
export const dynamic = "force-dynamic";

/** Cadrul dashboardului: banda de sus cu navigarea (Dosare, Clienți, Reînnoiri); secțiunile își aduc propriul conținut. */
export default async function BrokerShell({ children }: { children: React.ReactNode }) {
  const { broker } = await requireBroker();

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 bg-navy px-4 py-1.5 text-navy-foreground">
        <div className="flex min-w-0 items-center gap-4">
          <span className="text-[15px] font-semibold">BrokerPilot</span>
          <BrokerNav />
        </div>
        <div className="flex items-center gap-3 text-[13px]">
          {/* Fixturile sunt fictive (regula proiectului); o spunem o dată aici, nu la fiecare nume. */}
          <span className="hidden rounded border border-navy-line px-1.5 text-[12px] text-navy-muted md:inline">Date fictive</span>
          <span className="hidden text-navy-muted sm:inline">{displayName(broker.name)}</span>
          <form action={signOut}>
            <button type="submit" className="rounded px-2 py-1 text-navy-foreground hover:bg-white/10">
              Ieșire
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
