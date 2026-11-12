"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { expiryBadge } from "@/lib/broker/renewals";
import { cn } from "@/lib/utils";
import { ToneBadge } from "./status-pill";

export type ClientListRow = {
  id: string;
  name: string;
  phone: string | null;
  plates: string[];
  policyCount: number;
  /** Zile până la cea mai apropiată poliță de reînnoit (negativ = expirată), `null` = nimic în fereastră. */
  dueDays: number | null;
};

const compact = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Coloana din stânga: clienții, căutați după nume, telefon sau număr de înmatriculare (local, nimic în URL). */
export function ClientsList({ rows }: { rows: ClientListRow[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const activeId = pathname.startsWith("/broker/clienti/") ? pathname.split("/")[3] : null;

  const q = compact(query);
  const visible = rows.filter(
    (r) =>
      (!dueOnly || r.dueDays !== null) &&
      (!q || compact(r.name).includes(q) || (r.phone && compact(r.phone).includes(q)) || r.plates.some((p) => compact(p).includes(q))),
  );
  const dueCount = rows.filter((r) => r.dueDays !== null).length;

  return (
    <section
      aria-label="Clienți"
      className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card", activeId && "hidden lg:flex")}
    >
      <div className="space-y-2 border-b border-border p-2.5">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nume, telefon, nr. înmatriculare"
            aria-label="Caută clienți"
            className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-7 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div role="tablist" aria-label="Filtru clienți" className="flex flex-wrap gap-1">
          {[
            { id: false, label: "Toți", n: rows.length },
            { id: true, label: "Cu reînnoiri", n: dueCount },
          ].map((f) => (
            <button
              key={f.label}
              role="tab"
              aria-selected={dueOnly === f.id}
              onClick={() => setDueOnly(f.id)}
              className={cn(
                "h-6 rounded px-2 text-[12px] font-medium",
                dueOnly === f.id ? "bg-navy text-navy-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label} <span className="opacity-70">{f.n}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((r) => {
          const active = r.id === activeId;
          return (
            <li key={r.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/broker/clienti/${r.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block border-l-[3px] px-2.5 py-2 text-[12px] hover:bg-muted/60",
                  active ? "border-l-navy bg-muted/60" : "border-l-transparent",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">{r.name}</span>
                  {r.dueDays !== null && <ToneBadge tone={expiryBadge(r.dueDays).tone}>{expiryBadge(r.dueDays).label}</ToneBadge>}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground">
                  <span className="truncate">{r.plates.length ? r.plates.join(", ") : "fără vehicule"}</span>
                  <span className="shrink-0">
                    {r.policyCount} {r.policyCount === 1 ? "poliță" : "polițe"}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
        {visible.length === 0 && <li className="p-4 text-[13px] text-muted-foreground">Niciun client găsit.</li>}
      </ul>
      <p className="border-t border-border px-2.5 py-1.5 text-[12px] text-muted-foreground">
        {visible.length} din {rows.length} clienți
      </p>
    </section>
  );
}
