"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CarFront,
  FileText,
  ListChecks,
  MapPin,
  Pencil,
  RotateCcw,
  Route,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CIRCUMSTANCES, DISCLAIMER, IMPACT_LABELS } from "@/lib/amiabila/content";
import { canContinue, type Draft, type StepSlug } from "@/lib/amiabila/draft";
import { Checkbox } from "@/components/ui/checkbox";
import { resetDraft, updateDraft, useDraft } from "@/lib/amiabila/draft-store";
import { fieldValue } from "@/lib/amiabila/documents";
import { cn } from "@/lib/utils";
import { StepFrame } from "./step-frame";

/** Pașii fără de care nu se poate semna și ce îi spunem șoferului. */
const REQUIRED: { slug: StepSlug; missing: string }[] = [
  { slug: "loc-timp", missing: "Lipsește adresa sau ora accidentului." },
  { slug: "acte", missing: "Actele nu sunt verificate." },
  { slug: "sofer-b", missing: "Șoferul B nu a fost invitat." },
  { slug: "circumstante", missing: "Nu ați bifat nicio circumstanță." },
  { slug: "impact", missing: "Nu ați ales zona lovită." },
];

function missingSteps(draft: Draft): Map<StepSlug, string> {
  const now = new Date();
  return new Map(REQUIRED.filter((r) => !canContinue(r.slug, draft, now)).map((r) => [r.slug, r.missing]));
}

