"use client";

import { Check, CircleAlert, Download, FileSearch, ShieldCheck, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Issue, Severity } from "@/lib/verify/checks";
import type { Highlight, VerifyReport } from "@/lib/verify/pipeline";
import { cn } from "@/lib/utils";

type ApiReport = VerifyReport & { fileName: string; pageCount: number };
type Decision = "accepted" | "rejected";

const SEVERITY_LABEL: Record<Severity, string> = { critical: "Eroare", warning: "Atenție", info: "Sugestie" };
const SEVERITY_BADGE: Record<Severity, string> = {
  critical: "bg-tone-danger text-tone-danger-foreground",
  warning: "bg-tone-todo text-tone-todo-foreground",
  info: "bg-tone-info text-tone-info-foreground",
};
const MARK: Record<Severity, string> = {
  critical: "bg-tone-danger text-tone-danger-foreground ring-1 ring-tone-danger-foreground/40",
  warning: "bg-tone-todo text-tone-todo-foreground ring-1 ring-tone-todo-foreground/40",
  info: "bg-tone-info text-tone-info-foreground ring-1 ring-tone-info-foreground/40",
};
const REDACT_LABEL: Record<string, string> = {
  NUME: "nume", CNP: "CNP", TEL: "telefoane", EMAIL: "emailuri", IBAN: "IBAN", PLATE: "plăcuțe", VIN: "VIN", POLITA: "serii de poliță", DATA_NASTERE: "date de naștere",
};

export function reportToText(report: ApiReport, decisions: Partial<Record<string, Decision>>): string {
  const line = (i: Issue) => {
    const d = decisions[i.id];
    return `- [${SEVERITY_LABEL[i.severity]}${i.source === "ai" ? ", sugestie AI" : ", sigur"}${d ? `, ${d === "accepted" ? "acceptată" : "respinsă"}` : ""}] ${i.explanation}${i.suggestedFix ? ` Sugestie: ${i.suggestedFix}` : ""}`;
  };
  const sure = report.issues.filter((i) => i.source === "determinist");
  const ai = report.issues.filter((i) => i.source === "ai");
  return [
    `Raport de verificare: ${report.fileName}`,
    `Verificări sigure (${sure.length}):`,
    ...(sure.length ? sure.map(line) : ["- nicio problemă"]),
    `Sugestii AI (${ai.length}${report.ai.status !== "ok" ? `, pas AI: ${report.ai.status}` : ""}):`,
    ...(ai.length ? ai.map(line) : ["- nicio sugestie"]),
  ].join("\n");
}

/** Textul documentului cu zonele problematice evidențiate; fiecare evidențiere are un id la care sare lista de probleme. */
function HighlightedText({ text, highlights }: { text: string; highlights: Highlight[] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const h of highlights) {
    if (h.start > at) parts.push(text.slice(at, h.start));
    parts.push(
      <mark key={h.issueId} id={`mark-${h.issueId}`} className={cn("rounded px-0.5", MARK[h.severity])}>
        {text.slice(h.start, h.end)}
      </mark>,
    );
    at = h.end;
  }
  parts.push(text.slice(at));
  return <pre className="font-sans text-[13px] leading-relaxed break-words whitespace-pre-wrap">{parts}</pre>;
}

