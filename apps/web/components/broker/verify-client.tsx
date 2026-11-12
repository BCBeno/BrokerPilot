"use client";

import { useState, useTransition } from "react";
import { verifyClient } from "@/app/broker/actions";

/** Client adăugat automat din dosar (acord de contact + poliță scanată): datele sunt scrise de o persoană neverificată. */
export function VerifyClient({ clientId }: { clientId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="rounded bg-tone-todo px-1.5 py-px text-[12px] font-semibold text-tone-todo-foreground">De verificat</span>
      <span className="text-muted-foreground">Adăugat automat din dosar, cu datele introduse de client. Confirmați-le după ce sunați sau vedeți polița.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              await verifyClient(clientId);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Nu am putut salva.");
            }
          })
        }
        className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2 text-[12px] font-medium hover:bg-muted disabled:opacity-60"
      >
        {pending ? "Se salvează…" : "Marchează ca verificat"}
      </button>
      {error && <span role="alert" className="text-destructive">{error}</span>}
    </div>
  );
}
