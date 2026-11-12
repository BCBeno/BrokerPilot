"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { addPartyToPortfolio } from "@/app/broker/portfolio-actions";

/**
 * Pentru un șofer care nu e client: îl adaugă în portofoliu din datele dosarului (sau îl leagă de un client existent).
 * Cere o confirmare scurtă, pentru că se salvează date personale noi.
 */
export function AddToPortfolio({ claimId, role, name }: { claimId: string; role: "A" | "B"; name: string | null }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ clientId: string; created: boolean } | null>(null);

  if (done) {
    return (
      <span className="text-tone-ok-foreground">
        {done.created ? "Adăugat în portofoliu." : "Legat de clientul existent."}{" "}
        <Link href={`/broker/clienti/${done.clientId}`} className="font-medium underline">
          Deschide fișa
        </Link>
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[12px] font-medium hover:bg-muted"
      >
        <UserPlus aria-hidden className="size-3.5" /> Adaugă în portofoliu
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-tone-info px-2 py-1 text-[12px] text-tone-info-foreground">
      <span>
        Salvez {name ?? `șoferul ${role}`} ca client, cu vehiculul și polița RCA din acte. Fără consimțământ GDPR înregistrat nu îl contactați
        comercial.
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              setDone(await addPartyToPortfolio(claimId, role));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Nu s-a salvat. Încercați din nou.");
            }
          });
        }}
        className="h-6 rounded bg-navy px-2 font-medium text-navy-foreground disabled:opacity-60"
      >
        {pending ? "Se salvează…" : "Adaugă"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="h-6 rounded px-2 font-medium hover:underline">
        Renunță
      </button>
      {error && (
        <span role="alert" className="w-full text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
