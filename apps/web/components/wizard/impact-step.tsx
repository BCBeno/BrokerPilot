"use client";

import { MessageSquareText, Wrench } from "lucide-react";
import { IMPACT_LABELS, type ImpactZone } from "@/lib/amiabila/content";
import { Textarea } from "@/components/ui/textarea";
import { RadioCard } from "./choice";
import { StepFrame } from "./step-frame";
import { useWizard } from "./wizard-context";

/** Mașina văzută de sus, cu fața în sus. */
function CarTopDown({ role }: { role: "A" | "B" }) {
  // Geamurile se văd pe ambele culori: deschise pe A (albastru), închise pe B (galben).
  const glass = role === "A" ? "fill-white/85" : "fill-primary/80";
  return (
    <svg viewBox="0 0 60 100" className="mx-auto h-28 w-auto" role="img" aria-label="Mașina dumneavoastră, văzută de sus">
      <rect x="6" y="4" width="48" height="92" rx="16" className={role === "A" ? "fill-driver-a" : "fill-driver-b"} />
      <path d="M14 30 Q30 22 46 30 L44 44 Q30 40 16 44 Z" className={glass} />
      <path d="M16 70 Q30 74 44 70 L46 82 Q30 88 14 82 Z" className={glass} />
      <rect x="6" y="4" width="48" height="92" rx="16" fill="none" className="stroke-primary" strokeWidth="2" />
    </svg>
  );
}

const GRID: (ImpactZone | "car")[] = [
  "front-left",
  "front",
  "front-right",
  "left",
  "car",
  "right",
  "rear-left",
  "rear",
  "rear-right",
];

export function ImpactStep() {
  const {
    draft: { circumstances },
    update,
    role,
  } = useWizard();
  const set = (patch: Partial<typeof circumstances>) =>
    update((d) => ({ ...d, circumstances: { ...d.circumstances, ...patch } }));

  return (
    <StepFrame
      slug="impact"
      heading="Unde a fost lovită mașina?"
      lead="Atingeți zona care a primit prima lovitură."
      canContinue={circumstances.impact !== null}
      disabledHint="Alegeți zona lovită ca să continuați."
    >
      <fieldset>
        <legend className="sr-only">Zona primului impact</legend>
        <div className="grid grid-cols-3 gap-2">
          {GRID.map((cell) =>
            cell === "car" ? (
              <div key="car" className="flex items-center justify-center">
                <CarTopDown role={role} />
              </div>
            ) : (
              <RadioCard
                key={cell}
                name="impact"
                label={IMPACT_LABELS[cell]}
                checked={circumstances.impact === cell}
                onChange={() => set({ impact: cell })}
                className="min-h-16 flex-col gap-1 px-2 text-[15px] leading-tight"
              />
            ),
          )}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="damage" className="flex items-center gap-2 text-lg font-semibold">
          <Wrench className="size-5 text-primary" aria-hidden />
          Ce daune se văd? <span className="font-normal text-muted-foreground">(opțional)</span>
        </label>
        <Textarea
          id="damage"
          rows={3}
          maxLength={1000}
          placeholder="Ex.: bara din față crăpată, aripa stângă îndoită"
          className="rounded-lg bg-card px-4 py-3 text-base md:text-base"
          value={circumstances.damage}
          onChange={(e) => set({ damage: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="notes" className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareText className="size-5 text-primary" aria-hidden />
          Observații <span className="font-normal text-muted-foreground">(opțional)</span>
        </label>
        <Textarea
          id="notes"
          rows={3}
          maxLength={1000}
          placeholder="Orice altceva important, de exemplu vizibilitatea sau starea drumului"
          className="rounded-lg bg-card px-4 py-3 text-base md:text-base"
          value={circumstances.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </StepFrame>
  );
}
