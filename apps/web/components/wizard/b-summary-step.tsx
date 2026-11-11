"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CarFront, CheckCircle2, FileText, ListChecks, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BROADCAST_B_SUBMITTED, submissionProblem } from "@/lib/amiabila/claim";
import { CIRCUMSTANCES, DISCLAIMER, IMPACT_LABELS } from "@/lib/amiabila/content";
import { fieldValue } from "@/lib/amiabila/documents";
import { signalClaim } from "@/lib/claims/realtime";
import { StepFrame } from "./step-frame";
import { useWizard } from "./wizard-context";

type Phase = { state: "idle" } | { state: "sending" } | { state: "error"; message: string } | { state: "sent" };

const editLink =
  "inline-flex min-h-11 items-center text-[15px] font-medium text-primary underline-offset-4 hover:underline";

/** Verificarea finală a lui B și trimiterea către dosar. Se poate retrimite cât timp linkul e valabil. */
export function BSummaryStep() {
  const { draft, basePath } = useWizard();
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>({ state: "idle" });
  const { documents, circumstances } = draft;
  const checked = CIRCUMSTANCES.filter((c) => circumstances.checked.includes(c.n));
  const problem = submissionProblem({ documents, circumstances });

  async function send() {
    setPhase({ state: "sending" });
    try {
      const res = await fetch(`/api/claims/join/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documents, circumstances }),
      });
      const json = (await res.json().catch(() => ({}))) as { claimId?: string; error?: string };
      if (res.ok && json.claimId) {
        void signalClaim(json.claimId, BROADCAST_B_SUBMITTED);
        setPhase({ state: "sent" });
      } else {
        setPhase({ state: "error", message: json.error ?? "Nu am putut trimite datele. Încercați din nou." });
      }
    } catch {
      setPhase({ state: "error", message: "Nu am putut trimite datele. Verificați conexiunea și încercați din nou." });
    }
  }

  if (phase.state === "sent") {
    return (
      <StepFrame slug="rezumat" heading="Datele au fost trimise" lead="Celălalt șofer le vede acum. Mai urmează semnăturile." continueLabel={null}>
        <div role="status" className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4 text-[17px]">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
          <p>Mulțumim. Nu mai aveți nimic de completat aici.</p>
        </div>
        <Button variant="ghost" className="h-12 w-full text-base" onClick={() => setPhase({ state: "idle" })}>
          Vreau să corectez ceva
        </Button>
      </StepFrame>
    );
  }

  return (
    <StepFrame
      slug="rezumat"
      heading="Verificați și trimiteți"
      lead="Dacă ceva nu e corect, vă întoarceți la pasul respectiv."
      continueLabel={null}
      footnote={DISCLAIMER}
    >
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="size-5 text-primary" aria-hidden />
          Acte
        </h2>
        <div className="space-y-1 rounded-lg border bg-card p-4 text-[17px]">
          <p>
            {fieldValue(documents.registration, "plate") || "Număr lipsă"}, {fieldValue(documents.registration, "make")}{" "}
            {fieldValue(documents.registration, "model")}
          </p>
          <p>{fieldValue(documents.license, "fullName") || "Permis necompletat"}</p>
          <p className="text-muted-foreground">{fieldValue(documents.policy, "insurer") || "Poliță necompletată"}</p>
        </div>
        <Link href={`${basePath}/acte`} className={editLink}>
          Modifică actele
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ListChecks className="size-5 text-primary" aria-hidden />
          Circumstanțe
        </h2>
        <ul className="space-y-1 rounded-lg border bg-card p-4 text-[17px]">
          {checked.length === 0 ? (
            <li className="text-muted-foreground">Nimic bifat</li>
          ) : (
            checked.map((c) => (
              <li key={c.n}>
                <span className="font-semibold">{c.n}.</span> {c.label}
              </li>
            ))
          )}
        </ul>
        <Link href={`${basePath}/circumstante`} className={editLink}>
          Modifică circumstanțele
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CarFront className="size-5 text-primary" aria-hidden />
          Impact și daune
        </h2>
        <div className="space-y-1 rounded-lg border bg-card p-4 text-[17px]">
          <p>{circumstances.impact ? IMPACT_LABELS[circumstances.impact] : "Zona nu e aleasă"}</p>
          {circumstances.damage ? <p>{circumstances.damage}</p> : null}
          {circumstances.notes ? <p className="text-muted-foreground">{circumstances.notes}</p> : null}
        </div>
        <Link href={`${basePath}/impact`} className={editLink}>
          Modifică impactul
        </Link>
      </section>

      {problem ? (
        <p role="status" className="text-[15px] text-muted-foreground">
          {problem}
        </p>
      ) : null}
      {phase.state === "error" ? (
        <p role="alert" className="text-[15px] text-destructive">
          {phase.message}
        </p>
      ) : null}
      <Button variant="cta" size="xl" className="w-full" disabled={problem !== null || phase.state === "sending"} onClick={send}>
        {phase.state === "sending" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Trimite datele
      </Button>
    </StepFrame>
  );
}
