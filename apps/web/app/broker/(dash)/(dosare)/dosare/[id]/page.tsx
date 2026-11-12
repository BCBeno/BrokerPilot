import { AlertTriangle, ArrowLeft, CheckCircle2, FileDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { SketchView } from "@/components/amiabila-form/sketch-view";
import { AddToPortfolio } from "@/components/broker/add-to-portfolio";
import { Plate } from "@/components/broker/plate";
import { DueText, RoleTag, StatusPill } from "@/components/broker/status-pill";
import { Button } from "@/components/ui/button";
import { FORM_CIRCUMSTANCES, IMPACT_LABELS } from "@/lib/amiabila/content";
import type { Party } from "@/lib/amiabila/form";
import { CHANNEL_LABELS, STATUS_LABELS, type ClaimStatus } from "@/lib/broker/claims";
import { summarizeClaim, type ClaimSummary } from "@/lib/broker/claim-summary";
import { crossChecks, type CheckField, type CrossCheck } from "@/lib/broker/compare";
import { displayName, expiryText, insurerName, licenseCategory, phoneDisplay, vehicleName } from "@/lib/broker/format";
import { RENEWAL_WINDOW, daysUntil, expiryBadge, todayRo } from "@/lib/broker/renewals";
import { requireBroker } from "@/lib/broker/session";
import { missingItems } from "@/lib/claims/completeness";
import { CLAIM_BUCKET } from "@/lib/claims/files";
import { loadClaimDocument } from "@/lib/claims/form-data";
import { cn } from "@/lib/utils";
import { closeClaim, takeClaim } from "@/app/broker/actions";

type Meta = {
  status: ClaimStatus;
  broker_id: string | null;
  created_at: string;
  updated_at: string;
  ai_summary: string | null;
  pdf_path: string | null;
  brokers: { name: string } | null;
};

/**
 * Fișa dosarului („fișă comparativă”): antet cu acțiunea, concluzia în propoziții (ce lipsește, ce nu se potrivește),
 * apoi A și B pe aceleași rânduri, ca pe formular, cu plăcuța și clientul în capul coloanei. Rândurile goale la ambii se ascund.
 */
export default async function ClaimDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) notFound();
  const { db, broker } = await requireBroker();

  const [doc, metaRes, filesRes, eventsRes, partiesRes] = await Promise.all([
    loadClaimDocument(db, id.data),
    db.from("claims").select("status, broker_id, created_at, updated_at, ai_summary, pdf_path, brokers(name)").eq("id", id.data).maybeSingle(),
    db.from("claim_files").select("kind, party_role, created_at").eq("claim_id", id.data).order("created_at"),
    db.from("events").select("type, payload, at").eq("entity_type", "claim").eq("entity_id", id.data).order("at"),
    db.from("claim_parties").select("role, client_id, driver, clients(full_name)").eq("claim_id", id.data),
  ]);
  type PartyLink = { role: "A" | "B"; client_id: string | null; driver: { fullName?: string } | null; clients: { full_name: string } | null };
  const partyLinks = (partiesRes.data ?? []) as unknown as PartyLink[];
  const clientsByRole = new Map(
    partyLinks.flatMap((p) => (p.client_id && p.clients ? [[p.role, { id: p.client_id, name: p.clients.full_name }] as const] : [])),
  );
  // Doar un șofer care și-a trimis datele poate fi adăugat în portofoliu.
  // Numele din formular (casetele 6/9), altfel cel citit de pe permis; `null` = șoferul nu și-a trimis încă datele.
  const driverName = (role: "A" | "B") => {
    if (!doc) return null;
    const d = (role === "A" ? doc.form.a : doc.form.b).driver;
    const fromForm = [d.firstName, d.surname].filter(Boolean).join(" ");
    return fromForm || partyLinks.find((p) => p.role === role)?.driver?.fullName?.trim() || null;
  };
  const meta = metaRes.data as unknown as Meta | null;
  if (!doc || !meta) notFound();

  const pdfUrl = meta.pdf_path
    ? (await db.storage.from(CLAIM_BUCKET).createSignedUrl(meta.pdf_path, 600, { download: `${doc.ref}.pdf` })).data?.signedUrl
    : null;
  const { form } = doc;
  const missing = missingItems(doc.facts);
  const checks = crossChecks(form);
  const mine = meta.broker_id === broker.id;
  const canTake = !meta.broker_id && (meta.status === "signed" || meta.status === "submitted");
  const timeline = buildTimeline(meta, filesRes.data ?? [], eventsRes.data ?? []);
  const summary = summarizeClaim(missing, checks);
  const owner = meta.brokers?.name ? `preluat de ${displayName(meta.brokers.name)}` : canTake ? null : "nepreluat";

  return (
    <article aria-label={`Dosar ${doc.ref}`} className="min-h-0 overflow-y-auto bg-card text-[13px]">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-5 py-3">
        <Link href="/broker" className="mb-1 inline-flex items-center gap-1 text-[12px] text-muted-foreground lg:hidden">
          <ArrowLeft aria-hidden className="size-3.5" /> Dosare
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="text-[20px] leading-tight font-semibold">{doc.ref}</h1>
            <StatusPill status={meta.status} />
          </div>
          <div className="flex items-center gap-2">
            {pdfUrl && (
              <a
                href={pdfUrl}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted"
              >
                <FileDown aria-hidden className="size-4" /> PDF
              </a>
            )}
            {canTake && (
              <form action={takeClaim.bind(null, id.data)}>
                <Button type="submit" variant="cta" className="h-9 px-4 text-[13px]">
                  Preiau
                </Button>
              </form>
            )}
            {mine && meta.status === "in_progress" && (
              <form action={closeClaim.bind(null, id.data)}>
                <Button type="submit" variant="outline" className="h-9 px-3 text-[13px]">
                  Închide dosarul
                </Button>
              </form>
            )}
          </div>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
          {form.date || form.time ? (
            <span className="tabular-nums">{[form.date, form.time].filter(Boolean).join(", ")}</span>
          ) : (
            <span>Data și ora nu sunt completate</span>
          )}
          {form.place && <span>{form.place}</span>}
          <span>{CHANNEL_LABELS[doc.channel] ?? doc.channel}</span>
          {owner && <span>{owner}</span>}
        </p>
      </header>

      <div className="px-5 pb-6">
        <Summary summary={summary} />
        <Comparison
          a={form.a}
          b={form.b}
          photosA={doc.facts.photosA}
          photosB={doc.facts.photosB}
          checks={checks}
          docsIncomplete={summary.docsIncomplete}
          client={(role) => {
            const c = clientsByRole.get(role);
            if (c)
              return (
                <Link href={`/broker/clienti/${c.id}`} className="font-medium underline-offset-2 hover:underline">
                  {displayName(c.name)}
                </Link>
              );
            const name = driverName(role);
            if (!name) return null;
            return (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground">nu e client</span>
                <AddToPortfolio claimId={id.data} role={role} name={name} />
              </span>
            );
          }}
        />

        {(doc.photos.length > 0 || form.sketch) && (
          <section aria-labelledby="media" className="border-b border-border py-3.5">
            <h2 id="media" className="text-[14px] font-semibold">
              {doc.photos.length > 0 && form.sketch ? "Poze și schiță" : form.sketch ? "Schița" : "Poze"}
            </h2>
            <div className={cn("mt-2 grid gap-3", form.sketch && doc.photos.length > 0 && "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
              {doc.photos.length > 0 && (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] content-start gap-2">
                  {doc.photos.map((p, i) => (
                    <li key={i} className="relative">
                      <a
                        href={p.src}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded border border-border focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- adrese semnate, temporare, din Storage */}
                        <img src={p.src} alt={`Poză cu daunele vehiculului ${p.role}`} className="aspect-[4/3] w-full object-cover" />
                      </a>
                      <RoleTag role={p.role} className="absolute top-1 left-1" />
                    </li>
                  ))}
                </ul>
              )}
              {form.sketch && (
                <div className="max-w-md overflow-hidden rounded border border-border [&_svg]:h-auto [&_svg]:w-full">
                  <SketchView sketch={form.sketch} />
                </div>
              )}
            </div>
          </section>
        )}

        <div className="grid gap-x-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="istoric" className="py-3.5">
            <h2 id="istoric" className="text-[14px] font-semibold">
              Istoric
            </h2>
            <ol className="mt-1.5">
              {timeline.map((day) => (
                <li key={day.day} className="mt-2.5 first:mt-0">
                  <p className="text-[12px] font-medium text-muted-foreground">{day.day}</p>
                  <ol>
                    {day.items.map((t, i) => (
                      <li key={i} className="flex gap-3 py-0.5">
                        <time className="w-11 shrink-0 text-muted-foreground tabular-nums" dateTime={t.at}>
                          {t.time}
                        </time>
                        <span>{t.label}</span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </section>

          {meta.ai_summary && (
            <section aria-labelledby="telegram" className="py-3.5">
              <h2 id="telegram" className="text-[14px] font-semibold">
                Mesajul trimis pe Telegram
              </h2>
              <p className="mt-1.5 whitespace-pre-line text-muted-foreground">{meta.ai_summary}</p>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Concluzia, înainte de date: ce lipsește spus în propoziții („Niciun șofer n-a semnat încă.”), apoi ce nu se potrivește
 * între A și B, apoi ce ar ajuta. Lipsurile normale ale unui dosar în lucru nu sunt roșii; doar nepotrivirile au fundal.
 */
function Summary({ summary }: { summary: ClaimSummary }) {
  const [first, ...rest] = summary.status;
  return (
    <section aria-label="Pe scurt" className="border-b border-border py-3.5">
      <p className="text-[14px]">
        {summary.tone === "ok" && <CheckCircle2 aria-hidden className="mr-1.5 inline size-4 -translate-y-px text-tone-ok-foreground" />}
        <span className={cn("font-semibold", summary.tone === "ok" && "text-tone-ok-foreground")}>{first}</span>
        {rest.length > 0 && <> {rest.join(" ")}</>}
      </p>
      {summary.warnings.length > 0 && (
        <div className="mt-2 flex gap-2 rounded-md bg-tone-todo px-3 py-2 text-tone-todo-foreground">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-0.5">
            {summary.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        </div>
      )}
      {summary.extras && <p className="mt-1.5 text-muted-foreground">{summary.extras}</p>}
    </section>
  );
}

type Cell = ReactNode | null;
type Row = { label: string; field?: CheckField; a: Cell; b: Cell };

/** Contactul din formular e text liber („0700 000 200 / nume@exemplu.ro”): câte unul pe rând, telefonul grupat. */
const contactLines = (s: string) =>
  s.trim() ? (
    <>
      {s
        .split(/\s*[/;,]\s*/)
        .filter(Boolean)
        .map((part, i) => (
          <span key={i} className="block tabular-nums">
            {phoneDisplay(part)}
          </span>
        ))}
    </>
  ) : null;

const secondLine = (main: string | null, detail: string | null, extra?: ReactNode) =>
  main || detail ? (
    <>
      {main && <span className="block tabular-nums">{main}</span>}
      {detail && <span className="block text-[12px] text-muted-foreground tabular-nums">{detail}</span>}
      {extra}
    </>
  ) : null;

/** Polița cuiva din dosar expiră curând (azi, nu la data accidentului): legătura cu Reînnoiri. */
function renewalHint(validTo: string): ReactNode {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(validTo.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const days = daysUntil(iso, todayRo());
  if (days < 0 || days > RENEWAL_WINDOW.futureDays) return null;
  return (
    <DueText tone={expiryBadge(days).tone} className="block text-[12px]">
      {expiryText(days, iso)}
    </DueText>
  );
}

function cells(p: Party, photos: number) {
  const name = [p.driver.firstName, p.driver.surname].filter(Boolean).join(" ");
  const circ = [...p.circumstances].sort((x, y) => x - y);
  const period = p.insurance.validFrom && p.insurance.validTo ? `${p.insurance.validFrom} – ${p.insurance.validTo}` : null;
  const licenseDetail = [p.driver.category && `cat. ${licenseCategory(p.driver.category)}`, p.driver.licenseValidTo && `valabil până la ${p.driver.licenseValidTo}`]
    .filter(Boolean)
    .join(", ");
  return {
    insurer: p.insurance.company ? insurerName(p.insurance.company) : null,
    policy: secondLine(p.insurance.policyNo || null, period, p.insurance.validTo ? renewalHint(p.insurance.validTo) : null),
    driver: name || null,
    contact: contactLines(p.driver.contact),
    license: secondLine(p.driver.licenseNo || null, licenseDetail || null),
    impact: p.impactPoint ? IMPACT_LABELS[p.impactPoint] : null,
    damage: p.visibleDamage || null,
    circumstances: circ.length ? (
      <ul className="space-y-0.5">
        {circ.map((n) => (
          <li key={n}>
            <span className="font-semibold tabular-nums">{n}.</span> {FORM_CIRCUMSTANCES[n - 1]}
          </li>
        ))}
      </ul>
    ) : null,
    notes: p.observations || null,
    photos: photos > 0 ? String(photos) : null,
  };
}

/**
 * A și B pe aceleași rânduri, ca pe formular. Capul coloanei = mașina (plăcuța) și starea șoferului;
 * primul rând spune dacă e client al agenției. Celulele vizate de o nepotrivire au fundal de atenționare.
 */
function Comparison({
  a,
  b,
  photosA,
  photosB,
  checks,
  docsIncomplete,
  client,
}: {
  a: Party;
  b: Party;
  photosA: number;
  photosB: number;
  checks: CrossCheck[];
  docsIncomplete: ("A" | "B")[];
  client: (role: "A" | "B") => ReactNode;
}) {
  const ca = cells(a, photosA);
  const cb = cells(b, photosB);
  const bEmpty = !b.vehicle.plate && !b.driver.surname && !b.insurance.company;
  const clientA = client("A");
  const clientB = client("B");
  const all: Row[] = [
    { label: "Client", a: clientA, b: clientB },
    { label: "Asigurător", field: "policy", a: ca.insurer, b: cb.insurer },
    { label: "Poliță RCA", field: "policy", a: ca.policy, b: cb.policy },
    { label: "Conducător", a: ca.driver, b: cb.driver },
    { label: "Contact", a: ca.contact, b: cb.contact },
    { label: "Permis", field: "license", a: ca.license, b: cb.license },
    { label: "Circumstanțe", field: "circumstances", a: ca.circumstances, b: cb.circumstances },
    { label: "Zona lovită", a: ca.impact, b: cb.impact },
    { label: "Daune vizibile", a: ca.damage, b: cb.damage },
    { label: "Poze", a: ca.photos, b: cb.photos },
    { label: "Observații", a: ca.notes, b: cb.notes },
  ];
  const rows = all.filter((r) => r.a !== null || r.b !== null);

  const flagged = (field: CheckField | undefined, role: "A" | "B") =>
    field !== undefined && checks.some((c) => c.field === field && (c.role === null || c.role === role));
  const cellClass = (field: CheckField | undefined, role: "A" | "B") =>
    cn("min-w-0 px-3 py-1.5 align-top break-words", flagged(field, role) && "bg-tone-todo");

  return (
    <section aria-labelledby="comparatie" className="-mx-5 overflow-x-auto border-b border-border">
      <h2 id="comparatie" className="sr-only">
        Comparație între șoferul A și șoferul B
      </h2>
      <table className="w-full min-w-[520px] table-fixed border-collapse">
        <colgroup>
          <col className="w-[116px] md:w-[136px]" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-2.5 pr-3 pl-5 align-top text-[12px] font-medium text-muted-foreground">
              Vehicul
            </th>
            {(["A", "B"] as const).map((role) => {
              const p = role === "A" ? a : b;
              const empty = role === "B" && bEmpty;
              const state = empty
                ? "nu a trimis încă datele"
                : [p.signature ? "semnat" : "nesemnat", docsIncomplete.includes(role) && "acte incomplete"].filter(Boolean).join(", ");
              return (
                <th key={role} scope="col" className={cn("px-3 py-2.5 align-top", flagged("vehicle", role) && "bg-tone-todo")}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <RoleTag role={role} />
                    {p.vehicle.plate ? <Plate plate={p.vehicle.plate} /> : <span className="text-muted-foreground">fără număr</span>}
                    {p.vehicle.makeType && <span className="truncate font-medium">{vehicleName(p.vehicle.makeType)}</span>}
                  </div>
                  <p className={cn("mt-1 text-[12px] font-normal", p.signature && !docsIncomplete.includes(role) ? "text-tone-ok-foreground" : "text-muted-foreground")}>
                    {state.charAt(0).toUpperCase() + state.slice(1)}
                  </p>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-b-0">
              <th scope="row" className="py-1.5 pr-3 pl-5 text-left align-top font-normal text-muted-foreground">
                {r.label}
              </th>
              <td className={cellClass(r.field, "A")}>{r.a ?? <Empty />}</td>
              <td className={cellClass(r.field, "B")}>{r.b ?? <Empty />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const Empty = () => (
  <span className="text-muted-foreground/60" aria-label="necompletat">
    —
  </span>
);

const FILE_LABELS: Record<string, string> = {
  damage: "Poză cu daunele",
  sketch: "Schiță salvată",
  policy: "Poliță încărcată",
  license: "Permis încărcat",
  id_doc: "Act de identitate încărcat",
};

const TZ = "Europe/Bucharest";

const LINK_METHODS: Record<string, string> = {
  policy: "recunoscut după poliță",
  plate: "recunoscut după nr. înmatriculare",
  phone: "recunoscut după telefon",
  broker_matched: "legat de broker de clientul existent",
  broker_added: "adăugat în portofoliu de broker",
};
const eventLabel = (e: { type: string; payload: { role?: string; method?: string } | null }) =>
  e.type === "client_linked"
    ? `Client${e.payload?.role ? ` ${e.payload.role}` : ""}: ${LINK_METHODS[e.payload?.method ?? ""] ?? "legat"}`
    : e.type;

/** Istoricul pe zile; rândurile identice consecutive (ex. mai multe poze) se adună: „Poză cu daunele (A) ×3”. */
function buildTimeline(
  meta: Meta,
  files: { kind: string; party_role: string | null; created_at: string }[],
  events: { type: string; payload: { role?: string; method?: string } | null; at: string }[],
) {
  const raw = [
    { at: meta.created_at, label: "Dosar creat" },
    ...files.map((f) => ({ at: f.created_at, label: `${FILE_LABELS[f.kind] ?? f.kind}${f.party_role ? ` (${f.party_role})` : ""}` })),
    ...events.map((e) => ({ at: e.at, label: eventLabel(e) })),
  ];
  if (meta.updated_at !== meta.created_at) raw.push({ at: meta.updated_at, label: `Ultima schimbare: ${STATUS_LABELS[meta.status]}` });
  raw.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());

  const merged: { at: string; label: string; n: number }[] = [];
  for (const item of raw) {
    const last = merged.at(-1);
    if (last && last.label === item.label) last.n += 1;
    else merged.push({ ...item, n: 1 });
  }

  const days: { day: string; items: { at: string; time: string; label: string }[] }[] = [];
  for (const m of merged) {
    const d = new Date(m.at);
    const day = d.toLocaleDateString("ro-RO", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
    const time = d.toLocaleTimeString("ro-RO", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    const entry = { at: m.at, time, label: m.n > 1 ? `${m.label} ×${m.n}` : m.label };
    const last = days.at(-1);
    if (last?.day === day) last.items.push(entry);
    else days.push({ day, items: [entry] });
  }
  return days;
}
