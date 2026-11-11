"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CarFront, ListChecks, MapPin, Pencil, RotateCcw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CIRCUMSTANCES, DISCLAIMER, IMPACT_LABELS } from "@/lib/amiabila/content";
import { resetDraft, useDraft } from "@/lib/amiabila/draft-store";
import { StepFrame } from "./step-frame";

function Section({
  icon: Icon,
  title,
  href,
  children,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border-t pt-5 first:border-t-0 first:pt-0">
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
          Modifică
        </Link>
      </div>
      <div className="space-y-1 text-[17px]">{children}</div>
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

  return (
    <StepFrame
      slug="rezumat"
      heading="Verificați datele"
      lead="Atingeți Modifică la orice secțiune. Urmează actele, celălalt șofer, pozele și semnăturile."
      continueLabel={null}
      footnote={DISCLAIMER}
    >
      <Section icon={MapPin} title="Loc și timp" href="/amiabila/loc-timp">
        <p>{place.address || "Adresa nu e completată"}</p>
        <p className="text-muted-foreground">{formatWhen(place.occurredAt)}</p>
      </Section>

      <Section icon={ListChecks} title="Circumstanțe" href="/amiabila/circumstante">
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

      <Section icon={CarFront} title="Impact și daune" href="/amiabila/impact">
        <p>{circumstances.impact ? IMPACT_LABELS[circumstances.impact] : "Zona nu e aleasă"}</p>
        {circumstances.damage ? <p>{circumstances.damage}</p> : null}
        {circumstances.notes ? <p className="text-muted-foreground">{circumstances.notes}</p> : null}
      </Section>

      <Button
        variant="ghost"
        className="h-12 w-full text-base"
        onClick={() => {
          resetDraft();
          router.push("/amiabila/siguranta");
        }}
      >
        <RotateCcw aria-hidden />
        Șterge și începe din nou
      </Button>
    </StepFrame>
  );
}
