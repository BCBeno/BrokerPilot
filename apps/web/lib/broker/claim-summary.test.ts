import { describe, expect, it } from "vitest";
import type { MissingItem } from "@/lib/claims/completeness";
import { summarizeClaim } from "./claim-summary";
import type { CrossCheck } from "./compare";

const m = (code: string, blocking = true): MissingItem => ({ code, label: code, blocking });

describe("summarizeClaim", () => {
  it("spune o singură dată ce lipsește la amândoi, nu o bulină pe rol", () => {
    const s = summarizeClaim([m("docs_A"), m("docs_B"), m("signature_A"), m("signature_B")], []);
    expect(s.tone).toBe("work");
    expect(s.status).toEqual(["Niciun șofer n-a semnat încă.", "Actele sunt incomplete la amândoi."]);
    expect(s.docsIncomplete).toEqual(["A", "B"]);
  });

  it("când B n-a trimis datele, nu mai enumeră și restul lipsurilor lui B", () => {
    const s = summarizeClaim([m("party_B"), m("signature_A"), m("signature_B"), m("photos_B", false), m("sketch", false)], []);
    expect(s.status).toEqual(["Șoferul B nu și-a trimis încă datele.", "Șoferul A n-a semnat încă."]);
    expect(s.extras).toBeNull();
  });

  it("dosar complet: o propoziție, iar ce nu blochează vine ca „Ar ajuta”", () => {
    const s = summarizeClaim([m("photos_A", false), m("photos_B", false), m("sketch", false)], []);
    expect(s.tone).toBe("ok");
    expect(s.status).toEqual(["Complet: actele, circumstanțele și semnăturile sunt la dosar."]);
    expect(s.extras).toBe("Ar ajuta: poze cu daunele ambelor vehicule și schița accidentului.");
  });

  it("aceeași mașină și aceeași poliță devin o singură concluzie", () => {
    const checks: CrossCheck[] = [
      { level: "danger", field: "vehicle", role: null, text: "Același număr de înmatriculare la A și B" },
      { level: "warn", field: "policy", role: null, text: "Același număr de poliță la A și B" },
      { level: "warn", field: "license", role: "B", text: "Permisul lui B era expirat (01.01.2026)" },
    ];
    expect(summarizeClaim([], checks).warnings).toEqual([
      "A și B au aceeași mașină și aceeași poliță. Probabil un șofer a completat datele celuilalt.",
      "Permisul lui B era expirat (01.01.2026).",
    ]);
  });
});
