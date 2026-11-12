"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CHANNEL_LABELS,
  LIST_FILTERS,
  matchesFilter,
  matchesQuery,
  shortTime,
  type ClaimListRow,
  type ListFilter,
} from "@/lib/broker/claims";
import { getSessionBrowserClient } from "@/lib/supabase/browser-session";
import { cn } from "@/lib/utils";
import { StatusPill } from "./status-pill";

/**
 * Coloana din stânga: dosarele agenției, cu filtre și căutare locale. La orice schimbare în `claims`
 * (Realtime cu RLS) cere serverului lista nouă (`router.refresh`); payload-ul nu e folosit.
 */
export function ClaimsList({ rows }: { rows: ClaimListRow[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState(false);

  useEffect(() => {
    const db = getSessionBrowserClient();
    if (!db) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = db
      .channel("broker-claims")
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 300);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [router]);

  const counts = useMemo(
    () => Object.fromEntries(LIST_FILTERS.map((f) => [f.id, rows.filter((r) => matchesFilter(r, f.id)).length])),
    [rows],
  );
  const visible = rows.filter((r) => matchesFilter(r, filter) && matchesQuery(r, query));
  const activeId = pathname.startsWith("/broker/dosare/") ? pathname.split("/")[3] : null;

  return (
    <section
      aria-label="Dosare"
      className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card", activeId && "hidden lg:flex")}
    >
      <div className="space-y-2 border-b border-border p-2.5">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ref, nr. înmatriculare, adresă"
            aria-label="Caută dosare"
            className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-7 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div role="tablist" aria-label="Filtru status" className="flex flex-wrap gap-1">
          {LIST_FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "h-6 rounded px-2 text-[12px] font-medium",
                filter === f.id ? "bg-navy text-navy-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label} <span className="opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((r) => {
          const active = r.id === activeId;
          const isNew = matchesFilter(r, "new");
          return (
            <li key={r.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/broker/dosare/${r.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block border-l-[3px] px-2.5 py-2 text-[12px] hover:bg-muted/60",
                  active ? "border-l-navy bg-[#F3F7FE]" : "border-l-transparent",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                    {isNew && (
                      <span className="size-2 shrink-0 rounded-full bg-cta" role="img" aria-label="De preluat" title="De preluat" />
                    )}
                    {r.ref}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{shortTime(r.updatedAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <StatusPill status={r.status} />
                  <span className="truncate text-muted-foreground">
                    {CHANNEL_LABELS[r.channel] ?? r.channel}
                    {r.location && ` · ${r.location}`}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground">
                  <span className="truncate">
                    {r.plateA || "—"} / {r.plateB || "—"}
                  </span>
                  {r.missingBlocking ? (
                    <span className="shrink-0 rounded bg-tone-danger px-1 font-medium text-tone-danger-foreground">
                      {r.missingBlocking} {r.missingBlocking === 1 ? "lipsă" : "lipsuri"}
                    </span>
                  ) : r.brokerName ? (
                    <span className="shrink-0">{r.brokerName.split(" ")[0]}</span>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
        {visible.length === 0 && <li className="p-4 text-[13px] text-muted-foreground">Niciun dosar pentru filtrul ales.</li>}
      </ul>
      <p className="border-t border-border px-2.5 py-1.5 text-[12px] text-muted-foreground">
        {visible.length} din {rows.length} dosare · {live ? "actualizare automată" : "fără actualizare automată"}
      </p>
    </section>
  );
}
