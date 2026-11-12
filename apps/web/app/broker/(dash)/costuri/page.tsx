import type { Metadata } from "next";
import { buildCostReport, usd, type AiCallRow, type CostGroup } from "@/lib/broker/ai-costs";
import { requireBroker } from "@/lib/broker/session";
import { getServerEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Costuri AI · BrokerPilot" };

const WINDOW_DAYS = 30;
const MAX_ROWS = 5000;

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("ro-RO", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function AiCostsPage() {
  const { db } = await requireBroker();
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  // Doar metadate (fără prompt sau răspuns); RLS lasă brokerii activi să citească `ai_calls`.
  const { data, error } = await db
    .from("ai_calls")
    .select("at, workflow, task, provider, model, input_tokens, output_tokens, cost_usd, latency_ms, success")
    .gte("at", since.toISOString())
    .order("at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    return (
      <main className="min-h-0 flex-1 overflow-y-auto bg-card px-5 py-3 text-[13px]">
        <p role="alert" className="text-destructive">
          Nu am putut încărca costurile. Reîncărcați pagina.
        </p>
      </main>
    );
  }

  const rows = (data ?? []) as AiCallRow[];
  const report = buildCostReport(rows, { now, windowDays: WINDOW_DAYS, budgetUsd: getServerEnv().AI_DAILY_BUDGET_USD });
  const pct = Math.min(100, (report.todayUsd / report.budgetUsd) * 100);
  const level = pct >= 100 ? "danger" : pct >= 80 ? "todo" : "ok";
  const maxDay = Math.max(...report.days.map((d) => d.costUsd), 0.000001);
  const truncated = rows.length >= MAX_ROWS;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-card">
      <section aria-labelledby="titlu" className="text-[13px]">
        <header className="border-b border-border px-5 py-3">
          <h1 id="titlu" className="text-[20px] leading-tight font-semibold">
            Costuri AI
          </h1>
          <p className="mt-0.5 text-muted-foreground">
            Ultimele {WINDOW_DAYS} de zile: {report.calls} {report.calls === 1 ? "apel" : "apeluri"}, {usd(report.windowUsd)}
            {report.failed > 0 && `, ${report.failed} ${report.failed === 1 ? "eșuat" : "eșuate"}`}. Zilele sunt în UTC, ca plafonul zilnic. Nu se păstrează conținutul cererilor.
          </p>
        </header>

        <div className="border-b border-border px-5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="font-semibold">Azi față de plafon</h2>
            <span className="tabular-nums">
              <span className="text-[16px] font-semibold">{usd(report.todayUsd)}</span> din {usd(report.budgetUsd)}
            </span>
          </div>
          <div
            role="meter"
            aria-label="Costul de azi față de plafonul zilnic"
            aria-valuemin={0}
            aria-valuemax={report.budgetUsd}
            aria-valuenow={Math.min(report.todayUsd, report.budgetUsd)}
            aria-valuetext={`${usd(report.todayUsd)} din ${usd(report.budgetUsd)}`}
            className="mt-2 h-2 overflow-hidden rounded bg-muted"
          >
            <div className={cn("h-full", level === "ok" && "bg-tone-ok-foreground", level === "todo" && "bg-tone-todo-foreground", level === "danger" && "bg-tone-danger-foreground")} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-muted-foreground">
            {level === "danger"
              ? "Plafonul a fost atins: extragerea din acte se oprește până mâine (UTC)."
              : "La plafon, extragerea din acte se oprește până a doua zi (UTC). Apelurile vocale nu sunt oprite de plafon, dar se numără."}
          </p>
        </div>

        <div className="border-b border-border px-5 py-3">
          <h2 className="font-semibold">Cost pe zi</h2>
          <ol className="mt-2 flex h-28 items-end gap-[3px]" aria-label="Cost pe zi, ultimele 30 de zile">
            {report.days.map((d) => (
              <li key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${dayLabel(d.day)}: ${usd(d.costUsd)}, ${d.calls} apeluri`}>
                <div className={cn("w-full rounded-t-[2px]", d.costUsd > 0 ? "bg-navy" : "bg-muted")} style={{ height: d.costUsd > 0 ? `${Math.max(4, (d.costUsd / maxDay) * 100)}%` : "2px" }} />
                <span className="sr-only">
                  {dayLabel(d.day)}: {usd(d.costUsd)}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-1 flex justify-between text-[12px] text-muted-foreground">
            <span>{dayLabel(report.days[0].day)}</span>
            <span>vârf {usd(maxDay < 0.001 ? 0 : maxDay)}</span>
            <span>azi</span>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-2">
          <GroupTable title="Pe model" firstCol="Model" groups={report.byModel} className="border-b border-border lg:border-r" />
          <GroupTable title="Pe task" firstCol="Task" groups={report.byTask} className="border-b border-border" />
        </div>

        <footer className="px-5 py-3 text-[12px] text-muted-foreground">
          {report.withoutCost > 0 && <p>
              {report.withoutCost === 1 ? "Un apel n-are" : `${report.withoutCost} apeluri n-au`} costul raportat (de regulă cele eșuate), deci totalurile sunt „cel puțin”.
            </p>}
          {truncated && <p>Sunt afișate doar ultimele {MAX_ROWS} de apeluri; totalurile pot fi incomplete.</p>}
          <p>Costul vocii e cel raportat de Vapi pentru tot apelul (transcriere, model și voce), fără tokeni.</p>
        </footer>
      </section>
    </main>
  );
}

function GroupTable({ title, firstCol, groups, className }: { title: string; firstCol: string; groups: CostGroup[]; className?: string }) {
  return (
    <div className={cn("px-5 py-3", className)}>
      <h2 className="font-semibold">{title}</h2>
      {groups.length === 0 ? (
        <p className="mt-1 text-muted-foreground">Niciun apel în această perioadă.</p>
      ) : (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 font-medium">{firstCol}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Apeluri</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Tokeni</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Durată medie</th>
                <th scope="col" className="py-1.5 pl-3 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className="border-b border-border last:border-b-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal break-all">
                    {g.label}
                    {g.failed > 0 && <span className="ml-1.5 text-[12px] text-destructive">{g.failed} {g.failed === 1 ? "eșuat" : "eșuate"}</span>}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{g.calls}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{g.tokens > 0 ? g.tokens.toLocaleString("ro-RO") : "—"}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">{g.avgLatencyMs != null ? `${(g.avgLatencyMs / 1000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} s` : "—"}</td>
                  <td className="py-1.5 pl-3 text-right font-medium tabular-nums">{usd(g.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
