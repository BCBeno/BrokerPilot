import { type ImpactZone } from "./content";
import type { Draft } from "./draft";
import { fieldValue } from "./documents";
import type { Sketch } from "./sketch";

/**
 * Datele formularului „Constatare amiabilă de accident” (anexa nr. 7 la Norma ASF 20/2017), pe casetele lui.
 * Sunt separate de ciorna wizard-ului: ciorna ține ce a răspuns șoferul, iar `FormData` e ce se tipărește.
 * Ce nu știm încă (șoferul B, martori, semnături, schiță) rămâne gol, ca pe hârtie.
 */

export type YesNo = boolean | null;

export type Party = {
  /** Caseta 6: asigurat / deținător poliță. */
  holder: { surname: string; firstName: string; address: string; postalCode: string; country: string; contact: string };
  /** Caseta 7: vehicul cu motor și remorcă. */
  vehicle: { makeType: string; plate: string; country: string; trailerPlate: string; trailerCountry: string };
  /** Caseta 8: societatea de asigurare. */
  insurance: {
    company: string;
    policyNo: string;
    greenCardNo: string;
    validFrom: string;
    validTo: string;
    branchName: string;
    branchAddress: string;
    branchCountry: string;
    branchContact: string;
    casco: YesNo;
  };
  /** Caseta 9: conducător. */
  driver: {
    surname: string;
    firstName: string;
    birthDate: string;
    address: string;
    country: string;
    contact: string;
    licenseNo: string;
    category: string;
    licenseValidTo: string;
  };
  /** Caseta 10. */
  impactPoint: ImpactZone | null;
  /** Caseta 11. */
  visibleDamage: string;
  /** Caseta 12: numerele căsuțelor bifate. */
  circumstances: number[];
  /** Caseta 14. */
  observations: string;
  /** Caseta 15: semnătura ca data URL (imagine), dacă există. */
  signature: string | null;
};

export type FormData = {
  /** Caseta 1. */
  date: string;
  time: string;
  /** Caseta 2. */
  country: string;
  place: string;
  /** Caseta 3. */
  injured: YesNo;
  /** Caseta 4. */
  otherVehiclesDamaged: YesNo;
  otherObjectsDamaged: YesNo;
  /** Caseta 5. */
  witnesses: string;
  a: Party;
  b: Party;
  /** Caseta 13. */
  sketch: Sketch | null;
  /** Specimen: se tipărește filigranul „SPECIMEN”. */
  specimen: boolean;
};

export function emptyParty(): Party {
  return {
    holder: { surname: "", firstName: "", address: "", postalCode: "", country: "", contact: "" },
    vehicle: { makeType: "", plate: "", country: "", trailerPlate: "", trailerCountry: "" },
    insurance: {
      company: "",
      policyNo: "",
      greenCardNo: "",
      validFrom: "",
      validTo: "",
      branchName: "",
      branchAddress: "",
      branchCountry: "",
      branchContact: "",
      casco: null,
    },
    driver: {
      surname: "",
      firstName: "",
      birthDate: "",
      address: "",
      country: "",
      contact: "",
      licenseNo: "",
      category: "",
      licenseValidTo: "",
    },
    impactPoint: null,
    visibleDamage: "",
    circumstances: [],
    observations: "",
    signature: null,
  };
}

export function emptyForm(): FormData {
  return {
    date: "",
    time: "",
    country: "",
    place: "",
    injured: null,
    otherVehiclesDamaged: null,
    otherObjectsDamaged: null,
    witnesses: "",
    a: emptyParty(),
    b: emptyParty(),
    sketch: null,
    specimen: false,
  };
}

/** „ISO YYYY-MM-DD” → „ZZ.LL.AAAA”. Orice altceva se întoarce neschimbat. */
export function formatFormDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Pe talon și permis numele apare „NUME Prenume”; primul cuvânt e numele de familie. */
export function splitName(full: string): { surname: string; firstName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { surname: "", firstName: "" };
  return { surname: parts[0], firstName: parts.slice(1).join(" ") };
}

const TZ = "Europe/Bucharest";

function splitWhen(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const date = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("ro-RO", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date, time };
}

/** Mapează ciorna șoferului A pe formular. Șoferul B vine în S3; până atunci coloana lui rămâne goală. */
export function buildForm(draft: Draft): FormData {
  const { place, documents, circumstances, eligibility } = draft;
  const when = splitWhen(place.occurredAt);
  const reg = documents.registration;
  const lic = documents.license;
  const pol = documents.policy;
  // Titularul nu se mai extrage din talon (minimizare, ADR-0001); implicit e șoferul din permis.
  const holder = splitName(fieldValue(reg, "holderName") || fieldValue(lic, "fullName"));
  const driver = splitName(fieldValue(lic, "fullName"));
  const makeType = [fieldValue(reg, "make"), fieldValue(reg, "model")].filter(Boolean).join(" ");
  const hasPlace = place.address.trim().length > 0;

  const a = emptyParty();
  a.holder = { ...a.holder, ...holder, country: reg ? "România" : "" };
  a.vehicle = {
    ...a.vehicle,
    makeType,
    plate: fieldValue(reg, "plate") || fieldValue(pol, "plate"),
    country: reg ? "România" : "",
  };
  a.insurance = {
    ...a.insurance,
    company: fieldValue(pol, "insurer"),
    policyNo: fieldValue(pol, "policyNo"),
    validFrom: formatFormDate(fieldValue(pol, "validFrom")),
    validTo: formatFormDate(fieldValue(pol, "validTo")),
  };
  a.driver = {
    ...a.driver,
    ...driver,
    licenseNo: fieldValue(lic, "licenseNo"),
    category: fieldValue(lic, "categories"),
    licenseValidTo: formatFormDate(fieldValue(lic, "expiresOn")),
  };
  a.impactPoint = circumstances.impact;
  a.visibleDamage = circumstances.damage;
  a.circumstances = [...circumstances.checked];
  a.observations = circumstances.notes;

  return {
    ...emptyForm(),
    date: when.date,
    time: when.time,
    country: hasPlace ? "România" : "",
    place: place.address,
    injured: draft.injured,
    otherVehiclesDamaged: eligibility.twoVehicles === true ? false : null,
    a,
    b: emptyParty(),
    sketch: draft.sketch,
  };
}

/** Numărul de căsuțe bifate, pentru rândul „specificați numărul de căsuțe marcate cu X”. */
export function countChecked(party: Party): number {
  return new Set(party.circumstances).size;
}
