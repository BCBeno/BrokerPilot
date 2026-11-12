import { cn } from "@/lib/utils";

/**
 * Numărul de înmatriculare desenat ca plăcuța românească (banda UE albastră cu „RO”, chenar negru).
 * E semnul vizual al mașinii în tot dashboardul: fișa clientului, Reînnoiri, capul coloanelor din dosar.
 * „RO” e decor (`aria-hidden`); cititorul de ecran aude doar numărul.
 */
export function Plate({ plate, size = "md", className }: { plate: string; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-stretch overflow-hidden rounded-[3px] border-[1.5px] border-foreground bg-card align-middle font-semibold whitespace-nowrap text-foreground uppercase tabular-nums",
        size === "md" ? "h-6 text-[14px] tracking-[0.06em]" : "h-5 text-[12px] tracking-[0.04em]",
        className,
      )}
    >
      <span aria-hidden className={cn("flex items-end bg-plate-band pb-px font-medium text-white", size === "md" ? "px-[3px] text-[9px]" : "px-[2px] text-[8px]")}>
        RO
      </span>
      <span className={cn("flex items-center", size === "md" ? "px-1.5" : "px-1")}>{plate}</span>
    </span>
  );
}
