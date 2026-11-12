import { ArrowLeft, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Plate } from "@/components/broker/plate";
import { RenewalActions } from "@/components/broker/renewal-actions";
import { StateText } from "@/components/broker/renewal-state";
import { DueText, RoleTag, StatusPill } from "@/components/broker/status-pill";
import { STATUS_LABELS, type ClaimStatus } from "@/lib/broker/claims";
import { displayName, expiryText, insurerName, monthYear, phoneDisplay, vehicleName } from "@/lib/broker/format";
import { POLICY_TYPE_LABELS, daysUntil, expiryBadge, inRenewalWindow, isRenewed, roDate, todayRo } from "@/lib/broker/renewals";
import {
  POLICY_SELECT,
  brokerNames,
  loadRenewalEvents,
  toRenewalItems,
  type PolicyRow,
  type RenewalItem,
} from "@/lib/broker/renewals-data";
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
const METHOD_LABELS: Record<string, string> = {
  policy: "recunoscut automat după numărul poliței",
  plate: "recunoscut automat după numărul de înmatriculare",
  phone: "recunoscut automat după telefon",
  broker_matched: "legat de broker",
  broker_added: "adăugat în portofoliu din dosar",
};

/**
 * Fișa clientului, organizată pe vehicule: antet cu contactul și „Sună”, apoi fiecare mașină (plăcuța) cu polițele ei,
 * cele de reînnoit sus, cu „Am contactat” / „Reamintește-mi” pe rând; apoi daune și istoric (dosare, conversații,
 * inbox, `events`). Totul citit cu sesiunea brokerului (RLS pe agenție).
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
  const name = displayName(client.full_name);

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
      label: `Legat de ${refOf.get(e.entity_id) ?? "dosar"}${e.payload?.role ? ` (șofer ${e.payload.role})` : ""}`,
      detail: e.payload?.method ? METHOD_LABELS[e.payload.method] : null,
      href: `/broker/dosare/${e.entity_id}`,
    })),
    ...conversations.map((c) => ({
      at: c.created_at,
      label: `${CONVERSATION_LABELS[c.channel] ?? c.channel}${c.handoff_status === "requested" ? ", a cerut să vorbească cu un om" : ""}`,
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
  const groups = groupByVehicle(vehicles, policies, today);
  const dueById = new Map(due.map((i) => [i.policy.id, i]));

  return (
    <article aria-label={`Fișa clientului ${name}`} className="min-h-0 overflow-y-auto bg-card text-[13px]">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-5 py-3">
        <Link href="/broker/clienti" className="mb-1 inline-flex items-center gap-1 text-[12px] text-muted-foreground lg:hidden">
          <ArrowLeft aria-hidden className="size-3.5" /> Clienți
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[20px] leading-tight font-semibold">{name}</h1>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
              {client.phone ? (
                <a href={`tel:${client.phone.replace(/\s/g, "")}`} className="text-foreground tabular-nums hover:underline">
                  {phoneDisplay(client.phone)}
                </a>
              ) : (
                <span>fără telefon</span>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className="text-foreground hover:underline">
                  {client.email}
                </a>
              )}
              <span>client din {monthYear(client.created_at)}</span>
              <span>{client.consent_gdpr_at ? `acord GDPR din ${roDate(client.consent_gdpr_at)}` : "fără acord GDPR"}</span>
              {client.telegram_chat_id && <span>primește mesaje pe Telegram</span>}
            </p>
          </div>
          {client.phone && (
            <a
              href={`tel:${client.phone.replace(/\s/g, "")}`}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 font-medium hover:bg-muted"
            >
              <Phone aria-hidden className="size-3.5" /> Sună
            </a>
          )}
        </div>
      </header>

      <div className="px-5 pb-6">
        <section aria-label="Vehicule și polițe">
          {groups.length === 0 && <p className="py-4 text-muted-foreground">Nicio poliță și niciun vehicul în portofoliu.</p>}
          {groups.map((g) => (
            <div key={g.key} className="border-b border-border py-3.5">
              <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {g.plate ? (
                  <>
                    <Plate plate={g.plate} />
                    <span className="font-medium">{g.title}</span>
                    {g.vin && <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">VIN {g.vin}</span>}
                  </>
                ) : (
                  <span className="text-[14px] font-semibold">{g.title}</span>
                )}
              </h2>
              {g.policies.length === 0 ? (
                <p className="mt-2 text-muted-foreground">Nicio poliță la noi pentru această mașină.</p>
              ) : (
                <ul className="mt-2">
                  {g.policies.map((p) => (
                    <PolicyLine key={p.id} policy={p} all={policies} today={today} item={dueById.get(p.id)} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>

        <section aria-labelledby="daune" className="border-b border-border py-3.5">
          <h2 id="daune" className="text-[14px] font-semibold">
            Daune
          </h2>
          {claims.length === 0 ? (
            <p className="mt-1 text-muted-foreground">Nicio daună declarată prin noi.</p>
          ) : (
            <ul className="mt-1.5">
              {claims.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/broker/dosare/${c.id}`}
                    className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded px-2 py-1 hover:bg-muted/60"
                  >
                    <RoleTag role={c.role} />
                    <span className="font-semibold">{c.public_ref}</span>
                    <StatusPill status={c.status} />
                    <span className="text-muted-foreground tabular-nums">{c.accident_at ? roDate(c.accident_at) : roDate(c.created_at)}</span>
                    {c.location_text && <span className="truncate text-muted-foreground">{c.location_text}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="istoric" className="py-3.5">
          <h2 id="istoric" className="text-[14px] font-semibold">
            Istoric
          </h2>
          <ol className="mt-1.5">
            {days.map((day) => (
              <li key={day.day} className="mt-2.5 first:mt-0">
                <p className="text-[12px] font-medium text-muted-foreground">{day.day}</p>
                <ol>
                  {day.items.map((t, i) => (
                    <li key={i} className="flex gap-3 py-0.5">
                      <time className="w-11 shrink-0 text-muted-foreground tabular-nums" dateTime={t.at}>
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
                        {t.detail && <span className="block text-[12px] text-muted-foreground">{t.detail}</span>}
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

type VehicleGroup = { key: string; plate: string | null; title: string; vin: string | null; policies: PolicyRow[]; urgency: number };

const HOME_TYPES = new Set(["PAD", "LOCUINTA"]);

/**
 * Polițele sub mașina lor (cum gândește brokerul: „ce are pe CJ 41 TST?”); cele fără vehicul la „Locuință” sau
 * „Alte polițe”. Mașinile cu o poliță de reînnoit urcă sus, cea mai urgentă prima.
 */
