import type { PartySubmission } from "@/lib/amiabila/claim";
import { DOC_TYPES, isDocConfirmed } from "@/lib/amiabila/documents";

/** Ce știm despre dosar în momentul finalizării. Doar fapte, fără date personale. */
export type CompletenessInput = {
  partyA: PartySubmission | null;
  partyB: PartySubmission | null;
  photosA: number;
  photosB: number;
  hasSketch: boolean;
  signedA: boolean;
  signedB: boolean;
};

export type MissingItem = { code: string; label: string; blocking: boolean };

/**
 * Checklist de completitudine pentru broker: ce lipsește din dosar. „blocking” = fără ele dosarul nu e valid
 * (acte, circumstanțe, semnături); restul sunt recomandări (poze, schiță) pe care brokerul le poate cere ulterior.
 * Calculul e determinist și testat; n8n doar îl afișează.
 */
export function missingItems(input: CompletenessInput): MissingItem[] {
  const out: MissingItem[] = [];
  for (const [role, party] of [["A", input.partyA], ["B", input.partyB]] as const) {
    if (!party) {
      out.push({ code: `party_${role}`, label: `Datele șoferului ${role} lipsesc`, blocking: true });
      continue;
    }
    if (!DOC_TYPES.every((t) => isDocConfirmed(t, party.documents[t]))) {
      out.push({ code: `docs_${role}`, label: `Actele șoferului ${role} sunt incomplete`, blocking: true });
    }
    if (party.circumstances.checked.length === 0) {
      out.push({ code: `circumstances_${role}`, label: `Șoferul ${role} nu a bifat circumstanțe`, blocking: true });
    }
    if (party.circumstances.impact === null) {
      out.push({ code: `impact_${role}`, label: `Zona lovită a vehiculului ${role} nu e aleasă`, blocking: true });
    }
  }
  if (!input.signedA) out.push({ code: "signature_A", label: "Lipsește semnătura șoferului A", blocking: true });
  if (!input.signedB) out.push({ code: "signature_B", label: "Lipsește semnătura șoferului B", blocking: true });
  if (input.photosA === 0) out.push({ code: "photos_A", label: "Nicio poză cu daunele vehiculului A", blocking: false });
  if (input.photosB === 0) out.push({ code: "photos_B", label: "Nicio poză cu daunele vehiculului B", blocking: false });
  if (!input.hasSketch) out.push({ code: "sketch", label: "Lipsește schița accidentului", blocking: false });
  return out;
}

/** Dosarul se poate finaliza doar fără elemente blocante. */
export const isComplete = (items: MissingItem[]) => items.every((i) => !i.blocking);
