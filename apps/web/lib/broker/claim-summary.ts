/**
 * Concluzia din capul fișei de dosar: în loc de o listă cu fiecare regulă declanșată („Lipsește semnătura șoferului A”,
 * „… B”), câteva propoziții pe care le-ar spune un coleg. Dovada rămâne în tabelul A | B, la locul ei.
 */
import type { CrossCheck } from "./compare";
import type { MissingItem } from "@/lib/claims/completeness";

type Role = "A" | "B";

export type ClaimSummary = {
  /** `ok` = complet; `work` = dosar în lucru (normal, nu alarmă). */
  tone: "ok" | "work";
  /** Propozițiile despre ce lipsește (sau „complet”), în ordinea în care le rezolvă brokerul. */
  status: string[];
  /** Ce nu se potrivește între A și B sau cu data accidentului: o propoziție pe problemă. */
  warnings: string[];
  /** Ce nu blochează, dar ar ajuta („Ar ajuta: …”), sau `null`. */
  extras: string | null;
  /** Rolurile cu acte incomplete, pentru capul coloanei din tabel. */
  docsIncomplete: Role[];
};

const ROLES: Role[] = ["A", "B"];

const listRo = (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} și ${parts.at(-1)}`);

export function summarizeClaim(missing: MissingItem[], checks: CrossCheck[]): ClaimSummary {
  const has = (code: string) => missing.some((m) => m.code === code);
  const absent = ROLES.filter((r) => has(`party_${r}`));
  const present = ROLES.filter((r) => !absent.includes(r));
  const rolesWith = (aspect: string) => present.filter((r) => has(`${aspect}_${r}`));

  const status: string[] = [];
  if (absent.length === 2) status.push("Niciun șofer nu și-a trimis încă datele.");
  else if (absent.length === 1) status.push(`Șoferul ${absent[0]} nu și-a trimis încă datele.`);

  // Pentru fiecare aspect: „la amândoi” când lipsește la ambii șoferi prezenți, altfel numele rolului.
  const both = (roles: Role[]) => roles.length === 2;
  const sig = rolesWith("signature");
  if (sig.length) status.push(both(sig) ? "Niciun șofer n-a semnat încă." : `Șoferul ${sig[0]} n-a semnat încă.`);
  const docs = rolesWith("docs");
  if (docs.length) status.push(both(docs) ? "Actele sunt incomplete la amândoi." : `Actele lui ${docs[0]} sunt incomplete.`);
  const circ = rolesWith("circumstances");
  if (circ.length) status.push(both(circ) ? "Niciun șofer n-a bifat circumstanțele." : `Șoferul ${circ[0]} n-a bifat circumstanțele.`);
  const impact = rolesWith("impact");
  if (impact.length) status.push(both(impact) ? "Zona lovită nu e aleasă la niciun vehicul." : `Zona lovită a vehiculului ${impact[0]} nu e aleasă.`);

  const complete = !missing.some((m) => m.blocking);
  if (complete) status.push("Complet: actele, circumstanțele și semnăturile sunt la dosar.");

  const photos = rolesWith("photos");
  const extraParts = [
    ...(photos.length ? [both(photos) ? "poze cu daunele ambelor vehicule" : `poze cu daunele vehiculului ${photos[0]}`] : []),
    ...(has("sketch") && absent.length === 0 ? ["schița accidentului"] : []),
  ];

  return {
    tone: complete ? "ok" : "work",
    status,
    warnings: warningsFrom(checks),
    extras: extraParts.length ? `Ar ajuta: ${listRo(extraParts)}.` : null,
    docsIncomplete: docs,
  };
}

/** Verificările încrucișate spuse ca o concluzie; aceeași mașină + aceeași poliță devin o singură propoziție. */
function warningsFrom(checks: CrossCheck[]): string[] {
  const shared = (field: CrossCheck["field"]) => checks.some((c) => c.field === field && c.role === null);
  const samePlate = shared("vehicle");
  const samePolicy = shared("policy");
  const out: string[] = [];
  if (samePlate && samePolicy) out.push("A și B au aceeași mașină și aceeași poliță. Probabil un șofer a completat datele celuilalt.");
  else if (samePlate) out.push("A și B au același număr de înmatriculare. Verificați plăcuțele în poze.");
  else if (samePolicy) out.push("A și B au același număr de poliță. Verificați polițele în acte.");
  if (shared("circumstances")) out.push("Amândoi declară că erau opriți. Lămuriți cu ei cine se deplasa.");
  for (const c of checks) if (c.role !== null) out.push(`${c.text}.`);
  return out;
}
