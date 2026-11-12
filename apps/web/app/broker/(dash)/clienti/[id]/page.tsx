import { ArrowLeft, Mail, MessageCircle, Phone, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { RenewalActions } from "@/components/broker/renewal-actions";
import { StateText } from "@/components/broker/renewal-state";
import { RoleTag, StatusPill, ToneBadge } from "@/components/broker/status-pill";
import { STATUS_LABELS, type ClaimStatus } from "@/lib/broker/claims";
import {
  POLICY_TYPE_LABELS,
  daysUntil,
  expiryBadge,
  inRenewalWindow,
  isRenewed,
  roDate,
  todayRo,
} from "@/lib/broker/renewals";
import { POLICY_SELECT, brokerNames, loadRenewalEvents, toRenewalItems, type PolicyRow } from "@/lib/broker/renewals-data";
import { requireBroker } from "@/lib/broker/session";
import { groupByDay, type TimelineItem } from "@/lib/broker/timeline";

type Client = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  telegram_chat_id: number | null;
  consent_gdpr_at: string | null;
  created_at: string;
};
type Vehicle = { id: string; plate: string; vin: string | null; make: string | null; model: string | null; year: number | null };
type PartyRow = {
  role: "A" | "B";
  claims: { id: string; public_ref: string; status: ClaimStatus; accident_at: string | null; location_text: string | null; created_at: string } | null;
};
type Conversation = { channel: string; summary: string | null; handoff_status: string; created_at: string; claim_id: string | null };

const CONVERSATION_LABELS: Record<string, string> = {
  voice: "Apel cu asistentul vocal",
  telegram: "Conversație pe Telegram",
  email: "Conversație pe e-mail",
  web: "Conversație pe web",
};
const METHOD_LABELS: Record<string, string> = { policy: "după numărul poliței", plate: "după numărul de înmatriculare" };

/**
 * Fișa clientului, în același cadru ca dosarul: contact, ce e de reînnoit (oportunitatea), polițe, vehicule, daune
 * și istoricul din dosare, conversații, inbox și `events`. Totul citit cu sesiunea brokerului (RLS pe agenție).
 */