function groupByVehicle(vehicles: Vehicle[], policies: PolicyRow[], today: string): VehicleGroup[] {
  const urgency = (list: PolicyRow[]) =>
    Math.min(
      Infinity,
      ...list.filter((p) => inRenewalWindow(daysUntil(p.valid_to, today)) && !isRenewed(p, policies)).map((p) => daysUntil(p.valid_to, today)),
    );
  const byUrgency = (list: PolicyRow[]) =>
    [...list].sort((a, b) => {
      const da = daysUntil(a.valid_to, today);
      const db = daysUntil(b.valid_to, today);
      const due = (p: PolicyRow, d: number) => (inRenewalWindow(d) && !isRenewed(p, policies) ? 0 : 1);
      return due(a, da) - due(b, db) || b.valid_to.localeCompare(a.valid_to);
    });

  const groups: VehicleGroup[] = vehicles.map((v) => {
    const own = policies.filter((p) => p.vehicle_id === v.id);
    return {
      key: v.id,
      plate: v.plate,
      title: [vehicleName([v.make, v.model].filter(Boolean).join(" ")), v.year].filter(Boolean).join(" "),
      vin: v.vin,
      policies: byUrgency(own),
      urgency: urgency(own),
    };
  });
  const known = new Set(vehicles.map((v) => v.id));
  // Polițe pe vehicule pe care nu le vedem în lista clientului (alt proprietar): grupate după plăcuța din poliță.
  for (const p of policies.filter((x) => x.vehicle_id && !known.has(x.vehicle_id))) {
    let g = groups.find((x) => x.key === p.vehicle_id);
    if (!g) {
      g = { key: p.vehicle_id!, plate: p.vehicles?.plate ?? null, title: vehicleName([p.vehicles?.make, p.vehicles?.model].filter(Boolean).join(" ")), vin: null, policies: [], urgency: Infinity };
      if (!g.plate) g.title = "Vehicul fără număr";
      groups.push(g);
    }
    g.policies = byUrgency([...g.policies, p]);
    g.urgency = urgency(g.policies);
  }
  const loose = policies.filter((p) => !p.vehicle_id);
  if (loose.length) {
    groups.push({
      key: "fara-vehicul",
      plate: null,
      title: loose.every((p) => HOME_TYPES.has(p.type)) ? "Locuință" : "Alte polițe",
      vin: null,
      policies: byUrgency(loose),
      urgency: urgency(loose),
    });
  }
  return groups.sort((a, b) => a.urgency - b.urgency || (a.plate ?? "~").localeCompare(b.plate ?? "~"));
}

/** Un rând de poliță: tip, termen (colorat doar când cere atenție), număr și asigurător, primă, acțiunile de reînnoire. */
function PolicyLine({ policy: p, all, today, item }: { policy: PolicyRow; all: PolicyRow[]; today: string; item?: RenewalItem }) {
  const days = daysUntil(p.valid_to, today);
  const renewed = isRenewed(p, all);
  const tone = expiryBadge(days).tone;
  const showState = item && (item.state.kind !== "todo" || item.state.reminderDue);
  return (
    <li className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-3 gap-y-1 py-1.5 md:grid-cols-[48px_150px_minmax(0,1fr)_88px_minmax(0,auto)] md:items-center">
      <span className="font-semibold">{POLICY_TYPE_LABELS[p.type] ?? p.type}</span>
      <span>
        {renewed && days < 0 ? (
          <span className="text-muted-foreground">reînnoită</span>
        ) : item ? (
          <>
            <DueText tone={tone}>{expiryText(days, p.valid_to)}</DueText>
            <span className="block text-[12px] text-muted-foreground tabular-nums">{roDate(p.valid_to)}</span>
          </>
        ) : days < 0 ? (
          <span className="text-muted-foreground tabular-nums">expirată pe {roDate(p.valid_to)}</span>
        ) : (
          <span className="text-muted-foreground tabular-nums">până la {roDate(p.valid_to)}</span>
        )}
      </span>
      <span className="col-start-2 flex min-w-0 flex-wrap gap-x-3 md:col-start-auto">
        <span className="tabular-nums">{p.policy_no}</span>
        <span className="text-muted-foreground">{insurerName(p.insurer)}</span>
      </span>
      <span className="col-start-2 tabular-nums md:col-start-auto md:text-right">
        {p.premium != null ? `${Number(p.premium).toLocaleString("ro-RO")} lei` : ""}
      </span>
      <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:col-start-auto md:justify-end">
        {showState && item && (
          <span className="text-[12px]">
            <StateText item={item} />
          </span>
        )}
        {item && <RenewalActions policyId={p.id} />}
      </span>
    </li>
  );
}
