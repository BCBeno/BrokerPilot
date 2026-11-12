import type { Metadata } from "next";
import { ClientsList, type ClientListRow } from "@/components/broker/clients-list";
import { daysUntil, inRenewalWindow, isRenewed, todayRo, type PolicyLite } from "@/lib/broker/renewals";
import { displayName } from "@/lib/broker/format";
import { requireBroker } from "@/lib/broker/session";

export const metadata: Metadata = { title: "Clienți · BrokerPilot" };

type RawClient = {
  id: string;
  full_name: string;
  phone: string | null;
  vehicles: { plate: string }[];
  policies: PolicyLite[];
};

/** Clienții agenției în stânga (căutare locală), fișa clientului în dreapta. */
export default async function ClientsLayout({ children }: { children: React.ReactNode }) {
  const { db } = await requireBroker();
  const { data, error } = await db
    .from("clients")
    .select("id, full_name, phone, vehicles(plate), policies(id, client_id, vehicle_id, type, valid_from, valid_to)")
    .order("full_name")
    .limit(500);
  const today = todayRo();
  const rows: ClientListRow[] = ((data ?? []) as unknown as RawClient[]).map((c) => {
    // Cea mai apropiată poliță din fereastra de reînnoire care nu a fost deja reînnoită.
    const due = c.policies
      .filter((p) => inRenewalWindow(daysUntil(p.valid_to, today)) && !isRenewed(p, c.policies))
      .map((p) => daysUntil(p.valid_to, today))
      .sort((a, b) => a - b)[0];
    return {
      id: c.id,
      name: displayName(c.full_name),
      phone: c.phone,
      plates: c.vehicles.map((v) => v.plate),
      policyCount: c.policies.length,
      dueDays: due ?? null,
    };
  });

  return (
    <>
      {error && (
        <p role="alert" className="bg-tone-danger px-4 py-2 text-[13px] text-tone-danger-foreground">
          Nu am putut încărca clienții. Reîncărcați pagina.
        </p>
      )}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ClientsList rows={rows} />
        {children}
      </div>
    </>
  );
}
