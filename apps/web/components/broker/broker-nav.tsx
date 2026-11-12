"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/broker", label: "Dosare", match: (p: string) => p === "/broker" || p.startsWith("/broker/dosare") },
  { href: "/broker/clienti", label: "Clienți", match: (p: string) => p.startsWith("/broker/clienti") },
  { href: "/broker/reinnoiri", label: "Reînnoiri", match: (p: string) => p.startsWith("/broker/reinnoiri") },
  { href: "/broker/costuri", label: "Costuri AI", match: (p: string) => p.startsWith("/broker/costuri") },
];

/** Navigarea din banda de sus; secțiunea curentă e subliniată (nu doar colorată). */
export function BrokerNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secțiuni" className="flex items-center gap-1 overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded px-2 py-1.5 text-[13px] whitespace-nowrap underline-offset-[6px] hover:bg-white/10",
              active ? "font-semibold text-navy-foreground underline decoration-progress decoration-2" : "text-navy-muted",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
