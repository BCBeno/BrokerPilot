"use client";

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const rowBase =
  "flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-input bg-card px-4 py-3 text-base font-medium transition-colors hover:border-foreground/40 has-data-[checked]:border-foreground has-data-[checked]:bg-secondary has-focus-visible:ring-3 has-focus-visible:ring-ring/50";

/** Întrebare cu două răspunsuri descrise în cuvinte, cu pictogramă lângă întrebare. */
export function ChoiceQuestion({
  name,
  icon: Icon,
  question,
  hint,
  value,
  onChange,
  yesLabel,
  noLabel,
}: {
  name: string;
  icon: LucideIcon;
  question: string;
  hint?: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  yesLabel: string;
  noLabel: string;
}) {
  const labelId = `${name}-label`;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p id={labelId} className="text-lg leading-snug font-semibold">
            {question}
          </p>
          {hint ? <p className="mt-0.5 text-[15px] text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      <RadioGroup
        aria-labelledby={labelId}
        value={value === null ? "" : value ? "yes" : "no"}
        onValueChange={(v) => onChange(v === "yes")}
        className="gap-2"
      >
        {[
          { v: "yes", label: yesLabel },
          { v: "no", label: noLabel },
        ].map(({ v, label }) => (
          <label key={v} className={rowBase}>
            <span>{label}</span>
            <RadioGroupItem value={v} className="size-5 border-2 border-input data-checked:border-foreground data-checked:bg-foreground" />
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

/** Opțiune bifabilă cu numărul oficial al circumstanței. */
export function NumberedCheck({
  n,
  label,
  checked,
  onChange,
}: {
  n: number;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className={cn(rowBase, "justify-start")}>
      <span
        aria-hidden
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-base font-bold",
          checked ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
        )}
      >
        {n}
      </span>
      <span className="flex-1 leading-snug">
        <span className="sr-only">{n}. </span>
        {label}
      </span>
      <Checkbox checked={checked} onCheckedChange={onChange} className="size-6 rounded-md border-2" />
    </label>
  );
}

/** Card radio simplu pentru grile (zona de impact, „când”). */
export function RadioCard({
  name,
  label,
  checked,
  onChange,
  className,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-input bg-card px-3 text-center text-base font-medium transition-colors hover:border-foreground/40 has-checked:border-foreground has-checked:bg-secondary has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        className,
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      {checked ? <Check className="size-5 shrink-0" aria-hidden /> : null}
      {label}
    </label>
  );
}
