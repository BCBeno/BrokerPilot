"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Mic, PhoneOff } from "lucide-react";
import type Vapi from "@vapi-ai/web";
import { Button } from "@/components/ui/button";
import { applyVoiceHandoff, voiceLandingStep, type VoiceHandoff } from "@/lib/amiabila/voice-handoff";
import { A_DRAFT_KEY, getDraftStore } from "@/lib/amiabila/draft-store";

type Phase = "idle" | "connecting" | "live" | "error";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
const ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

type CallMessage = { type?: string; transcriptType?: string; role?: string; transcript?: string; toolCallList?: unknown[]; toolCalls?: unknown[] };

/** Unelte chemate într-un mesaj Vapi `tool-calls`; argumentele pot veni ca obiect sau ca JSON text. */
function toolCallsOf(m: CallMessage): { name: string; args: Record<string, unknown> }[] {
  if (!m.type?.startsWith("tool-calls")) return [];
  return (m.toolCallList ?? m.toolCalls ?? []).flatMap((t) => {
    const f = (t as { function?: { name?: string; arguments?: unknown } }).function;
    if (!f?.name) return [];
    let args: unknown = f.arguments;
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    return [{ name: f.name, args: (args && typeof args === "object" ? args : {}) as Record<string, unknown> }];
  });
}

function describe(e: unknown): string {
  const x = e as { message?: string; error?: { message?: string; msg?: string }; errorMsg?: string; name?: string };
  return String(x?.error?.message ?? x?.error?.msg ?? x?.errorMsg ?? x?.message ?? x?.name ?? "eroare necunoscută").slice(0, 160);
}

/** Apel vocal cu asistentul Ana, direct din browser (Vapi Web SDK). Uneltele rulează în WF02, raportul de final în WF03. */
export function CallButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [line, setLine] = useState("");
  const [detail, setDetail] = useState("");
  const [claimStarted, setClaimStarted] = useState(false);
  const vapi = useRef<Vapi | null>(null);
  const handoff = useRef<VoiceHandoff>({});
  const router = useRouter();

  useEffect(() => () => void vapi.current?.stop(), []);

  const start = useCallback(async () => {
    if (!PUBLIC_KEY || !ASSISTANT_ID) return;
    setPhase("connecting");
    setLine("");
    setDetail("");
    setClaimStarted(false);
    handoff.current = {};
    try {
      const { default: VapiClient } = await import("@vapi-ai/web");
      const client = new VapiClient(PUBLIC_KEY);
      vapi.current = client;
      client.on("call-start", () => setPhase("live"));
      client.on("call-end", () => {
        setPhase("idle");
        vapi.current = null;
      });
      client.on("error", (e: unknown) => {
        console.error("Vapi error", e);
        setDetail(describe(e));
        setPhase("error");
      });
      client.on("message", (m: CallMessage) => {
        // Datele din apel: argumentele uneltelor chemate de asistent (eligibilitate, apoi începerea dosarului).
        for (const t of toolCallsOf(m)) {
          if (t.name === "check_eligibility") handoff.current.eligibility = t.args;
          if (t.name === "start_claim") {
            handoff.current.claim = t.args;
            setClaimStarted(true);
          }
        }
        if (m.type === "transcript" && m.transcriptType === "final" && m.transcript) {
          setLine(m.transcript);
        }
      });
      await client.start(ASSISTANT_ID);
    } catch (e) {
      console.error("Vapi start failed", e);
      setDetail(describe(e));
      setPhase("error");
    }
  }, []);

  const continueInApp = useCallback(() => {
    const store = getDraftStore(A_DRAFT_KEY);
    store.update((d) => applyVoiceHandoff(d, handoff.current));
    void vapi.current?.stop();
    router.push(`/amiabila/${voiceLandingStep(store.read())}`);
  }, [router]);

  const stop = useCallback(() => void vapi.current?.stop(), []);

  if (!PUBLIC_KEY || !ASSISTANT_ID) return null;

  return (
    <div className="mt-4">
      {phase === "live" || phase === "connecting" ? (
        <Button variant="outline" size="xl" className="w-full" onClick={stop}>
          <PhoneOff aria-hidden />
          {phase === "connecting" ? "Se conectează…" : "Închide apelul"}
        </Button>
      ) : (
        <Button variant="outline" size="xl" className="w-full" onClick={start}>
          <Mic aria-hidden />
          Sună asistentul
        </Button>
      )}
      <p className="mt-2 text-[15px] text-muted-foreground" aria-live="polite">
        {phase === "error"
          ? `Nu am putut porni apelul. Verificați microfonul și încercați din nou.${detail ? ` (${detail})` : ""}`
          : phase === "live"
            ? line || "Vorbiți, vă ascult."
            : "Veți vorbi cu Ana, un asistent AI. Aveți nevoie de microfon."}
      </p>
      {claimStarted ? (
        <Button variant="cta" size="xl" className="mt-3 w-full" onClick={continueInApp}>
          Continuă cu datele din apel
          <ArrowRight aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
