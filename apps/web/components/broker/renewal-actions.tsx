"use client";

import { BellRing, Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { markRenewalContacted, snoozeRenewal } from "@/app/broker/actions";
import { SNOOZE_OPTIONS } from "@/lib/broker/renewals";
import { cn } from "@/lib/utils";

const BTN =
  "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[12px] font-medium hover:bg-muted disabled:opacity-60";

/** „Am contactat” / „Reamintește-mi” pentru o poliță; scrie în `events` prin server action, apoi pagina se reîmprospătează. */
export function RenewalActions({ policyId, className }: { policyId: string; className?: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    setOpen(false);
    start(async () => {
      try {
        await fn();
      } catch {
        setError("Nu s-a salvat. Încercați din nou.");
      }
    });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <button type="button" className={BTN} disabled={pending} onClick={() => run(() => markRenewalContacted(policyId))}>
        <Check aria-hidden className="size-3.5" /> Am contactat
      </button>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          className={BTN}
          disabled={pending}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <BellRing aria-hidden className="size-3.5" /> Reamintește-mi <ChevronDown aria-hidden className="size-3" />
        </button>
        {open && (
          <ul role="menu" className="absolute right-0 z-20 mt-1 min-w-40 rounded-md border border-border bg-card py-1 shadow-md">
            {SNOOZE_OPTIONS.map((o) => (
              <li key={o.days} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-muted"
                  onClick={() => run(() => snoozeRenewal(policyId, o.days))}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pending && <span className="text-[12px] text-muted-foreground">Se salvează…</span>}
      {error && (
        <span role="alert" className="text-[12px] text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