function IssueCard({ issue, hasMark, decision, onDecide }: { issue: Issue; hasMark: boolean; decision?: Decision; onDecide: (d: Decision) => void }) {
  const jump = () => document.getElementById(`mark-${issue.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  return (
    <li className={cn("rounded-md border border-border p-2.5", decision === "rejected" && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded px-1.5 py-px text-[12px] font-medium", SEVERITY_BADGE[issue.severity])}>{SEVERITY_LABEL[issue.severity]}</span>
        <span className="text-[12px] text-muted-foreground">{issue.source === "determinist" ? "verificare sigură" : "sugestie AI"}</span>
        {hasMark && (
          <button type="button" onClick={jump} className="ml-auto text-[12px] text-primary underline underline-offset-2">
            Arată în document
          </button>
        )}
      </div>
      <p className="mt-1">{issue.explanation}</p>
      {issue.suggestedFix && <p className="mt-0.5 text-muted-foreground">Sugestie: {issue.suggestedFix}</p>}
      <div className="mt-1.5 flex gap-1.5">
        <Button type="button" size="sm" variant={decision === "accepted" ? "default" : "outline"} onClick={() => onDecide("accepted")} aria-pressed={decision === "accepted"}>
          <Check aria-hidden /> Acceptă
        </Button>
        <Button type="button" size="sm" variant={decision === "rejected" ? "default" : "outline"} onClick={() => onDecide("rejected")} aria-pressed={decision === "rejected"}>
          <X aria-hidden /> Respinge
        </Button>
      </div>
    </li>
  );
}

export function DocumentVerifier({ clients }: { clients: Array<{ id: string; full_name: string }> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ApiReport | null>(null);
  const [decisions, setDecisions] = useState<Partial<Record<string, Decision>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", { method: "POST", body: new FormData(e.currentTarget) });
      const body = (await res.json().catch(() => null)) as (ApiReport & { error?: string }) | null;
      if (!res.ok || !body || body.error) {
        setError(body?.error ?? "Verificarea nu a reușit. Încercați din nou.");
        setReport(null);
      } else {
        setReport(body);
        setDecisions({});
      }
    } catch {
      setError("Nu am putut contacta serverul. Încercați din nou.");
    } finally {
      setPending(false);
    }
  }

  const marked = useMemo(() => new Set(report?.highlights.map((h) => h.issueId)), [report]);
  const sure = report?.issues.filter((i) => i.source === "determinist") ?? [];
  const ai = report?.issues.filter((i) => i.source === "ai") ?? [];
  const decide = (id: string) => (d: Decision) => setDecisions((prev) => ({ ...prev, [id]: prev[id] === d ? undefined : d }));

  function download() {
    if (!report) return;
    const blob = new Blob([reportToText(report, decisions)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `raport-${report.fileName.replace(/\.pdf$/i, "")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-3 p-4 text-[13px]">
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
        <label className="block min-w-[220px] flex-1">
          <span className="mb-1 block font-medium">Document PDF (cu text)</span>
          <input
            type="file"
            name="file"
            accept="application/pdf,.pdf"
            required
            className="block w-full text-[13px] file:mr-3 file:h-8 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:text-[13px] file:font-medium"
          />
        </label>
        <label className="block min-w-[200px]">
          <span className="mb-1 block font-medium">Compară cu clientul (opțional)</span>
          <select name="clientId" defaultValue="" className="h-8 w-full rounded-md border border-border bg-background px-2 text-[13px]">
            <option value="">Fără comparație</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name.replace(/\s*\(fictiv\)\s*$/i, "")}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="cta" className="h-9 px-4 text-[13px]" disabled={pending}>
          <FileSearch aria-hidden className="size-4" /> {pending ? "Se verifică…" : "Verifică"}
        </Button>
      </form>

      {error && (
        <div role="alert" className="flex items-center gap-1.5 rounded-md bg-tone-danger px-3 py-2 font-semibold text-tone-danger-foreground">
          <CircleAlert aria-hidden className="size-4 shrink-0" /> {error}
        </div>
      )}

      {report && (
        <div role="region" aria-label="Raportul de verificare" className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground">
                {report.fileName} · {report.pageCount} {report.pageCount === 1 ? "pagină" : "pagini"}
                {report.fields.type ? ` · ${report.fields.type}` : ""}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={download}>
                <Download aria-hidden /> Exportă raportul
              </Button>
            </div>

            <section aria-labelledby="sigur">
              <h2 id="sigur" className="mb-1 font-semibold">
                Verificări sigure ({sure.length})
              </h2>
              {sure.length === 0 ? (
                <p className="rounded-md bg-tone-ok px-3 py-2 text-tone-ok-foreground">Nu am găsit probleme la date, identificatori, sume și comparații.</p>
              ) : (
                <ul className="space-y-2">
                  {sure.map((i) => (
                    <IssueCard key={i.id} issue={i} hasMark={marked.has(i.id)} decision={decisions[i.id]} onDecide={decide(i.id)} />
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="ai">
              <h2 id="ai" className="mb-1 font-semibold">
                Sugestii AI ({ai.length})
              </h2>
              {report.ai.status !== "ok" ? (
                <p className="rounded-md bg-tone-todo px-3 py-2 text-tone-todo-foreground">{report.ai.message}</p>
              ) : ai.length === 0 ? (
                <p className="text-muted-foreground">AI-ul nu a găsit typo-uri sau inconsistențe în text.</p>
              ) : (
                <ul className="space-y-2">
                  {ai.map((i) => (
                    <IssueCard key={i.id} issue={i} hasMark={marked.has(i.id)} decision={decisions[i.id]} onDecide={decide(i.id)} />
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[12px] text-muted-foreground">Nimic nu se modifică automat: acceptați sau respingeți fiecare punct.</p>
            </section>
          </div>

          <div className="space-y-3">
            <section aria-labelledby="doc" className="rounded-md border border-border">
              <h2 id="doc" className="border-b border-border px-3 py-1.5 font-semibold">
                Documentul
              </h2>
              <div className="max-h-[60vh] overflow-y-auto p-3">
                <HighlightedText text={report.text} highlights={report.highlights} />
              </div>
            </section>

            <details className="rounded-md border border-border">
              <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-1.5 font-semibold">
                <ShieldCheck aria-hidden className="size-4 text-success" /> Ce a văzut AI-ul
              </summary>
              <div className="space-y-2 border-t border-border p-3">
                {report.ai.sentText ? (
                  <>
                    <p className="text-muted-foreground">
                      Textul exact trimis modelului, cu datele personale înlocuite local. Valori redactate:{" "}
                      {Object.entries(report.ai.redactionCounts)
                        .map(([k, n]) => `${n} ${REDACT_LABEL[k] ?? k}`)
                        .join(", ") || "niciuna"}
                      .
                    </p>
                    <pre className="max-h-56 overflow-y-auto rounded bg-muted p-2 font-mono text-[12px] whitespace-pre-wrap">{report.ai.sentText}</pre>
                  </>
                ) : (
                  <p className="text-muted-foreground">Nimic nu a fost trimis către un model AI.</p>
                )}
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
