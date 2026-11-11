import Link from "next/link";
import { ArrowRight, Camera, FileCheck2, QrCode } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmergencyLink } from "@/components/wizard/step-frame";
import { DISCLAIMER } from "@/lib/amiabila/content";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Camera, text: "Fotografiați actele, iar datele se completează singure." },
  { icon: QrCode, text: "Celălalt șofer intră pe telefonul lui, prin link sau cod QR." },
  { icon: FileCheck2, text: "Semnați pe ecran. Brokerul primește dosarul gata făcut." },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto w-full max-w-md px-5 pt-4 pb-14">
          <div className="flex h-11 items-center justify-between">
            <span className="text-lg font-bold tracking-tight">BrokerPilot</span>
            <EmergencyLink />
          </div>
          <div className="mt-6 flex gap-2" aria-hidden>
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-driver-a text-xl font-bold text-driver-a-foreground">
              A
            </span>
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-driver-b text-xl font-bold text-driver-b-foreground">
              B
            </span>
          </div>
          <h1 className="mt-5 text-[2rem] leading-[1.1] font-semibold text-balance">Ați avut un accident ușor?</h1>
          <p className="mt-3 text-lg text-navy-muted">
            Completați amiabila de pe telefon, în câteva minute. Nu aveți nevoie de cont.
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-7 w-full max-w-md flex-1 px-4 pb-8">
        <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
          <ul className="space-y-4">
            {STEPS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-5" />
                </span>
                <span className="pt-1.5 text-[17px]">{text}</span>
              </li>
            ))}
          </ul>
          <Link href="/amiabila" className={cn(buttonVariants({ variant: "cta", size: "xl" }), "w-full")}>
            Începe amiabila
            <ArrowRight aria-hidden />
          </Link>
        </div>
        <p className="mt-5 px-1 text-[15px] text-muted-foreground">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
