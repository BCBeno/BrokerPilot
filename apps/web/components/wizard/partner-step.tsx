"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Clock, LoaderCircle, QrCode, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BROADCAST_B_JOINED, BROADCAST_B_SUBMITTED, type ClaimStatus } from "@/lib/amiabila/claim";
import { canContinue, draftSchema } from "@/lib/amiabila/draft";
import { updateDraft, useDraft } from "@/lib/amiabila/draft-store";
import { listenToClaim } from "@/lib/claims/realtime";
import { StepFrame } from "./step-frame";

type Claim = NonNullable<ReturnType<typeof useDraft>["claim"]>;

const POLL_MS = 5000;

const setClaim = (claim: Claim | null) => updateDraft((d) => ({ ...d, claim }));
const joinUrl = (token: string) => `${window.location.origin}/b/${token}`;

function useCountdown(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return expiresAt ? Math.max(0, new Date(expiresAt).getTime() - now) : null;
}

function formatLeft(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function Qr({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [url]);
  if (!svg) return <div className="mx-auto size-56 animate-pulse rounded-lg bg-muted" aria-hidden />;
  return (
    <div
      role="img"
      aria-label="Cod QR pentru șoferul B"
      className="mx-auto size-56 overflow-hidden rounded-lg border bg-white p-2 [&>svg]:size-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function PartnerStep() {
  const draft = useDraft();
  const claim = draft.claim;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [joined, setJoined] = useState(false);
  const [copied, setCopied] = useState(false);

  const expiresAt = claim?.joinExpiresAt ?? null;
  const left = useCountdown(expiresAt);
  const submitted = status?.bSubmitted === true;
  const expired = claim !== null && !submitted && left === 0;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { documents, eligibility, place } = draft;
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documents, eligibility, place: { ...place, occurredAt: place.occurredAt ?? new Date().toISOString() } }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      const parsed = draftSchema.shape.claim.safeParse(json);
      if (res.ok && parsed.success && parsed.data) setClaim(parsed.data);
      else setError((json as { error?: string }).error ?? "Nu am putut crea invitația. Încercați din nou.");
    } catch {
      setError("Nu am putut crea invitația. Verificați conexiunea și încercați din nou.");
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    if (!claim) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claim.id}/invite`, { method: "POST", headers: { "x-claim-token": claim.aToken } });
      const json = (await res.json().catch(() => ({}))) as { joinToken?: string; joinExpiresAt?: string; error?: string };
      if (res.ok && json.joinToken && json.joinExpiresAt) {
        setClaim({ ...claim, joinToken: json.joinToken, joinExpiresAt: json.joinExpiresAt });
        setJoined(false);
      } else setError(json.error ?? "Nu am putut genera un link nou.");
    } catch {
      setError("Nu am putut genera un link nou. Verificați conexiunea.");
    } finally {
      setBusy(false);
    }
  }

  const refresh = useCallback(async () => {
    if (!claim) return;
    try {
      const res = await fetch(`/api/claims/${claim.id}`, { headers: { "x-claim-token": claim.aToken }, cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as ClaimStatus);
    } catch {
      /* următoarea interogare încearcă din nou */
    }
  }, [claim]);

  const claimId = claim?.id;
  useEffect(() => {
    if (!claimId) return;
    const first = setTimeout(refresh, 0);
    const poll = setInterval(refresh, POLL_MS);
    const stop = listenToClaim(claimId, [BROADCAST_B_JOINED, BROADCAST_B_SUBMITTED], (event) => {
      if (event === BROADCAST_B_JOINED) setJoined(true);
      void refresh();
    });
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      stop();
    };
  }, [claimId, refresh]);

  async function share(url: string) {
    try {
      if (navigator.share) await navigator.share({ title: "Amiabilă digitală", text: "Completați datele dumneavoastră pentru amiabilă:", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      /* partajare anulată */
    }
  }

  const url = claim && typeof window !== "undefined" ? joinUrl(claim.joinToken) : null;

  return (
    <StepFrame
      slug="sofer-b"
      heading="Invitați șoferul B"
      lead="Celălalt șofer își completează actele și circumstanțele pe telefonul lui. Voi continuați în paralel."
      canContinue={canContinue("sofer-b", draft, new Date())}
      disabledHint="Generați codul pentru șoferul B ca să continuați."
      continueLabel={submitted ? "Continuă" : "Continuă, B completează în paralel"}
    >
      {!claim ? (
        <div className="space-y-3">
          <p className="text-[17px]">
            Vom crea dosarul și un cod QR valabil 2 ore. Șoferul B îl scanează cu telefonul lui, fără cont și fără aplicație.
          </p>
          <Button variant="cta" size="xl" className="w-full" disabled={busy} onClick={create}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <QrCode aria-hidden />}
            Generează codul QR
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {submitted ? (
            <div role="status" className="flex items-center gap-2.5 rounded-lg border border-success/40 bg-success/10 p-4 text-[17px] font-medium text-success">
              <CheckCircle2 className="size-6 shrink-0" aria-hidden />
              Șoferul B a trimis datele lui.
            </div>
          ) : (
            <>
              {url && !expired ? <Qr url={url} /> : null}
              <p role="status" className="flex items-center justify-center gap-2 text-center text-[17px]">
                {expired ? (
                  <>
                    <Clock className="size-5 text-warning-foreground" aria-hidden />
                    Linkul a expirat.
                  </>
                ) : joined ? (
                  <>
                    <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden />
                    Șoferul B a deschis linkul și completează.
                  </>
                ) : (
                  <>
                    <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden />
                    Așteptăm șoferul B…
                  </>
                )}
              </p>
              {!expired && left !== null ? (
                <p className="text-center text-[15px] text-muted-foreground">Valabil încă {formatLeft(left)}.</p>
              ) : null}
              {expired ? (
                <Button variant="cta" size="xl" className="w-full" disabled={busy} onClick={renew}>
                  <RefreshCw aria-hidden />
                  Generează un link nou
                </Button>
              ) : url ? (
                <Button type="button" variant="outline" size="xl" className="w-full" onClick={() => share(url)}>
                  <Share2 aria-hidden />
                  {copied ? "Link copiat" : "Trimite linkul"}
                </Button>
              ) : null}
            </>
          )}
          <p className="text-[15px] text-muted-foreground">
            Dosar {claim.ref}.{submitted ? "" : " Puteți continua; vă anunțăm aici când B a terminat."}
          </p>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-[15px] text-destructive">
          {error}
        </p>
      ) : null}
    </StepFrame>
  );
}
