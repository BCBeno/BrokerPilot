"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, FileText, LoaderCircle, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BROADCAST_B_SIGNED, BROADCAST_B_SUBMITTED, type ClaimStatus } from "@/lib/amiabila/claim";
import { getPartyState, putSignature } from "@/lib/claims/client";
import { listenToClaim, signalClaim } from "@/lib/claims/realtime";
import type { FinalizeResponse } from "@/app/api/claims/[id]/finalize/route";
import { SignaturePad } from "./signature-pad";
import { StepFrame } from "./step-frame";
import { useWizard } from "./wizard-context";

const POLL_MS = 5000;

type Status = {
  /** A: B a trimis datele. B: datele lui au fost trimise. */
  submitted: boolean;
  signed: boolean;
  /** Doar la A: B a semnat. */
  otherSigned: boolean;
  finalized: boolean;
};

/** Starea semnării, citită de pe server (A și B au rute diferite) și reîmprospătată la semnal sau la 5 secunde. */
function useStatus(role: "A" | "B", token: string | null, claimId: string | null) {
  const [status, setStatus] = useState<Status | null>(null);
  const [claimIdB, setClaimIdB] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      if (role === "A" && claimId) {
        const res = await fetch(`/api/claims/${claimId}`, { headers: { "x-claim-token": token }, cache: "no-store" });
        if (res.ok) {
          const s = (await res.json()) as ClaimStatus;
          setStatus({ submitted: s.bSubmitted, signed: s.signedA, otherSigned: s.signedB, finalized: s.pdfReady });
        }
      } else if (role === "B") {
        const res = await getPartyState(token);
        if (res.ok) {
          setClaimIdB(res.data.claimId);
          setStatus({ submitted: res.data.submitted, signed: res.data.signed, otherSigned: false, finalized: res.data.status === "submitted" });
        }
      }
    } catch {
      /* următoarea interogare încearcă din nou */
    }
  }, [role, token, claimId]);

  const watched = role === "A" ? claimId : claimIdB;
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), POLL_MS);
    const stop = watched ? listenToClaim(watched, [BROADCAST_B_SUBMITTED, BROADCAST_B_SIGNED], () => void refresh()) : () => {};
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      stop();
    };
  }, [refresh, watched]);

  return { status, refresh, claimIdB };
}

const okBox = "flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4 text-[17px]";