function Section({
  icon: Icon,
  title,
  href,
  missing,
  children,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
  /** Textul afișat când secțiunea blochează semnătura. */
  missing?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon className="size-5 text-primary" aria-hidden />
          {title}
        </h2>
        <Link
          href={href}
          className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[15px] font-medium text-primary underline-offset-4 hover:underline"
        >
          <Pencil className="size-4" aria-hidden />
          {missing ? "Completează" : "Modifică"}
        </Link>
      </div>
      <div
        className={cn(
          "space-y-1 rounded-lg border p-4 text-[17px]",
          missing ? "border-warning-foreground/30 bg-warning" : "bg-card",
        )}
      >
        {missing ? (
          <p className="flex items-start gap-2 font-medium text-warning-foreground">
            <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden />
            {missing}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Momentul nu e setat";
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
}

export function SummaryStep() {
  const draft = useDraft();
  const router = useRouter();
  const { place, circumstances } = draft;
  const checked = CIRCUMSTANCES.filter((c) => circumstances.checked.includes(c.n));
  const missing = missingSteps(draft);
  const [confirmReset, setConfirmReset] = useState(false);

  // Dacă dosarul există pe server (pasul „Șofer B”), îl actualizăm cu actele, circumstanțele și schița lui A; finalizarea se face la pasul „Semnătura”.
  const synced = useRef("");
  const { claim } = draft;
  useEffect(() => {
    if (!claim) return;
    const body = JSON.stringify({ circumstances, documents: draft.documents, sketch: draft.sketch, contactConsent: draft.contactConsent });
    if (synced.current === body) return;
    synced.current = body;
    fetch(`/api/claims/${claim.id}`, { method: "PATCH", headers: { "content-type": "application/json", "x-claim-token": claim.aToken }, body })
      .then((res) => {
        if (!res.ok) synced.current = "";
      })
      .catch(() => {
        synced.current = "";
      });
  }, [claim, circumstances, draft.documents, draft.sketch, draft.contactConsent]);

  return (
    <StepFrame
      slug="rezumat"
      heading="Verificați datele"
      lead="Atingeți Modifică la orice secțiune. Apoi urmează semnăturile."
      continueLabel="Treceți la semnătură"
      nextHref="/amiabila/semnatura"
      canContinue={missing.size === 0}
      disabledHint={missing.size === 1 ? "Mai e o secțiune de completat." : `Mai sunt ${missing.size} secțiuni de completat.`}
      footnote={DISCLAIMER}
    >
      {missing.has("sofer-b") ? (
        <Section icon={UserPlus} title="Șofer B" href="/amiabila/sofer-b" missing={missing.get("sofer-b")}>
          <p className="text-muted-foreground">Semnăturile se adună în dosarul creat la acest pas.</p>
        </Section>
      ) : null}

      <Section icon={MapPin} title="Loc și timp" href="/amiabila/loc-timp" missing={missing.get("loc-timp")}>
        <p>{place.address || "Adresa nu e completată"}</p>
        <p className="text-muted-foreground">{formatWhen(place.occurredAt)}</p>
      </Section>

      <Section icon={FileText} title="Acte" href="/amiabila/acte" missing={missing.get("acte")}>
        {draft.documents.registration || draft.documents.license || draft.documents.policy ? (
          <>
            <p>
              {fieldValue(draft.documents.registration, "plate") || "Număr lipsă"}
              {fieldValue(draft.documents.registration, "make")
                ? `, ${fieldValue(draft.documents.registration, "make")} ${fieldValue(draft.documents.registration, "model")}`
                : ""}
            </p>
            <p>{fieldValue(draft.documents.license, "fullName") || "Permis necompletat"}</p>
            <p className="text-muted-foreground">
              {[fieldValue(draft.documents.license, "phone"), fieldValue(draft.documents.license, "email")].filter(Boolean).join(" · ") ||
                "Telefon necompletat"}
            </p>
            <p className="text-muted-foreground">
              {fieldValue(draft.documents.policy, "insurer") || "Poliță necompletată"}
              {fieldValue(draft.documents.policy, "validTo") ? `, valabilă până la ${fieldValue(draft.documents.policy, "validTo")}` : ""}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Actele nu sunt completate</p>
        )}
      </Section>

      <Section icon={ListChecks} title="Circumstanțe" href="/amiabila/circumstante" missing={missing.get("circumstante")}>
        {checked.length === 0 ? (
          <p className="text-muted-foreground">Nimic bifat</p>
        ) : (
          <ul className="space-y-1">
            {checked.map((c) => (
              <li key={c.n}>
                <span className="font-semibold">{c.n}.</span> {c.label}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={CarFront} title="Impact și daune" href="/amiabila/impact" missing={missing.get("impact")}>
        <p>{circumstances.impact ? IMPACT_LABELS[circumstances.impact] : "Zona nu e aleasă"}</p>
        {circumstances.damage ? <p>{circumstances.damage}</p> : null}
        {circumstances.notes ? <p className="text-muted-foreground">{circumstances.notes}</p> : null}
      </Section>

      <Section icon={Route} title="Schiță" href="/amiabila/schita">
        <p className={draft.sketch ? undefined : "text-muted-foreground"}>
          {draft.sketch
            ? { template: "Drum cu mașinile așezate", drawing: "Desen cu degetul", photo: "Poză cu schița" }[draft.sketch.mode]
            : "Fără schiță"}
        </p>
      </Section>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 text-[15px] leading-snug">
        <Checkbox
          className="mt-0.5"
          checked={draft.contactConsent}
          onCheckedChange={(v) => updateDraft((d) => ({ ...d, contactConsent: v === true }))}
        />
        <span>
          Sunt de acord ca brokerul să îmi păstreze datele de contact și să mă contacteze despre asigurările mele.
          <span className="mt-1 block text-muted-foreground">Opțional. Dosarul merge mai departe oricum. Puteți retrage acordul oricând.</span>
        </span>
      </label>

      <Button variant="outline" size="xl" className="w-full" nativeButton={false} render={<Link href="/amiabila/document" />}>
        <FileText aria-hidden />
        Vezi formularul completat
      </Button>

      {confirmReset ? (
        <div role="alertdialog" aria-labelledby="reset-title" className="space-y-3 rounded-lg border border-destructive/30 bg-card p-4">
          <p id="reset-title" className="text-[17px] font-semibold">
            Ștergeți toate datele?
          </p>
          <p className="text-[15px] text-muted-foreground">
            Se pierd actele, circumstanțele, schița și legătura cu dosarul. Șoferul B nu mai poate continua pe linkul primit.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="xl" className="bg-card px-3" autoFocus onClick={() => setConfirmReset(false)}>
              Păstrează datele
            </Button>
            <Button
              variant="destructive"
              size="xl"
              className="px-3"
              onClick={() => {
                resetDraft();
                router.push("/amiabila/siguranta");
              }}
            >
              Șterge datele
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" className="mt-4 h-12 w-full text-base text-muted-foreground" onClick={() => setConfirmReset(true)}>
          <RotateCcw aria-hidden />
          Șterge și începe din nou
        </Button>
      )}
    </StepFrame>
  );
}
