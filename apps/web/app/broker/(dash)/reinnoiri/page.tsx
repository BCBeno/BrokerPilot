import type { Metadata } from "next";
import Link from "next/link";
import { RenewalActions } from "@/components/broker/renewal-actions";
import { StateText } from "@/components/broker/renewal-state";
import { Plate } from "@/components/broker/plate";
import { DueText } from "@/components/broker/status-pill";
import { displayName, expiryText, insurerName, phoneDisplay, vehicleName } from "@/lib/broker/format";
import { POLICY_TYPE_LABELS, RENEWAL_FILTERS, expiryBadge, matchesRenewalFilter, roDate, todayRo, type RenewalFilter } from "@/lib/broker/renewals";
import { loadRenewals, type RenewalItem } from "@/lib/broker/renewals-data";
import { requireBroker } from "@/lib/broker/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reînnoiri · BrokerPilot" };

const isFilter = (v: unknown): v is RenewalFilter => RENEWAL_FILTERS.some((f) => f.id === v);

/**
 * Polițele care expiră în 30 de zile și cele expirate în ultimele 30, cele mai urgente sus.
 * „Am contactat” / „Reamintește-mi” scriu în `events`; o poliță reînnoită (poliță nouă de același tip) iese din „De contactat”.
 */
export default async function RenewalsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const filter: RenewalFilter = isFilter(f) ? f : "todo";
  const { db } = await requireBroker();
  const today = todayRo();
  const { items, error } = await loadRenewals(db, today);

  const counts = Object.fromEntries(RENEWAL_FILTERS.map((x) => [x.id, items.filter((i) => matchesRenewalFilter(i.state, x.id)).length]));
  const visible = items.filter((i) => matchesRenewalFilter(i.state, filter));
  const expired = items.filter((i) => i.days < 0 && i.state.kind === "todo").length;
  const week = items.filter((i) => i.days >= 0 && i.days <= 7 && i.state.kind === "todo").length;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-card">
      <section aria-labelledby="titlu" className="text-[13px]">
        <header className="border-b border-border px-5 py-3">
          <h1 id="titlu" className="text-[20px] leading-tight font-semibold">
            Reînnoiri
          </h1>
          <p className="mt-0.5 text-muted-foreground">
            Polițe care expiră în următoarele 30 de zile sau au expirat în ultimele 30.
            {counts.todo > 0 && (
              <>
                {" "}
                <span className="font-medium text-foreground">
                  {counts.todo} de contactat
                  {expired > 0 && `, ${expired} ${expired === 1 ? "deja expirată" : "deja expirate"}`}
                  {week > 0 && `, ${week} în 7 zile`}.
                </span>
              </>
            )}
          </p>
          <nav aria-label="Filtru reînnoiri" className="mt-2 flex flex-wrap gap-1">
            {RENEWAL_FILTERS.map((x) => (
              <Link
                key={x.id}
                href={x.id === "todo" ? "/broker/reinnoiri" : `/broker/reinnoiri?f=${x.id}`}
                aria-current={filter === x.id ? "page" : undefined}
                className={cn(
                  "inline-flex h-6 items-center rounded px-2 text-[12px] font-medium",
                  filter === x.id ? "bg-navy text-navy-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {x.label} <span className="ml-1 opacity-70">{counts[x.id]}</span>
              </Link>
            ))}
          </nav>
        </header>

        {error ? (
          <p role="alert" className="px-5 py-3 text-destructive">
            Nu am putut încărca polițele. Reîncărcați pagina.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-6 text-muted-foreground">
            {filter === "todo" ? "Nicio poliță de contactat acum. Cele amânate revin singure la data aleasă." : "Nicio poliță pentru filtrul ales."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[12px] text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Expiră</th>
                  <th scope="col" className="px-3 py-2 font-medium">Client</th>
                  <th scope="col" className="px-3 py-2 font-medium">Poliță</th>
                  <th scope="col" className="px-3 py-2 font-medium">Vehicul</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Primă</th>
                  <th scope="col" className="px-3 py-2 font-medium">Stare</th>
                  <th scope="col" className="px-5 py-2 font-medium">
                    <span className="sr-only">Acțiuni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <RenewalRow key={item.policy.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function RenewalRow({ item }: { item: RenewalItem }) {
  const { policy: p, days, state } = item;
  const badge = expiryBadge(days);
  const vehicle = p.vehicles ? vehicleName([p.vehicles.make, p.vehicles.model].filter(Boolean).join(" ")) : null;
  return (
    <tr className="border-b border-border align-top last:border-b-0">
      <td className="px-5 py-2">
        <DueText tone={state.kind === "renewed" ? "neutral" : badge.tone}>{expiryText(days, p.valid_to)}</DueText>
        <div className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">{roDate(p.valid_to)}</div>
      </td>
      <td className="px-3 py-2">
        <Link href={`/broker/clienti/${p.client_id}`} className="font-medium hover:underline">
          {displayName(p.clients?.full_name) || "Client"}
        </Link>
        {p.clients?.phone && (
          <a href={`tel:${p.clients.phone.replace(/\s/g, "")}`} className="block text-[12px] whitespace-nowrap text-muted-foreground tabular-nums hover:underline">
            {phoneDisplay(p.clients.phone)}
          </a>
        )}
      </td>
      <td className="px-3 py-2">
        <span className="font-semibold">{POLICY_TYPE_LABELS[p.type] ?? p.type}</span> <span className="whitespace-nowrap tabular-nums">{p.policy_no}</span>
        <div className="text-[12px] text-muted-foreground">{insurerName(p.insurer)}</div>
      </td>
      <td className="px-3 py-2">
        {p.vehicles?.plate ? (
          <>
            <Plate plate={p.vehicles.plate} size="sm" />
            {vehicle && <div className="mt-0.5 text-[12px] text-muted-foreground">{vehicle}</div>}
          </>
        ) : (
          <span className="text-muted-foreground">fără vehicul</span>
        )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{p.premium != null ? `${Number(p.premium).toLocaleString("ro-RO")} lei` : "—"}</td>
      <td className="px-3 py-2">
        <StateText item={item} />
      </td>
      <td className="px-5 py-2">{state.kind !== "renewed" && <RenewalActions policyId={p.id} className="justify-end" />}</td>
    </tr>
  );
}
