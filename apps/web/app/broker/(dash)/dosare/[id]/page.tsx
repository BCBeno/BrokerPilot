import { AlertTriangle, ArrowLeft, CheckCircle2, CircleAlert, FileDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { SketchView } from "@/components/amiabila-form/sketch-view";
import { RoleTag, StatusPill } from "@/components/broker/status-pill";
import { Button } from "@/components/ui/button";
import { FORM_CIRCUMSTANCES, IMPACT_LABELS } from "@/lib/amiabila/content";
import type { Party } from "@/lib/amiabila/form";
import { CHANNEL_LABELS, STATUS_LABELS, type ClaimStatus } from "@/lib/broker/claims";
import { crossChecks, type CheckField, type CrossCheck } from "@/lib/broker/compare";
import { requireBroker } from "@/lib/broker/session";
import { missingItems, type MissingItem } from "@/lib/claims/completeness";
import { CLAIM_BUCKET } from "@/lib/claims/files";
import { loadClaimDocument } from "@/lib/claims/form-data";
import { cn } from "@/lib/utils";
import { closeClaim, takeClaim } from "../../../actions";

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
 * Fișa dosarului (redesign „fișă comparativă”): antet cu acțiunea, banda „ce lipsește / de verificat”,
 * apoi A și B pe aceleași rânduri, ca pe formular. Rândurile goale la ambii se ascund.
 */
export default async function ClaimDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) notFound();
  const { db, broker } = await requireBroker();

  const [doc, metaRes, filesRes, eventsRes] = await Promise.all([
    loadClaimDocument(db, id.data),
    db.from("claims").select("status, broker_id, created_at, updated_at, ai_summary, pdf_path, brokers(name)").eq("id", id.data).maybeSingle(),
    db.from("claim_files").select("kind, party_role, created_at").eq("claim_id", id.data).order("created_at"),
    db.from("events").select("type, at").eq("entity_type", "claim").eq("entity_id", id.data).order("at"),
  ]);
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
  const when = [form.date && `${form.date}${form.time ? `, ${form.time}` : ""}`, form.place].filter(Boolean).join(" · ");

  return (
    <article aria-label={`Dosar ${doc.ref}`} className="min-h-0 overflow-y-auto rounded-lg border border-border bg-card text-[13px]">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <Link href="/broker" className="mb-1 inline-flex items-center gap-1 text-[12px] text-muted-foreground lg:hidden">
          <ArrowLeft aria-hidden className="size-3.5" /> Dosare
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-[17px] font-semibold">{doc.ref}</h1>
            <StatusPill status={meta.status} />
            <span className="text-[12px] text-muted-foreground">{CHANNEL_LABELS[doc.channel] ?? doc.channel}</span>
          </div>
          <div className="flex items-center gap-2">
            {pdfUrl && (
              <a
                href={pdfUrl}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-muted"
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
        <p className="mt-1 text-muted-foreground">
          {when || "Locul și ora nu sunt completate"}
          <span aria-hidden> · </span>
          {meta.brokers?.name ? `preluat de ${meta.brokers.name}` : "nepreluat"}
        </p>
      </header>

      <div className="space-y-3 p-4">
        <StatusStrip missing={missing} checks={checks} />
        <Comparison a={form.a} b={form.b} photosA={doc.facts.photosA} photosB={doc.facts.photosB} checks={checks} />

        <section aria-labelledby="media" className="rounded-md border border-border">
          <h2 id="media" className="flex items-baseline gap-2 border-b border-border px-3 py-2 text-[13px] font-semibold">
            Poze și schiță
            <span className="font-normal text-muted-foreground">
              {doc.photos.length} {doc.photos.length === 1 ? "poză" : "poze"} · {form.sketch ? "cu schiță" : "fără schiță"}
            </span>
          </h2>
          <div className={cn("grid gap-3 p-3", form.sketch && "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
            {doc.photos.length === 0 ? (
              <p className="text-muted-foreground">Nicio poză încărcată.</p>
            ) : (
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
              <div className="overflow-hidden rounded border border-border [&_svg]:h-auto [&_svg]:w-full">
                <SketchView sketch={form.sketch} />
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="istoric" className="rounded-md border border-border">
            <h2 id="istoric" className="border-b border-border px-3 py-2 text-[13px] font-semibold">
              Istoric
            </h2>
            <ol className="px-3 py-2">
              {timeline.map((day) => (
                <li key={day.day}>
                  <p className="mt-1 text-[12px] font-medium text-muted-foreground first:mt-0">{day.day}</p>
                  <ol>
                    {day.items.map((t, i) => (
                      <li key={i} className="flex gap-3 py-0.5">
                        <time className="w-11 shrink-0 tabular-nums text-muted-foreground" dateTime={t.at}>
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
            <section aria-labelledby="telegram" className="rounded-md border border-border">
              <h2 id="telegram" className="border-b border-border px-3 py-2 text-[13px] font-semibold">
                Mesajul trimis pe Telegram
              </h2>
              <p className="px-3 py-2 whitespace-pre-line text-muted-foreground">{meta.ai_summary}</p>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

/** Ce are brokerul de făcut, înainte de date: lipsurile (blocante / recomandate) și verificările încrucișate. */
function StatusStrip({ missing, checks }: { missing: MissingItem[]; checks: CrossCheck[] }) {
  const blocking = missing.filter((m) => m.blocking);
  const recommended = missing.filter((m) => !m.blocking);
  return (
    <section aria-label="Ce trebuie verificat" className="space-y-2">
      {blocking.length > 0 ? (
        <div className="rounded-md bg-tone-danger px-3 py-2 text-tone-danger-foreground">
          <p className="flex items-center gap-1.5 font-semibold">
            <CircleAlert aria-hidden className="size-4" />
            {blocking.length === 1 ? "1 lipsă blocantă" : `${blocking.length} lipsuri blocante`}
          </p>
          <ul className="mt-1 ml-[22px] list-disc space-y-0.5">
            {blocking.map((m) => (
              <li key={m.code}>{m.label}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 rounded-md bg-tone-ok px-3 py-2 font-medium text-tone-ok-foreground">
          <CheckCircle2 aria-hidden className="size-4" /> Dosarul are actele, circumstanțele și semnăturile.
        </p>
      )}
      {checks.length > 0 && (
        <div className="rounded-md bg-tone-todo px-3 py-2 text-tone-todo-foreground">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle aria-hidden className="size-4" /> De verificat
          </p>
          <ul className="mt-1 ml-[22px] list-disc space-y-0.5">
            {checks.map((c, i) => (
              <li key={i} className={c.level === "danger" ? "font-medium" : undefined}>
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {recommended.length > 0 && (
        <p className="px-1 text-muted-foreground">
          <span className="font-medium">Recomandat:</span> {recommended.map((m) => m.label.charAt(0).toLowerCase() + m.label.slice(1)).join(" · ")}
        </p>
      )}
    </section>
  );
}

type Cell = ReactNode | null;
type Row = { label: string; field?: CheckField; a: Cell; b: Cell };

const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ") || null;

function cells(p: Party, photos: number) {
  const name = [p.driver.surname, p.driver.firstName].filter(Boolean).join(" ");
  const circ = [...p.circumstances].sort((x, y) => x - y);
  return {
    insurer: p.insurance.company || null,
    policy: join(p.insurance.policyNo, p.insurance.validFrom && p.insurance.validTo && `${p.insurance.validFrom} – ${p.insurance.validTo}`),
    driver: name || null,
    contact: p.driver.contact || null,
    license: join(p.driver.licenseNo, p.driver.category && `cat. ${p.driver.category}`, p.driver.licenseValidTo && `până la ${p.driver.licenseValidTo}`),
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

/** A și B pe aceleași rânduri; celulele marcate de o verificare au fundal de atenționare. */
function Comparison({ a, b, photosA, photosB, checks }: { a: Party; b: Party; photosA: number; photosB: number; checks: CrossCheck[] }) {
  const ca = cells(a, photosA);
  const cb = cells(b, photosB);
  const bEmpty = !b.vehicle.plate && !b.driver.surname && !b.insurance.company;
  const all: Row[] = [
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
    cn("min-w-0 break-words px-3 py-1.5 align-top", flagged(field, role) && "bg-tone-todo text-tone-todo-foreground");

  return (
    <section aria-labelledby="comparatie" className="overflow-x-auto rounded-md border border-border">
      <h2 id="comparatie" className="sr-only">
        Comparație între șoferul A și șoferul B
      </h2>
      <table className="w-full min-w-[480px] table-fixed border-collapse">
        <colgroup>
          <col className="w-[96px] md:w-[118px]" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th scope="col" className="px-3 py-2 text-[12px] font-medium text-muted-foreground">
              Vehicul
            </th>
            {(["A", "B"] as const).map((role) => {
              const p = role === "A" ? a : b;
              const empty = role === "B" && bEmpty;
              return (
                <th key={role} scope="col" className={cn("px-3 py-2 align-top", flagged("vehicle", role) && "bg-tone-todo")}>
                  <div className="flex items-center gap-2">
                    <RoleTag role={role} />
                    <span className="text-[14px] font-semibold">{p.vehicle.plate || "—"}</span>
                    <span className="truncate font-normal text-muted-foreground">{p.vehicle.makeType}</span>
                  </div>
                  <p className={cn("mt-0.5 text-[12px] font-normal", p.signature ? "text-tone-ok-foreground" : "text-muted-foreground")}>
                    {empty ? "Nu a trimis încă datele" : p.signature ? "Semnat" : "Nesemnat"}
                  </p>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-b-0">
              <th scope="row" className="px-3 py-1.5 text-left align-top font-normal text-muted-foreground">
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
  damage: "Poză daune",
  sketch: "Schiță salvată",
  policy: "Poliță încărcată",
  license: "Permis",
  id_doc: "Act",
};

const TZ = "Europe/Bucharest";

/** Istoricul pe zile; rândurile identice consecutive (ex. mai multe poze) se adună: „Poză daune · A (×3)”. */
function buildTimeline(
  meta: Meta,
  files: { kind: string; party_role: string | null; created_at: string }[],
  events: { type: string; at: string }[],
) {
  const raw = [
    { at: meta.created_at, label: "Dosar creat" },
    ...files.map((f) => ({ at: f.created_at, label: `${FILE_LABELS[f.kind] ?? f.kind}${f.party_role ? ` · ${f.party_role}` : ""}` })),
    ...events.map((e) => ({ at: e.at, label: e.type })),
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
    const entry = { at: m.at, time, label: m.n > 1 ? `${m.label} (×${m.n})` : m.label };
    const last = days.at(-1);
    if (last?.day === day) last.items.push(entry);
    else days.push({ day, items: [entry] });
  }
  return days;
}
