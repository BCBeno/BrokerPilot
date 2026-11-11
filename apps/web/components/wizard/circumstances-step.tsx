"use client";

import { CIRCUMSTANCES } from "@/lib/amiabila/content";
import { toggleCircumstance } from "@/lib/amiabila/draft";
import { updateDraft, useDraft } from "@/lib/amiabila/draft-store";
import { NumberedCheck } from "./choice";
import { StepFrame } from "./step-frame";

export function CircumstancesStep() {
  const { circumstances } = useDraft();
  const count = circumstances.checked.length;

  return (
    <StepFrame
      slug="circumstante"
      heading="Ce făcea mașina dumneavoastră?"
      lead="Bifați tot ce se potrivește cu momentul de dinainte de impact. Numerele sunt cele din formularul oficial."
      canContinue={count > 0}
      disabledHint="Bifați cel puțin o variantă ca să continuați."
    >
      <ul className="space-y-3">
        {CIRCUMSTANCES.map(({ n, label }) => (
          <li key={n}>
            <NumberedCheck
              n={n}
              label={label}
              checked={circumstances.checked.includes(n)}
              onChange={() =>
                updateDraft((d) => ({
                  ...d,
                  circumstances: { ...d.circumstances, checked: toggleCircumstance(d.circumstances.checked, n) },
                }))
              }
            />
          </li>
        ))}
      </ul>
      {count > 0 ? (
        <p role="status" className="text-[15px] text-muted-foreground">
          {count === 1 ? "O variantă bifată." : `${count} variante bifate.`}
        </p>
      ) : null}
    </StepFrame>
  );
}
