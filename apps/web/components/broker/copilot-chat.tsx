"use client";

import { ExternalLink, MessageSquareText, RotateCcw, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { citeLabel } from "@/lib/kb/cite";
import type { CopilotAnswer, KbSource } from "@/lib/kb/copilot";
import { cn } from "@/lib/utils";

type Message =
  | { id: number; role: "user"; text: string; redacted?: boolean }
  | { id: number; role: "assistant"; text: string; found: boolean; sources: KbSource[]; error?: boolean };

const SUGGESTIONS = [
  "Ce acoperă RCA și ce nu acoperă?",
  "Ce documente trebuie pentru o daună RCA?",
  "Ce face clientul dacă celălalt șofer nu vrea să semneze amiabila?",
];

let nextId = 1;

/**
 * Copilotul brokerului: bulă jos-dreapta pe toate paginile `/broker`, panou plutitor cu conversația.
 * Stă în layout, deci conversația rămâne când brokerul schimbă pagina. Răspunsurile vin doar din documente, cu citări
 * care se desfac la clic (fragmentul și linkul spre document).
 */
export function CopilotChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  const close = () => {
    setOpen(false);
    bubbleRef.current?.focus();
  };

  async function ask(question: string) {
    const q = question.trim();
    if (q.length < 3 || pending) return;
    const history = messages
      .filter((m) => !(m.role === "assistant" && m.error))
      .slice(-4)
      .map((m) => ({ role: m.role, content: m.text }));
    const userMsg: Message = { id: nextId++, role: "user", text: q };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setPending(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const data = (await res.json().catch(() => null)) as (CopilotAnswer & { error?: string }) | null;
      if (!res.ok || !data || typeof data.text !== "string") {
        const error = data?.error ?? "Căutarea în documente nu răspunde acum. Încercați din nou peste puțin timp.";
        setMessages((prev) => [...prev, { id: nextId++, role: "assistant", text: error, found: false, sources: [], error: true }]);
        return;
      }
      setMessages((prev) => [
        ...prev.map((m) => (m.id === userMsg.id ? { ...m, redacted: data.redacted } : m)),
        { id: nextId++, role: "assistant", text: data.text, found: data.found, sources: data.sources },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: "assistant", text: "Nu am putut trimite întrebarea. Verificați conexiunea și încercați din nou.", found: false, sources: [], error: true },
      ]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Copilot: întrebări despre documente"
          onKeyDown={(e) => e.key === "Escape" && close()}
          className="fixed right-4 bottom-20 z-40 flex h-[min(600px,calc(100dvh-7rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        >
          <header className="flex shrink-0 items-start justify-between gap-2 bg-navy px-3 py-2 text-navy-foreground">
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold">Copilot</h2>
              <p className="text-[12px] text-navy-muted">Răspunde doar din documentele agenției, cu sursa.</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  disabled={pending}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-navy-muted hover:bg-white/10 hover:text-navy-foreground disabled:opacity-50"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Conversație nouă
                </button>
              )}
              <button type="button" onClick={close} aria-label="Închide copilotul" className="rounded p-1 hover:bg-white/10">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-[13px] leading-relaxed" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Întrebați despre condițiile de poliță, procedurile de daună sau documentele interne. Dacă informația nu e în documente, copilotul o spune.
                </p>
                <ul className="space-y-1">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => ask(s)}
                        className="w-full rounded-lg border border-border px-2.5 py-1.5 text-left hover:bg-tone-info"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} msg={m} /> : <AssistantBubble key={m.id} msg={m} />))}
            {pending && <p className="text-muted-foreground">Caut în documente…</p>}
            <div ref={endRef} />
          </div>

          <form
            className="shrink-0 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(draft);
                  }
                }}
                maxLength={600}
                rows={1}
                placeholder="Scrieți întrebarea…"
                aria-label="Întrebarea pentru copilot"
                className="max-h-28 min-h-9 resize-none text-[13px] md:text-[13px]"
              />
              <Button type="submit" disabled={pending || draft.trim().length < 3} className="h-9 shrink-0">
                <SendHorizontal aria-hidden />
                Trimite
              </Button>
            </div>
          </form>
        </section>
      )}

      <button
        ref={bubbleRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className="fixed right-4 bottom-4 z-40 flex h-12 items-center gap-2 rounded-full bg-navy px-4 text-[13px] font-semibold text-navy-foreground shadow-lg hover:bg-navy/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {open ? <X className="size-4" aria-hidden /> : <MessageSquareText className="size-4" aria-hidden />}
        {open ? "Închide" : "Întreabă documentele"}
      </button>
    </>
  );
}

function UserBubble({ msg }: { msg: Extract<Message, { role: "user" }> }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <p className="max-w-[85%] rounded-lg bg-tone-info px-2.5 py-1.5 whitespace-pre-wrap text-tone-info-foreground">{msg.text}</p>
      {msg.redacted && <p className="text-[12px] text-muted-foreground">Am ascuns datele personale înainte să trimit întrebarea la AI.</p>}
    </div>
  );
}

function AssistantBubble({ msg }: { msg: Extract<Message, { role: "assistant" }> }) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  // Mai multe fragmente de pe aceeași pagină au aceeași citare: un singur buton, cu toate fragmentele.
  const groups = new Map<string, KbSource[]>();
  for (const s of msg.sources) groups.set(citeLabel(s), [...(groups.get(citeLabel(s)) ?? []), s]);
  const shown = openLabel ? groups.get(openLabel) : undefined;
  const first = shown?.[0];
  return (
    <div className="space-y-1.5">
      <p className={cn("whitespace-pre-wrap", !msg.found && "text-muted-foreground", msg.error && "text-tone-danger-foreground")}>{msg.text}</p>
      {groups.size > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Surse">
          {[...groups.keys()].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setOpenLabel((cur) => (cur === label ? null : label))}
              aria-expanded={openLabel === label}
              className={cn(
                "min-h-6 rounded border border-border px-1.5 text-left text-[12px] text-tone-info-foreground hover:bg-tone-info",
                openLabel === label && "bg-tone-info font-medium",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {shown && first && (
        <div className="space-y-1 border-l-2 border-driver-a pl-2.5 text-[12px]">
          <p className="font-medium">
            {first.title}
            {first.page ? `, pagina ${first.page}` : ""}
            {first.collection === "internal" ? " (intern)" : ""}
          </p>
          {shown.map((s) => (
            <div key={s.n}>
              {s.heading && <p className="text-muted-foreground">{s.heading}</p>}
              <p className="whitespace-pre-wrap text-muted-foreground">
                {s.snippet}
                {s.snippet.length >= 500 ? "…" : ""}
              </p>
            </div>
          ))}
          {first.url?.startsWith("https://") && (
            <a href={first.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-tone-info-foreground underline">
              <ExternalLink className="size-3" aria-hidden />
              Deschide documentul
            </a>
          )}
        </div>
      )}
    </div>
  );
}
