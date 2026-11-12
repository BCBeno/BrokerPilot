"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STEPS, isStepSlug } from "@/lib/amiabila/draft";
import { resetDraft, useDraft, useHydrated } from "@/lib/amiabila/draft-store";

const TITLES: Record<string, string> = {
  ...Object.fromEntries(STEPS.map((s) => [s.slug, s.title])),
  rezumat: "Rezumat",
  semnatura: "Semnătură",
};

/** „azi, la 14:32”, „ieri, la 09:10” sau „pe 3 noiembrie, la 18:05”. `now` e parametru ca să fie testabilă. */
export function describeWhen(iso: string, now: Date): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit" }).format(at);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  if (diff === 0) return `azi, la ${time}`;
  if (diff === 1) return `ieri, la ${time}`;
  return `pe ${new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long" }).format(at)}, la ${time}`;
}

/** Pe primul ecran, doar când există o ciornă trecută de „siguranta”: continuă de unde a rămas sau pornește de la zero. */
export function ResumeBanner() {
  const draft = useDraft();
  const hydrated = useHydrated();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const step = draft.lastStep;
  if (!hydrated || !step || step === "siguranta" || !isStepSlug(step)) return null;
  const when = draft.updatedAt ? describeWhen(draft.updatedAt, new Date()) : null;

  if (confirming) {
    return (
      <div role="alertdialog" aria-labelledby="resume-reset-title" className="space-y-3 rounded-lg border border-destructive/30 bg-card p-4">
        <p id="resume-reset-title" className="text-[17px] font-semibold">
          Ștergeți declarația începută?
        </p>
        <p className="text-[15px] text-muted-foreground">
          Se pierd actele, schița și legătura cu dosarul{draft.claim ? `, iar șoferul B nu mai poate continua pe linkul primit` : ""}.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="xl" className="bg-card px-3" autoFocus onClick={() => setConfirming(false)}>
            Păstrează
          </Button>
          <Button
            variant="destructive"
            size="xl"
            className="px-3"
            onClick={() => {
              resetDraft();
              setConfirming(false);
            }}
          >
            Șterge
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="resume-title" className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h2 id="resume-title" className="flex items-center gap-2 text-[17px] font-semibold">
          <FileText className="size-5 text-primary" aria-hidden />
          Aveți o declarație începută
        </h2>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {when ? `Ultima modificare ${when}. ` : ""}Ați ajuns la pasul „{TITLES[step]}”.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="cta" size="xl" className="px-3" onClick={() => router.push(`/amiabila/${step}`)}>
          Continuați
        </Button>
        <Button variant="outline" size="xl" className="bg-card px-3" onClick={() => setConfirming(true)}>
          Începeți din nou
        </Button>
      </div>
    </section>
  );
}
