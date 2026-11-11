"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Clock, LoaderCircle, MapPin, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BROADCAST_B_JOINED, type JoinInfo } from "@/lib/amiabila/claim";
import { signalClaim } from "@/lib/claims/realtime";
import { DriverBadge, EmergencyLink } from "./step-frame";
import { useWizard } from "./wizard-context";

type State = { kind: "loading" } | { kind: "ready"; info: JoinInfo } | { kind: "error"; message: string; expired: boolean };

const formatWhen = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("ro-RO", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso)) : "";

/** Ecranul de început al șoferului B: confirmă linkul, arată locul și ora, anunță telefonul lui A. */
export function BIntro({ token }: { token: string }) {
  const { basePath, update } = useWizard();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/claims/join/${token}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as Partial<JoinInfo> & { error?: string };
        if (!live) return;
        if (res.ok && json.claimId) {
          const info = json as JoinInfo;
          // B nu completează locul și ora: le ia de la A, ca să se potrivească polița cu data accidentului.
          update((d) => ({ ...d, place: { ...d.place, address: info.address, occurredAt: info.occurredAt } }));
          setState({ kind: "ready", info });
          void signalClaim(info.claimId, BROADCAST_B_JOINED);
        } else {
          setState({ kind: "error", message: json.error ?? "Linkul nu a putut fi deschis.", expired: res.status === 410 });
        }
      } catch {
        if (live) {
          setState({ kind: "error", message: "Nu am putut deschide linkul. Verificați conexiunea și reîncărcați pagina.", expired: false });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [token, update]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto w-full max-w-md px-5 pt-4 pb-7">
          <nav className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[15px] text-navy-muted">
              <DriverBadge driver="B" />
              Șofer B
            </span>
            <EmergencyLink />
          </nav>
          <h1 className="mt-5 text-[1.75rem] leading-[1.15] font-semibold text-balance">Completați amiabila</h1>
          <p className="mt-2 text-navy-muted">Celălalt șofer v-a invitat. Durează câteva minute, direct de pe telefonul dumneavoastră.</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 pt-6 pb-10">
        {state.kind === "loading" ? (
          <p role="status" className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            Deschidem linkul…
          </p>
        ) : null}

        {state.kind === "error" ? (
          <div role="alert" className="flex items-start gap-3 rounded-lg border border-warning-foreground/30 bg-warning p-4 text-[17px]">
            {state.expired ? (
              <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
            ) : (
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            )}
            <p>{state.message}</p>
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <>
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <MapPin className="size-5 text-primary" aria-hidden />
                Accidentul
              </h2>
              <div className="space-y-1 rounded-lg border bg-card p-4 text-[17px]">
                <p>{state.info.address}</p>
                <p className="text-muted-foreground">{formatWhen(state.info.occurredAt)}</p>
              </div>
            </section>
            <ul className="space-y-2 text-[17px]">
              <li>Aveți nevoie de talon, poliță RCA și permis.</li>
              <li>Veți bifa ce făcea mașina dumneavoastră și unde a fost lovită.</li>
            </ul>
            <Button variant="cta" size="xl" className="w-full" nativeButton={false} render={<Link href={`${basePath}/acte`} />}>
              Începeți
              <ArrowRight aria-hidden />
            </Button>
          </>
        ) : null}
      </main>
    </div>
  );
}
