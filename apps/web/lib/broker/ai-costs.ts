/**
 * Costurile AI pentru pagina brokerului. Citim doar metadate din `ai_calls` (task, model, cost, tokeni, durată),
 * niciodată conținutul promptului sau al răspunsului (nu se salvează). Zilele sunt în UTC, ca plafonul zilnic din gateway.
 */

export type AiCallRow = {
  at: string;
  workflow: string | null;
  task: string | null;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | string | null;
  latency_ms: number | null;
  success: boolean;
};

export type CostGroup = { key: string; label: string; calls: number; failed: number; costUsd: number; tokens: number; avgLatencyMs: number | null };
export type CostDay = { day: string; calls: number; costUsd: number };

export type CostReport = {
  todayUsd: number;
  budgetUsd: number;
  windowUsd: number;
  calls: number;
  failed: number;
  /** Apeluri fără cost raportat (ex. un eșec): totalul e „cel puțin”. */
  withoutCost: number;
  days: CostDay[];
  byModel: CostGroup[];
  byTask: CostGroup[];
};

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v) || 0);

export const utcDay = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

/** „extract-document@2” → „extract-document”: versiunea promptului nu împarte rândurile în tabel. */
export function taskName(task: string | null): string {
  return (task ?? "necunoscut").replace(/@\d+$/, "");
}

/** Vapi nu are model în rând (costul e al apelului întreg), deci grupăm după furnizor. */
export function modelName(row: Pick<AiCallRow, "model" | "provider">): string {
  return row.model ?? (row.provider ? `${row.provider} (apel întreg)` : "necunoscut");
}

function group(rows: AiCallRow[], keyOf: (r: AiCallRow) => string): CostGroup[] {
  const map = new Map<string, { g: CostGroup; latSum: number; latN: number }>();
  for (const r of rows) {
    const key = keyOf(r);
    const entry = map.get(key) ?? { g: { key, label: key, calls: 0, failed: 0, costUsd: 0, tokens: 0, avgLatencyMs: null }, latSum: 0, latN: 0 };
    entry.g.calls += 1;
    if (!r.success) entry.g.failed += 1;
    entry.g.costUsd += num(r.cost_usd);
    entry.g.tokens += num(r.input_tokens) + num(r.output_tokens);
    if (r.latency_ms != null) {
      entry.latSum += r.latency_ms;
      entry.latN += 1;
    }
    map.set(key, entry);
  }
  return [...map.values()]
    .map(({ g, latSum, latN }) => ({ ...g, avgLatencyMs: latN ? Math.round(latSum / latN) : null }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
}

/** Raportul pe ultimele `windowDays` zile (azi inclus); zilele fără apeluri apar cu 0, ca graficul să nu sară peste ele. */
export function buildCostReport(rows: AiCallRow[], opts: { now: Date; windowDays: number; budgetUsd: number }): CostReport {
  const { now, windowDays, budgetUsd } = opts;
  const today = utcDay(now);
  const dayKeys: string[] = [];
  for (let i = windowDays - 1; i >= 0; i--) dayKeys.push(utcDay(new Date(now.getTime() - i * 86_400_000)));
  const inWindow = rows.filter((r) => dayKeys.includes(utcDay(r.at)));

  const perDay = new Map<string, CostDay>(dayKeys.map((day) => [day, { day, calls: 0, costUsd: 0 }]));
  for (const r of inWindow) {
    const d = perDay.get(utcDay(r.at));
    if (!d) continue;
    d.calls += 1;
    d.costUsd += num(r.cost_usd);
  }
  const days = [...perDay.values()];

  return {
    todayUsd: perDay.get(today)?.costUsd ?? 0,
    budgetUsd,
    windowUsd: days.reduce((s, d) => s + d.costUsd, 0),
    calls: inWindow.length,
    failed: inWindow.filter((r) => !r.success).length,
    withoutCost: inWindow.filter((r) => r.cost_usd == null).length,
    days,
    byModel: group(inWindow, modelName),
    byTask: group(inWindow, (r) => taskName(r.task)),
  };
}

/** Sume mici (centi) cu patru zecimale sub 1 USD, altfel două. */
export function usd(v: number): string {
  const digits = Math.abs(v) < 1 ? 4 : 2;
  return `$${v.toLocaleString("ro-RO", { minimumFractionDigits: digits === 4 && v === 0 ? 2 : digits, maximumFractionDigits: digits })}`;
}
