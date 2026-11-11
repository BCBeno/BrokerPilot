export type CheckResult = { ok: boolean; detail?: string };
export type HealthReport = {
  status: "ok" | "degraded";
  time: string;
  version: string;
  checks: Record<string, CheckResult>;
};

/** Combină rezultatele verificărilor într-un raport. „skipped” (nesetat încă) nu strică statusul. */
export function buildHealthReport(checks: Record<string, CheckResult>, now = new Date()): HealthReport {
  const allOk = Object.values(checks).every((c) => c.ok);
  return {
    status: allOk ? "ok" : "degraded",
    time: now.toISOString(),
    version: process.env.APP_VERSION ?? "dev",
    checks,
  };
}

async function probe(url: string, init?: RequestInit): Promise<CheckResult> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(3000), cache: "no-store" });
    return { ok: res.status < 500, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "eroare" };
  }
}

/** Verifică Supabase (REST) și n8n (/healthz). Ce nu e configurat e marcat „neconfigurat”, nu eroare. */
export async function runHealthChecks(env = process.env): Promise<Record<string, CheckResult>> {
  const checks: Record<string, CheckResult> = { app: { ok: true } };
  const sbUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  checks.supabase = sbUrl && sbKey
    ? await probe(`${sbUrl}/rest/v1/`, { headers: { apikey: sbKey } })
    : { ok: true, detail: "neconfigurat" };
  const n8nBase = env.N8N_INTERNAL_URL;
  checks.n8n = n8nBase ? await probe(`${n8nBase}/healthz`) : { ok: true, detail: "neconfigurat" };
  return checks;
}