/** Semnătura șoferului. B semnează după ce și-a trimis datele; A semnează după B, apoi finalizează dosarul (PDF + anunț către broker). */
export function SignatureStep() {
  const { role, partyToken, draft, basePath } = useWizard();
  const claimId = draft.claim?.id ?? null;
  const { status, refresh, claimIdB } = useStatus(role, partyToken, claimId);
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<FinalizeResponse | null>(null);

  async function sign() {
    if (!partyToken || !png) return;
    setBusy(true);
    setError(null);
    const res = await putSignature(partyToken, png);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (role === "B" && claimIdB) void signalClaim(claimIdB, BROADCAST_B_SIGNED);
    await refresh();
  }

  async function finalize() {
    if (!partyToken || !claimId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claimId}/finalize`, { method: "POST", headers: { "x-claim-token": partyToken } });
      const json = (await res.json().catch(() => ({}))) as Partial<FinalizeResponse> & { error?: string };
      if (res.ok && json.pdfUrl) setDone(json as FinalizeResponse);
      else setError(json.error ?? "Nu am putut finaliza dosarul. Încercați din nou.");
    } catch {
      setError("Nu am putut finaliza dosarul. Verificați conexiunea și încercați din nou.");
    } finally {
      setBusy(false);
    }
  }

  async function openPdf() {
    if (!partyToken || !claimId) return;
    const res = await fetch(`/api/claims/${claimId}/pdf`, { headers: { "x-claim-token": partyToken }, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { url?: string };
    if (res.ok && json.url) window.open(json.url, "_blank", "noopener");
    else setError("Nu am putut deschide documentul. Încercați din nou.");
  }

  const frame = (heading: string, lead: string, children: React.ReactNode) => (
    <StepFrame slug="semnatura" heading={heading} lead={lead} continueLabel={null}>
      {children}
      {error ? (
        <p role="alert" className="text-[15px] text-destructive">
          {error}
        </p>
      ) : null}
    </StepFrame>
  );

  if (!partyToken) {
    return frame(
      "Semnătura",
      "Dosarul se creează la pasul „Șofer B”.",
      <Button variant="cta" size="xl" className="w-full" nativeButton={false} render={<Link href={`${basePath}/sofer-b`} />}>
        Mergeți la pasul „Șofer B”
      </Button>,
    );
  }
  if (!status) {
    return frame(
      "Semnătura",
      "Verificăm dosarul…",
      <p role="status" className="flex items-center gap-2 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-hidden />
        Un moment…
      </p>,
    );
  }

  // ----- A: dosar finalizat
  if (role === "A" && (done || status.finalized)) {
    return frame(
      "Dosarul a fost trimis",
      "Documentul semnat de ambii șoferi e gata.",
      <>
        <div role="status" className={okBox}>
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
          <p>
            {done?.webhook === "sent" ? "Brokerul a fost anunțat și are documentul. " : "Documentul e salvat în dosar. "}
            Păstrați o copie pe telefon.
          </p>
        </div>
        <Button
          variant="cta"
          size="xl"
          className="w-full"
          onClick={() => (done ? window.open(done.pdfUrl, "_blank", "noopener") : void openPdf())}
        >
          <Download aria-hidden />
          Descarcă documentul (PDF)
        </Button>
        <Button variant="outline" size="xl" className="w-full" nativeButton={false} render={<Link href="/amiabila/document" />}>
          <FileText aria-hidden />
          Vezi formularul
        </Button>
      </>,
    );
  }

  // ----- B: după semnare
  if (role === "B" && status.signed) {
    return frame(
      "Ați semnat",
      "Mai are de făcut doar celălalt șofer.",
      <div role="status" className={okBox}>
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
        <p>Mulțumim. Șoferul A finalizează documentul și vi-l poate trimite. Nu mai aveți nimic de completat.</p>
      </div>,
    );
  }

  // ----- A: nu a trimis încă B
  if (role === "A" && !status.submitted) {
    return frame(
      "Semnătura",
      "Semnați după ce a trimis și celălalt șofer datele lui.",
      <p role="status" className="flex items-center gap-2 text-[17px]">
        <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden />
        Așteptăm ca șoferul B să trimită datele…
      </p>,
    );
  }

  // ----- B: nu a trimis încă datele
  if (role === "B" && !status.submitted) {
    return frame(
      "Semnătura",
      "Mai întâi trimiteți datele.",
      <Button variant="cta" size="xl" className="w-full" nativeButton={false} render={<Link href={`${basePath}/rezumat`} />}>
        Mergeți la „Trimite datele”
      </Button>,
    );
  }

  // ----- A semnat, așteaptă semnătura lui B sau finalizează
  if (role === "A" && status.signed) {
    return frame(
      "Finalizați dosarul",
      status.otherSigned ? "Au semnat ambii șoferi." : "Ați semnat. Mai trebuie semnătura șoferului B.",
      <>
        <div role="status" className={okBox}>
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
          <p>Semnătura dumneavoastră e salvată.</p>
        </div>
        {status.otherSigned ? (
          <Button variant="cta" size="xl" className="w-full" disabled={busy} onClick={finalize}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
            {busy ? "Generăm documentul…" : "Finalizează și generează PDF-ul"}
          </Button>
        ) : (
          <p role="status" className="flex items-center gap-2 text-[17px]">
            <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden />
            Așteptăm semnătura șoferului B…
          </p>
        )}
      </>,
    );
  }

  // ----- de semnat (A sau B)
  return frame(
    "Semnătura",
    role === "A" ? "Semnați cu degetul. Documentul va purta semnătura ambilor șoferi." : "Semnați cu degetul în zona de mai jos.",
    <>
      <p className="text-[17px]">
        Prin semnătură confirmați că datele de mai înainte sunt corecte și că sunteți de acord cu împrejurările declarate.
      </p>
      <SignaturePad onChange={setPng} disabled={busy} />
      <Button variant="cta" size="xl" className="w-full" disabled={!png || busy} onClick={sign}>
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <PenLine aria-hidden />}
        Depun semnătura
      </Button>
    </>,
  );
}

