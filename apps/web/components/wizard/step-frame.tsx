"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STEPS, nextSlug, prevSlug, stepIndex, type StepSlug } from "@/lib/amiabila/draft";
import { useHydrated } from "@/lib/amiabila/draft-store";
import { cn } from "@/lib/utils";

export function DriverBadge({ driver, className }: { driver: "A" | "B"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
        driver === "A" ? "bg-driver-a text-driver-a-foreground" : "bg-driver-b text-driver-b-foreground",
        className,
      )}
    >
      {driver}
    </span>
  );
}

function Progress({ slug }: { slug: StepSlug }) {
  const total = STEPS.length;
  const isSummary = slug === "rezumat";
  const current = isSummary ? total : stepIndex(slug) + 1;
  const label = isSummary ? "Rezumat" : `Pasul ${current} din ${total}`;
  return (
    <div>
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s.slug} className={cn("h-1 flex-1 rounded-full", i < current ? "bg-progress" : "bg-navy-line")} />
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 text-[15px] text-navy-muted">
        <DriverBadge driver="A" />
        <span>
          <span className="sr-only">Șofer A. </span>
          {label}
        </span>
      </p>
    </div>
  );
}

export function EmergencyLink({ className }: { className?: string }) {
  return (
    <a
      href="tel:112"
      aria-label="Sună la 112"
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-lg bg-destructive px-3.5 text-base font-bold text-destructive-foreground outline-none focus-visible:ring-3 focus-visible:ring-white/60",
        className,
      )}
    >
      <Phone className="size-4" aria-hidden />
      112
    </a>
  );
}

type StepFrameProps = {
  slug: StepSlug;
  heading: string;
  lead?: string;
  children: React.ReactNode;
  /** `null` ascunde butonul principal (ex.: ecranul de urgență). */
  continueLabel?: string | null;
  canContinue?: boolean;
  /** Rulează înainte de navigare (ex.: salvarea orei). */
  onContinue?: () => void;
  /** Ce lipsește, afișat deasupra butonului cât timp acesta e dezactivat. */
  disabledHint?: string;
  /** Notă sub foaia albă (ex.: disclaimer), ca să nu concureze cu decizia. */
  footnote?: React.ReactNode;
};

export function StepFrame({
  slug,
  heading,
  lead,
  children,
  continueLabel = "Continuă",
  canContinue = true,
  onContinue,
  disabledHint,
  footnote,
}: StepFrameProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const prev = prevSlug(slug);
  const next = nextSlug(slug);
  const hasAction = continueLabel !== null && next !== null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto w-full max-w-md px-5 pt-4 pb-7">
          <nav className="flex items-center justify-between">
            <Link
              href={prev ? `/amiabila/${prev}` : "/"}
              className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-base font-medium outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-white/60"
            >
              <ArrowLeft className="size-5" aria-hidden />
              Înapoi
            </Link>
            <EmergencyLink />
          </nav>
          <div className="mt-4">
            <Progress slug={slug} />
          </div>
          <h1 className="mt-5 text-[1.75rem] leading-[1.15] font-semibold text-balance">{heading}</h1>
          {lead ? <p className="mt-2 text-navy-muted">{lead}</p> : null}
        </div>
      </header>

      <main className={cn("mx-auto w-full max-w-md flex-1 px-4 pt-6", hasAction ? "pb-44" : "pb-10")}>
        <div className={cn("space-y-7", !hydrated && "invisible")}>{children}</div>
        {footnote ? <p className="mt-6 text-[15px] text-muted-foreground">{footnote}</p> : null}
      </main>

      {hasAction ? (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <div className="mx-auto w-full max-w-md px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {!canContinue && disabledHint ? (
              <p role="status" className="mb-2 text-center text-[15px] text-muted-foreground">
                {disabledHint}
              </p>
            ) : null}
            <Button
              variant="cta"
              size="xl"
              className="w-full"
              disabled={!canContinue}
              onClick={() => {
                onContinue?.();
                router.push(`/amiabila/${next}`);
              }}
            >
              {continueLabel}
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
