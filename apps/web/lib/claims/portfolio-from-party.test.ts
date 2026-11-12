import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addConsentingPartiesToPortfolio } from "./portfolio-from-party";

type Call = { table: string; op: string; row?: Record<string, unknown> };

/** Bază de date falsă: întoarce rândurile date pe tabel și notează inserările. */
function fakeDb(opts: { parties: object[]; candidates?: object[]; vehicles?: object[] }) {
  const calls: Call[] = [];
  const reads: Record<string, object[]> = {
    claims: [{ agency_id: "ag1" }],
    claim_parties: opts.parties,
    vehicles: opts.vehicles ?? [],
  };
  const from = (table: string) => {
    let op = "select";
    const q: Record<string, unknown> = {};
    const chain = new Proxy(q, {
      get(_t, prop: string) {
        if (prop === "then") {
          const rows = reads[table] ?? [];
          return (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
        }
        if (prop === "maybeSingle") return async () => ({ data: (reads[table] ?? [])[0] ?? null, error: null });
        if (prop === "insert") return (row: Record<string, unknown>) => (calls.push({ table, op: "insert", row }), Promise.resolve({ error: null }));
        if (prop === "update") return (row: Record<string, unknown>) => ((op = "update"), calls.push({ table, op, row }), chain);
        return () => chain;
      },
    });
    return chain;
  };
  const db = { from, rpc: async () => ({ data: opts.candidates ?? [], error: null }) } as unknown as SupabaseClient;
  return { db, calls };
}

const party = (over: object = {}) => ({
  role: "A",
  client_id: null,
  contact_consent_at: "2026-11-12T10:00:00Z",
  driver: { fullName: "Ion Fictiv", phone: "0700 000 001", email: "ion@example.com" },
  vehicle: { plate: "B 123 TST", make: "Dacia", model: "Logan", year: "2018" },
  insurance: { insurer: "Asigurator Fictiv", policyNo: "FX-RCA-9001", validFrom: "2026-03-01", validTo: "2027-02-28" },
  ...over,
});

describe("addConsentingPartiesToPortfolio", () => {
  it("creează clientul, vehiculul și polița pentru cine a dat acordul", async () => {
    const { db, calls } = fakeDb({ parties: [party()] });
    const out = await addConsentingPartiesToPortfolio(db, "c1");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ role: "A", created: true });
    expect(calls.filter((c) => c.op === "insert").map((c) => c.table)).toEqual(["clients", "vehicles", "policies", "events"]);
    const policy = calls.find((c) => c.table === "policies")!.row!;
    expect(policy).toMatchObject({ type: "RCA", insurer: "Asigurator Fictiv", policy_no: "FX-RCA-9001", valid_to: "2027-02-28" });
    expect(policy).not.toHaveProperty("broker_id");
    expect(calls.find((c) => c.table === "clients")!.row).toMatchObject({ needs_review: true });
    expect(calls.find((c) => c.table === "events")!.row!.payload).toMatchObject({ method: "consent_added" });
  });

  it("nu face nimic fără acord", async () => {
    const { db, calls } = fakeDb({ parties: [party({ contact_consent_at: null })] });
    expect(await addConsentingPartiesToPortfolio(db, "c1")).toEqual([]);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });

  it("nu creează duplicat când potrivirea e ambiguă", async () => {
    const { db, calls } = fakeDb({
      parties: [party()],
      candidates: [
        { client_id: "x", method: "plate" },
        { client_id: "y", method: "plate" },
      ],
    });
    expect(await addConsentingPartiesToPortfolio(db, "c1")).toEqual([]);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });
});
