import { Phone } from "lucide-react";
import { attachCall, ignoreCall } from "@/app/broker/actions";
import { callDuration, callTurns, type CallCandidate, type CallRow } from "@/lib/broker/calls";
import { Button } from "@/components/ui/button";

const TZ = "Europe/Bucharest";
const when = (iso: string) =>
  new Date(iso).toLocaleString("ro-RO", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/**
 * Apelurile vocale ale dosarului: cele legate (după codul spus în apel sau de broker) și cele de legat.
 * Apelantul nu și-a verificat identitatea, deci apelurile sunt marcate „sursă neverificată”: informația se adaugă în dosar,
 * dar nu se întoarce nimic spre apelant din dosar.
 */
export function ClaimCalls({ claimId, linked, candidates }: { claimId: string; linked: CallRow[]; candidates: CallCandidate[] }) {
  if (linked.length === 0 && candidates.length === 0) return null;
  return (
    <section aria-labelledby="apeluri" className="border-b border-border py-3.5">
      <h2 id="apeluri" className="flex items-center gap-1.5 text-[14px] font-semibold">
        <Phone aria-hidden className="size-4" /> Apeluri telefonice
      </h2>

      {linked.length > 0 && (
        <ul className="mt-2 space-y-2">
          {linked.map((c) => (
            <li key={c.id}>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium">{when(c.created_at)}</span>
                {callDuration(c) && <span className="text-muted-foreground">{callDuration(c)}</span>}
                <span
                  className="rounded bg-tone-neutral px-1.5 py-px text-[11px] font-semibold text-tone-neutral-foreground"
                  title="Apelantul nu și-a verificat identitatea; informația e doar orientativă."
                >
                  sursă neverificată
                </span>
              </p>
              {c.summary ? <p className="mt-0.5 text-muted-foreground">{c.summary}</p> : <p className="mt-0.5 text-muted-foreground">Apelul nu s-a încheiat încă sau rezumatul nu a ajuns.</p>}
              <Transcript call={c} />
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <div className={linked.length > 0 ? "mt-3.5 border-t border-border pt-3" : "mt-2"}>
          <h3 className="font-medium">Apeluri de legat</h3>
          <p className="text-[12px] text-muted-foreground">Apeluri nelegate care pomenesc acest dosar sau strada accidentului. Atașați-le doar dacă vorbesc despre el; celelalte apeluri sunt în pagina Apeluri.</p>
          <ul className="mt-1.5 space-y-2.5">
            {candidates.map(({ call, reason }) => (
              <li key={call.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
                <div className="min-w-0 flex-1 basis-72">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium">{when(call.created_at)}</span>
                    {callDuration(call) && <span className="text-muted-foreground">{callDuration(call)}</span>}
                    {reason && (
                      <span className="rounded bg-tone-info px-1.5 py-px text-[11px] font-semibold text-tone-info-foreground">
                        {reason === "code" ? "pomenește acest dosar" : "pomenește același loc"}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">{call.summary}</p>
                  <Transcript call={call} />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <form action={attachCall.bind(null, claimId, call.id)}>
                    <Button type="submit" variant="outline" className="h-8 px-3 text-[13px]">
                      Atașează
                    </Button>
                  </form>
                  <form action={ignoreCall.bind(null, call.id)}>
                    <Button type="submit" variant="ghost" className="h-8 px-3 text-[13px] text-muted-foreground">
                      Nu ține de niciun dosar
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function Transcript({ call }: { call: Pick<CallRow, "transcript"> }) {
  const turns = callTurns(call);
  if (turns.length === 0) return null;
  return (
    <details className="mt-1 text-[12px]">
      <summary className="cursor-pointer text-muted-foreground underline-offset-2 hover:underline">Transcriptul apelului</summary>
      <ol className="mt-1 space-y-0.5">
        {turns.map((t, i) => (
          <li key={i}>
            <span className="font-medium">{t.who === "client" ? "Client" : "Asistent"}:</span> {t.text}
          </li>
        ))}
      </ol>
    </details>
  );
}
