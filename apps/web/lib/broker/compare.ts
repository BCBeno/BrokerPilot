import type { FormData, Party } from "@/lib/amiabila/form";

/** Rândurile fișei comparative pe care o verificare le poate marca. */
export type CheckField = "vehicle" | "policy" | "license" | "circumstances";

export type CrossCheck = {
  level: "danger" | "warn";
  text: string;
  field: CheckField;
  /** Coloana marcată; `null` = ambele. */
  role: "A" | "B" | null;
};

/** „ZZ.LL.AAAA” → „AAAALLZZ” (comparabil ca text); orice altceva → null. */
export function dayKey(ro: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ro.trim());
  return m ? `${m[3]}${m[2]}${m[1]}` : null;
}

const norm = (s: string) => s.toUpperCase().replace(/[\s-]+/g, "");
const hasData = (p: Party) => Boolean(p.vehicle.plate || p.driver.surname || p.insurance.company);

/**
 * Verificări încrucișate pe care brokerul le-ar face cu ochiul: număr identic la A și B, poliță sau permis
 * nevalabil la data accidentului, ambii „în staționare”. Determinist, fără AI; doar semnalează, nu blochează.
 */
export function crossChecks(form: FormData): CrossCheck[] {
  const out: CrossCheck[] = [];
  const accident = dayKey(form.date);
  const parties = [
    ["A", form.a],
    ["B", form.b],
  ] as const;

  if (hasData(form.a) && hasData(form.b)) {
    if (form.a.vehicle.plate && norm(form.a.vehicle.plate) === norm(form.b.vehicle.plate)) {
      out.push({ level: "danger", field: "vehicle", role: null, text: "Același număr de înmatriculare la A și B" });
    }
    if (form.a.insurance.policyNo && norm(form.a.insurance.policyNo) === norm(form.b.insurance.policyNo)) {
      out.push({ level: "warn", field: "policy", role: null, text: "Același număr de poliță la A și B" });
    }
    if (form.a.circumstances.includes(1) && form.b.circumstances.includes(1)) {
      out.push({ level: "warn", field: "circumstances", role: null, text: "Ambii șoferi declară că erau în staționare / opriți" });
    }
  }

  if (accident) {
    for (const [role, p] of parties) {
      const to = dayKey(p.insurance.validTo);
      const from = dayKey(p.insurance.validFrom);
      if (to && to < accident) {
        out.push({ level: "danger", field: "policy", role, text: `Polița RCA a lui ${role} expirase la data accidentului (${p.insurance.validTo})` });
      } else if (from && from > accident) {
        out.push({ level: "danger", field: "policy", role, text: `Polița RCA a lui ${role} nu era încă valabilă (de la ${p.insurance.validFrom})` });
      }
      const lic = dayKey(p.driver.licenseValidTo);
      if (lic && lic < accident) {
        out.push({ level: "warn", field: "license", role, text: `Permisul lui ${role} era expirat (${p.driver.licenseValidTo})` });
      }
    }
  }
  return out;
}
