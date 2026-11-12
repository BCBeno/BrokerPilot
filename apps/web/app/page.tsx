import Link from "next/link";
import { ArrowRight, FileText, IdCard, ShieldCheck, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CallButton } from "@/components/voice/call-button";
import { EmergencyLink } from "@/components/wizard/step-frame";
import { DISCLAIMER } from "@/lib/amiabila/content";
import { cn } from "@/lib/utils";

const NEEDED: { icon: LucideIcon; title: string; detail?: string }[] = [
  { icon: FileText, title: "Certificatul de înmatriculare", detail: "talonul mașinii" },
  { icon: IdCard, title: "Permisul de conducere" },
  { icon: ShieldCheck, title: "Polița RCA", detail: "poză sau PDF" },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto w-full max-w-md px-5 pt-4 pb-7">
          <div className="flex h-11 items-center justify-between">
            <span className="text-lg font-bold tracking-tight">BrokerPilot</span>
            <EmergencyLink />
          </div>
          <h1 className="mt-5 text-[1.75rem] leading-[1.15] font-semibold">Amiabilă digitală</h1>
          <p className="mt-2 text-navy-muted">Înainte să începeți</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-6 pb-8">
        <h2 className="text-lg font-semibold">Aveți la îndemână</h2>
        <ul className="mt-2.5 divide-y overflow-hidden rounded-lg border bg-card">
          {NEEDED.map(({ icon: Icon, title, detail }) => (
            <li key={title} className="flex items-center gap-3 px-4 py-3.5">
              <Icon className="size-6 shrink-0 text-primary" aria-hidden />
              <span className="text-[17px]">
                {title}
                {detail ? <span className="block text-[15px] text-muted-foreground">{detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[15px] text-muted-foreground">
          Durează cam 10 minute. Celălalt șofer are nevoie doar de telefonul lui.
        </p>

        <Link href="/amiabila" className={cn(buttonVariants({ variant: "cta", size: "xl" }), "mt-6 w-full")}>
          Începe
          <ArrowRight aria-hidden />
        </Link>
        <CallButton />
        <p className="mt-6 text-[15px] text-muted-foreground">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