export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) notFound();
  const { db } = await requireBroker();
  const today = todayRo();

  const [clientRes, vehiclesRes, policiesRes, partiesRes, convRes] = await Promise.all([
    db.from("clients").select("id, full_name, phone, email, telegram_chat_id, consent_gdpr_at, created_at").eq("id", id.data).maybeSingle(),
    db.from("vehicles").select("id, plate, vin, make, model, year").eq("client_id", id.data).order("plate"),
    db.from("policies").select(POLICY_SELECT).eq("client_id", id.data).order("valid_to", { ascending: false }),
    db
      .from("claim_parties")
      .select("role, claims(id, public_ref, status, accident_at, location_text, created_at)")
      .eq("client_id", id.data),
    db.from("conversations").select("channel, summary, handoff_status, created_at, claim_id").eq("client_id", id.data).order("created_at", { ascending: false }).limit(50),
  ]);
  const client = clientRes.data as Client | null;
  if (!client) notFound();

  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];
  const policies = (policiesRes.data ?? []) as unknown as PolicyRow[];
  const claims = ((partiesRes.data ?? []) as unknown as PartyRow[])
    .flatMap((p) => (p.claims ? [{ ...p.claims, role: p.role }] : []))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const conversations = (convRes.data ?? []) as Conversation[];
  const claimIds = claims.map((c) => c.id);

  const [renewalEvents, names, inboxRes, claimEventsRes] = await Promise.all([
    loadRenewalEvents(
      db,
      policies.map((p) => p.id),
    ),
    brokerNames(db),
    claimIds.length
      ? db.from("inbox_items").select("source, subject_redacted, summary, category, received_at, linked_claim_id").in("linked_claim_id", claimIds)
      : Promise.resolve({ data: [] }),
    claimIds.length
      ? db.from("events").select("entity_id, type, payload, at").eq("entity_type", "claim").eq("type", "client_linked").in("entity_id", claimIds)
      : Promise.resolve({ data: [] }),
  ]);

  const due = toRenewalItems(
    policies.filter((p) => inRenewalWindow(daysUntil(p.valid_to, today))),
    policies,
    renewalEvents,
    names,
    today,
  ).filter((i) => i.state.kind !== "renewed");
  const refOf = new Map(claims.map((c) => [c.id, c.public_ref]));
  const plateOf = new Map(vehicles.map((v) => [v.id, v.plate]));

  // Istoricul: dosare, recunoașteri automate, conversații, e-mailuri, acțiunile de reînnoire.
  const history: TimelineItem[] = [
    { at: client.created_at, label: "Client adăugat în portofoliu" },
    ...(client.consent_gdpr_at ? [{ at: client.consent_gdpr_at, label: "Consimțământ GDPR înregistrat" }] : []),
    ...claims.map((c) => ({
      at: c.created_at,
      label: `Dosar ${c.public_ref} deschis (șofer ${c.role})`,
      detail: STATUS_LABELS[c.status],
      href: `/broker/dosare/${c.id}`,
    })),
    ...((claimEventsRes.data ?? []) as { entity_id: string; payload: { role?: string; method?: string } | null; at: string }[]).map((e) => ({
      at: e.at,
      label: `Recunoscut automat în ${refOf.get(e.entity_id) ?? "dosar"}${e.payload?.role ? ` (șofer ${e.payload.role})` : ""}`,
      detail: e.payload?.method ? METHOD_LABELS[e.payload.method] : null,
      href: `/broker/dosare/${e.entity_id}`,
    })),
    ...conversations.map((c) => ({
      at: c.created_at,
      label: `${CONVERSATION_LABELS[c.channel] ?? c.channel}${c.handoff_status === "requested" ? " · a cerut un om" : ""}`,
      detail: c.summary,
      href: c.claim_id ? `/broker/dosare/${c.claim_id}` : undefined,
    })),
    ...((inboxRes.data ?? []) as { subject_redacted: string | null; summary: string | null; received_at: string; linked_claim_id: string | null }[]).map((m) => ({
      at: m.received_at,
      label: `E-mail: ${m.subject_redacted ?? "fără subiect"}`,
      detail: m.summary,
    })),
    ...renewalEvents.map((e) => {
      const p = policies.find((x) => x.id === e.entity_id);
      const what = p ? `${POLICY_TYPE_LABELS[p.type] ?? p.type} ${p.policy_no}` : "poliță";
      const who = e.payload?.broker_id ? names.get(e.payload.broker_id) : null;
      return {
        at: e.at,
        label: e.type === "renewal_contacted" ? `Contactat pentru reînnoirea ${what}` : `Reamintire pentru ${what} pe ${roDate(e.payload?.until ?? e.at)}`,
        detail: who ? `de ${who}` : null,
      };
    }),
  ];
  const days = groupByDay(history);

  return (
    <article aria-label={`Fișa clientului ${client.full_name}`} className="min-h-0 overflow-y-auto rounded-lg border border-border bg-card text-[13px]">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <Link href="/broker/clienti" className="mb-1 inline-flex items-center gap-1 text-[12px] text-muted-foreground lg:hidden">
          <ArrowLeft aria-hidden className="size-3.5" /> Clienți
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[17px] font-semibold">{client.full_name}</h1>
          <span className="text-[12px] text-muted-foreground">
            {policies.length} {policies.length === 1 ? "poliță" : "polițe"} · {vehicles.length} {vehicles.length === 1 ? "vehicul" : "vehicule"} ·{" "}
            {claims.length} {claims.length === 1 ? "daună" : "daune"}
          </span>
        </div>
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <li className="inline-flex items-center gap-1">
            <Phone aria-hidden className="size-3.5" />
            {client.phone ? (
              <a href={`tel:${client.phone.replace(/\s/g, "")}`} className="text-foreground tabular-nums hover:underline">
                {client.phone}
              </a>
            ) : (
              "fără telefon"
            )}
          </li>
          <li className="inline-flex items-center gap-1">
            <Mail aria-hidden className="size-3.5" />
            {client.email ? (
              <a href={`mailto:${client.email}`} className="text-foreground hover:underline">
                {client.email}
              </a>
            ) : (
              "fără e-mail"
            )}
          </li>
          <li className="inline-flex items-center gap-1">
            <MessageCircle aria-hidden className="size-3.5" />
            {client.telegram_chat_id ? "Telegram legat" : "Telegram nelegat"}
          </li>
          <li className="inline-flex items-center gap-1">
            <ShieldCheck aria-hidden className="size-3.5" />
            {client.consent_gdpr_at ? `GDPR din ${roDate(client.consent_gdpr_at)}` : "fără consimțământ GDPR înregistrat"}
          </li>
        </ul>
      </header>

      <div className="space-y-3 p-4">
        {due.length > 0 && (
          <section aria-labelledby="oportunitati" className="rounded-md bg-tone-todo px-3 py-2 text-tone-todo-foreground">
            <h2 id="oportunitati" className="flex items-center gap-1.5 font-semibold">
              <TrendingUp aria-hidden className="size-4" />
              {due.length === 1 ? "O poliță de reînnoit" : `${due.length} polițe de reînnoit`}
            </h2>
            <ul className="mt-1 divide-y divide-tone-todo-foreground/15">
              {due.map((item) => (
                <li key={item.policy.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0">
                    <span className="font-medium">
                      {POLICY_TYPE_LABELS[item.policy.type] ?? item.policy.type} {item.policy.policy_no}
                    </span>
                    {item.policy.vehicles?.plate && <> · {item.policy.vehicles.plate}</>} · {expiryBadge(item.days).label} ({roDate(item.policy.valid_to)})
                    <span className="ml-2 text-[12px]">
                      <StateText item={item} />
                    </span>
                  </span>
                  <RenewalActions policyId={item.policy.id} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="polite" className="overflow-x-auto rounded-md border border-border">
          <h2 id="polite" className="border-b border-border px-3 py-2 text-[13px] font-semibold">
            Polițe
          </h2>
          {policies.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">Nicio poliță în portofoliu.</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[12px] text-muted-foreground">
                  <th scope="col" className="px-3 py-1.5 font-medium">Tip</th>
                  <th scope="col" className="px-3 py-1.5 font-medium">Număr · asigurător</th>
                  <th scope="col" className="px-3 py-1.5 font-medium">Vehicul</th>
                  <th scope="col" className="px-3 py-1.5 font-medium">Valabilă</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">Primă</th>
                  <th scope="col" className="px-3 py-1.5 font-medium">Stare</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => {
                  const days = daysUntil(p.valid_to, today);
                  const renewed = isRenewed(p, policies);
                  const badge = expiryBadge(days);
                  return (
                    <tr key={p.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5 font-medium">{POLICY_TYPE_LABELS[p.type] ?? p.type}</td>
                      <td className="px-3 py-1.5">
                        <span className="tabular-nums">{p.policy_no}</span> <span className="text-muted-foreground">· {p.insurer}</span>
                      </td>
                      <td className="px-3 py-1.5">{p.vehicle_id ? (plateOf.get(p.vehicle_id) ?? p.vehicles?.plate ?? "—") : "—"}</td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {roDate(p.valid_from)} – {roDate(p.valid_to)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{p.premium != null ? `${Number(p.premium).toLocaleString("ro-RO")} lei` : "—"}</td>
                      <td className="px-3 py-1.5">
                        {renewed && days < 0 ? <ToneBadge tone="neutral">reînnoită</ToneBadge> : <ToneBadge tone={badge.tone}>{badge.label}</ToneBadge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="vehicule" className="rounded-md border border-border">
            <h2 id="vehicule" className="border-b border-border px-3 py-2 text-[13px] font-semibold">
              Vehicule
            </h2>
            {vehicles.length === 0 ? (
              <p className="px-3 py-2 text-muted-foreground">Niciun vehicul.</p>
            ) : (
              <ul className="divide-y divide-border">
                {vehicles.map((v) => (
                  <li key={v.id} className="px-3 py-1.5">
                    <span className="font-semibold">{v.plate}</span>{" "}
                    <span className="text-muted-foreground">{[v.make, v.model, v.year].filter(Boolean).join(" ")}</span>
                    {v.vin && <div className="text-[12px] tabular-nums text-muted-foreground">VIN {v.vin}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="daune" className="rounded-md border border-border">
            <h2 id="daune" className="border-b border-border px-3 py-2 text-[13px] font-semibold">
              Daune
            </h2>
            {claims.length === 0 ? (
              <p className="px-3 py-2 text-muted-foreground">Nicio daună legată de acest client.</p>
            ) : (
              <ul className="divide-y divide-border">
                {claims.map((c) => (
                  <li key={c.id}>
                    <Link href={`/broker/dosare/${c.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 hover:bg-muted/60">
                      <RoleTag role={c.role} />
                      <span className="font-semibold">{c.public_ref}</span>
                      <StatusPill status={c.status} />
                      <span className="truncate text-muted-foreground">
                        {c.accident_at ? roDate(c.accident_at) : roDate(c.created_at)}
                        {c.location_text && ` · ${c.location_text}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="istoric" className="rounded-md border border-border">
          <h2 id="istoric" className="border-b border-border px-3 py-2 text-[13px] font-semibold">
            Istoric
          </h2>
          <ol className="px-3 py-2">
            {days.map((day) => (
              <li key={day.day}>
                <p className="mt-1.5 text-[12px] font-medium text-muted-foreground first:mt-0">{day.day}</p>
                <ol>
                  {day.items.map((t, i) => (
                    <li key={i} className="flex gap-3 py-0.5">
                      <time className="w-11 shrink-0 tabular-nums text-muted-foreground" dateTime={t.at}>
                        {t.time}
                      </time>
                      <span className="min-w-0">
                        {t.href ? (
                          <Link href={t.href} className="hover:underline">
                            {t.label}
                          </Link>
                        ) : (
                          t.label
                        )}
                        {t.detail && <span className="text-muted-foreground"> · {t.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
