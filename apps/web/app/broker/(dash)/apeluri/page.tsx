import type { Metadata } from "next";
import Link from "next/link";
import { attachCallFromList, ignoreCall } from "@/app/broker/actions";
import { Transcript } from "@/components/broker/claim-calls";
import { Button } from "@/components/ui/button";
import { callDuration, type CallRow } from "@/lib/broker/calls";
import { requireBroker } from "@/lib/broker/session";

export const metadata: Metadata = { title: "Apeluri · BrokerPilot" };

const TZ = "Europe/Bucharest";
const LIMIT = 100;
const when = (iso: string) =>
  new Date(iso).toLocaleString("ro-RO", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

type CallListRow = CallRow & { claim_id: string | null; claim_ignored_at: string | null; claims: { public_ref: string } | null };

/** Toate apelurile vocale (cele mai noi primele), cu dosarul de care țin. Legarea se face din fișa dosarului. */
export default async function CallsPage() {
  const { db } = await requireBroker();
  // Dosarele la care se poate atașa un apel: cele trimise sau în lucru, cele mai noi primele.
  const claimsRes = await db
    .from("claims")
    .select("id, public_ref, location_text, created_at")
    .in("status", ["awaiting_b", "signed", "submitted", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(30);
  const openClaims = (claimsRes.data ?? []) as { id: string; public_ref: string; location_text: string | null; created_at: string }[];

  const { data, error } = await db
    .from("conversations")
    .select("id, created_at, summary, transcript, claim_id, claim_ignored_at, claims(public_ref)")
    .eq("channel", "voice")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  const calls = (data ?? []) as unknown as CallListRow[];
  // Apelurile fără rezumat nici n-au ajuns la sfârșit (început și închis imediat): nu spun nimic brokerului.
  const shown = calls.filter((c) => c.summary || c.claim_id);
  const unlinked = shown.filter((c) => !c.claim_id && !c.claim_ignored_at).length;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-card">
      <section aria-labelledby="titlu" className="text-[13px]">
        <header className="border-b border-border px-5 py-3">
          <h1 id="titlu" className="text-[20px] leading-tight font-semibold">
            Apeluri
          </h1>
          <p className="mt-0.5 text-muted-foreground">
            Apelurile primite de asistentul vocal, cele mai noi primele.
            {shown.length > 0 && (
              <>
                {" "}
                <span className="font-medium text-foreground">
                  {shown.length} {shown.length === 1 ? "apel" : "apeluri"}
                  {unlinked > 0 && `, ${unlinked} nelegate de un dosar`}.
                </span>
              </>
            )}{" "}
            Apelantul nu e verificat, deci conținutul e orientativ. Un apel care pomenește codul sau strada unui dosar apare și în fișa lui, de unde îl atașați; pe celelalte le atașați de aici.
          </p>
        </header>

        {error ? (
          <p role="alert" className="px-5 py-3 text-destructive">
            Nu am putut încărca apelurile. Reîncărcați pagina.
          </p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-6 text-muted-foreground">Niciun apel încă. Apar aici după ce se încheie.</p>
        ) : (
          <ul>
            {shown.map((c) => (
              <li key={c.id} className="border-b border-border px-5 py-3 last:border-b-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{when(c.created_at)}</span>
                  {callDuration(c) && <span className="text-muted-foreground">{callDuration(c)}</span>}
                  {c.claims ? (
                    <Link
                      href={`/broker/dosare/${c.claim_id}`}
                      className="rounded bg-tone-ok px-1.5 py-px text-[11px] font-semibold text-tone-ok-foreground hover:underline"
                    >
                      {c.claims.public_ref}
                    </Link>
                  ) : c.claim_ignored_at ? (
                    <span className="rounded bg-tone-neutral px-1.5 py-px text-[11px] font-semibold text-tone-neutral-foreground">fără dosar</span>
                  ) : (
                    <span className="rounded bg-tone-todo px-1.5 py-px text-[11px] font-semibold text-tone-todo-foreground">nelegat</span>
                  )}
                  <span className="rounded bg-tone-neutral px-1.5 py-px text-[11px] font-semibold text-tone-neutral-foreground">sursă neverificată</span>
                </p>
                <p className="mt-0.5 text-muted-foreground">{c.summary ?? "Rezumatul apelului nu a ajuns."}</p>
                <Transcript call={c} />
                {!c.claim_id && !c.claim_ignored_at && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <form action={attachCallFromList} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="call" value={c.id} />
                      <label className="sr-only" htmlFor={`dosar-${c.id}`}>
                        Dosarul la care se atașează apelul
                      </label>
                      <select
                        id={`dosar-${c.id}`}
                        name="claim"
                        required
                        defaultValue=""
                        className="h-8 max-w-[18rem] rounded-md border border-border bg-card px-2 text-[13px]"
                      >
                        <option value="" disabled>
                          Alegeți dosarul…
                        </option>
                        {openClaims.map((cl) => (
                          <option key={cl.id} value={cl.id}>
                            {cl.public_ref}
                            {cl.location_text ? `, ${cl.location_text}` : ""}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" variant="outline" className="h-8 px-3 text-[13px]">
                        Atașează
                      </Button>
                    </form>
                    <form action={ignoreCall.bind(null, c.id)}>
                      <Button type="submit" variant="ghost" className="h-8 px-3 text-[13px] text-muted-foreground">
                        Nu ține de niciun dosar
                      </Button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
