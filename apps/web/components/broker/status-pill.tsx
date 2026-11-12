import { STATUS_LABELS, type ClaimStatus } from "@/lib/broker/claims";
import { cn } from "@/lib/utils";

/** Tonuri din `globals.css` (`--tone-*`); textul spune mereu statusul (culoarea nu e singurul semnal). */
const STYLE: Record<ClaimStatus, string> = {
  draft: "bg-tone-neutral text-tone-neutral-foreground",
  awaiting_b: "bg-tone-info text-tone-info-foreground",
  signed: "bg-tone-ok text-tone-ok-foreground",
  submitted: "bg-tone-todo text-tone-todo-foreground",
  in_progress: "bg-tone-work text-tone-work-foreground",
  closed: "bg-tone-neutral text-tone-neutral-foreground",
};

export function StatusPill({ status, className }: { status: ClaimStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded px-1.5 py-px text-[12px] font-medium leading-[18px]",
        STYLE[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function RoleTag({ role, className }: { role: "A" | "B"; className?: string }) {
  return (
    <span
      aria-label={`Șoferul ${role}`}
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-sm text-[12px] font-bold",
        role === "A" ? "bg-driver-a text-driver-a-foreground" : "bg-driver-b text-driver-b-foreground",
        className,
      )}
    >
      {role}
    </span>
  );
}
