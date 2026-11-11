"use client";

import { useEffect, useMemo, useState } from "react";
import type { PartyBResponse } from "@/lib/amiabila/claim";
import { useDraft, useHydrated } from "@/lib/amiabila/draft-store";
import { buildForm, type PartyInput } from "@/lib/amiabila/form";
import { DocumentView } from "./document-view";

/** Formularul completat cu ce a răspuns șoferul A în wizard și, dacă B a trimis, cu datele lui B (aduse de pe server). */
export function DraftDocument() {
  const draft = useDraft();
  const hydrated = useHydrated();
  const claim = draft.claim;
  const [partyB, setPartyB] = useState<PartyInput | null>(null);

  const claimId = claim?.id;
  const aToken = claim?.aToken;
  useEffect(() => {
    if (!claimId || !aToken) return;
    let live = true;
    fetch(`/api/claims/${claimId}/party-b`, { headers: { "x-claim-token": aToken }, cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<PartyBResponse>) : null))
      .then((body) => {
        if (live && body?.submitted) setPartyB({ documents: body.documents, circumstances: body.circumstances });
      })
      .catch(() => {
        /* rămâne coloana B goală; reîncărcarea încearcă din nou */
      });
    return () => {
      live = false;
    };
  }, [claimId, aToken]);

  const form = useMemo(() => buildForm(draft, partyB), [draft, partyB]);
  if (!hydrated) return null;
  return (
    <DocumentView
      form={form}
      backHref="/amiabila/rezumat"
      notice={
        partyB
          ? "Documentul are datele lui A și B. Martorii, schița pe server și semnăturile se adaugă în pașii următori."
          : claim
            ? "Șoferul B nu a trimis încă datele lui, așa că coloana lui rămâne goală. Reîncărcați pagina după ce a trimis."
            : "Documentul are datele completate până acum. Coloana vehiculului B, martorii, schița și semnăturile se adaugă în pașii următori."
      }
    />
  );
}
