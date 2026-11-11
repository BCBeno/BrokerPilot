import { NextResponse } from "next/server";
import { buildHealthReport, runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Smoke test după deploy și ținta Uptime Kuma. Fără date sensibile în răspuns. */
export async function GET() {
  const report = buildHealthReport(await runHealthChecks());
  return NextResponse.json(report, { status: report.status === "ok" ? 200 : 503 });
}
