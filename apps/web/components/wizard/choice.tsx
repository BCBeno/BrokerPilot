"use client";

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

/** Lista grupată: un bloc alb cu linii fine între rânduri. */
export const listGroup = "overflow-hidden rounded-lg border bg-card divide-y";

const row =
  "flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-base transition-colors hover:bg-secondary/60 has-data-[checked]:font-semibold has-focus-visible:bg-secondary";

/** Listă de alegere simplă (un singur răspuns), rânduri cu bifă în dreapta. */
export function ChoiceList({
  labelledBy,
  value,
  onChange,
  options,
  className,
}: {
  labelledBy: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      value={value}
      onValueChange={(v) => onChange(String(v))}
      className={cn(listGroup, "gap-0", className)}
    >
      {options.map((o) => (
        <label key={o.value} className={row}>
          <span>{o.label}</span>
          <RadioGroupItem value={o.value} variant="check" />
        </label>
      ))}
    </RadioGroup>
  );
}

/** Întrebare cu două răspunsuri descrise în cuvinte. Pictograma stă mică, în rândul întrebării. */
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
    <div className="space-y-2.5">
      <div>
        <p id={labelId} className="flex items-start gap-2 text-lg leading-snug font-semibold">
          <Icon className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
          {question}
        </p>
        {hint ? <p className="mt-1 pl-7 text-[15px] text-muted-foreground">{hint}</p> : null}
      </div>
      <ChoiceList
        labelledBy={labelId}
        value={value === null ? "" : value ? "yes" : "no"}
        onChange={(v) => onChange(v === "yes")}
        options={[
          { value: "yes", label: yesLabel },
          { value: "no", label: noLabel },
        ]}
      />
    </div>
  );
}

/** Rând bifabil cu numărul oficial al circumstanței. Se pune într-un `<ul className={listGroup}>`. */
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
    <label className={cn(row, "justify-start")}>
      <span aria-hidden className="w-6 shrink-0 text-center text-base font-bold text-muted-foreground">
        {n}
      </span>
      <span className={cn("flex-1 leading-snug", checked && "font-semibold")}>
        <span className="sr-only">{n}. </span>
        {label}
      </span>
      <Checkbox checked={checked} onCheckedChange={onChange} className="size-6 rounded-md border-2" />
    </label>
  );
}

/** Card radio pentru grile (zona de impact). */
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
        "relative flex min-h-14 cursor-pointer items-center justify-center gap-1.5 rounded-lg border bg-card px-3 text-center text-base transition-colors hover:bg-secondary/60 has-checked:border-foreground has-checked:bg-secondary has-checked:font-semibold has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        className,
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      {checked ? <Check className="size-4 shrink-0" aria-hidden /> : null}
      {label}
    </label>
  );
}
