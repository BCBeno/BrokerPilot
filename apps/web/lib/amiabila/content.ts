/**
 * Textele și listele fixe ale wizard-ului de amiabilă (în română).
 *
 * De verificat la S4b (scrape din surse oficiale): formularea condițiilor de eligibilitate și a celor 17 circumstanțe
 * din formularul european de constatare amiabilă. Până atunci, textele sunt formulări curente, marcate ca orientative în UI.
 */

export const ELIGIBILITY_KEYS = ["twoVehicles", "onlyMaterialDamage", "bothInsured", "agreed"] as const;
export type EligibilityKey = (typeof ELIGIBILITY_KEYS)[number];

export const ELIGIBILITY_QUESTIONS: Record<
  EligibilityKey,
  { question: string; hint: string; yes: string; no: string; blockedReason: string }
> = {
  twoVehicles: {
    question: "Câte vehicule sunt implicate?",
    hint: "Amiabila se completează între două vehicule.",
    yes: "Exact două vehicule",
    no: "Mai multe de două",
    blockedReason: "Amiabila se poate completa doar când sunt implicate exact două vehicule.",
  },
  onlyMaterialDamage: {
    question: "Sunt doar pagube materiale?",
    hint: "Fără persoane rănite.",
    yes: "Da, doar pagube la mașini",
    no: "Nu, cineva e rănit",
    blockedReason: "Dacă există persoane rănite, accidentul trebuie constatat de poliție.",
  },
  bothInsured: {
    question: "Au ambele vehicule RCA valabil?",
    hint: "Polița trebuie să fie în termen la momentul accidentului.",
    yes: "Da, ambele au RCA valabil",
    no: "Nu, unul nu are RCA valabil",
    blockedReason: "Amiabila se folosește doar când ambele vehicule au RCA valabil.",
  },
  agreed: {
    question: "Sunteți de acord cum s-a produs accidentul?",
    hint: "Contează cum s-a întâmplat, nu cine e vinovat.",
    yes: "Da, suntem de acord",
    no: "Nu, avem păreri diferite",
    blockedReason: "Dacă nu sunteți de acord asupra împrejurărilor, poliția trebuie să constate accidentul.",
  },
};

/** Cele 17 circumstanțe ale formularului european de constatare amiabilă (numerotarea e cea oficială). */
export const CIRCUMSTANCES: readonly { n: number; label: string }[] = [
  { n: 1, label: "staționa" },
  { n: 2, label: "pornea de pe un loc de staționare / deschidea o portieră" },
  { n: 3, label: "parca" },
  { n: 4, label: "ieșea dintr-un parcaj, dintr-un loc privat sau dintr-un drum de pământ" },
  { n: 5, label: "intra într-un parcaj, într-un loc privat sau pe un drum de pământ" },
  { n: 6, label: "intra într-un sens giratoriu" },
  { n: 7, label: "circula într-un sens giratoriu" },
  { n: 8, label: "lovea din spate un vehicul care circula în același sens, pe aceeași bandă" },
  { n: 9, label: "circula în același sens, dar pe altă bandă" },
  { n: 10, label: "schimba banda" },
  { n: 11, label: "depășea" },
  { n: 12, label: "vira la dreapta" },
  { n: 13, label: "vira la stânga" },
  { n: 14, label: "mergea cu spatele" },
  { n: 15, label: "a intrat pe o bandă rezervată circulației din sens opus" },
  { n: 16, label: "venea din dreapta, la o intersecție" },
  { n: 17, label: "nu a respectat un indicator de prioritate sau semaforul" },
];

/**
 * Formularea tipărită pe formularul oficial, caseta 12 (anexa nr. 7 la Norma ASF 20/2017), în ordinea 1–17.
 * Wizard-ul folosește formulări mai prietenoase (`CIRCUMSTANCES`); documentul generat le folosește pe acestea.
 */
export const FORM_CIRCUMSTANCES: readonly string[] = [
  "în staționare / oprit",
  "la momentul plecării / deschizând portiera",
  "la momentul opririi",
  "ieșind dintr-o parcare auto, loc privat, drum de pământ",
  "intrând într-o parcare auto, loc privat, drum de pământ",
  "intrând într-un sens giratoriu",
  "circulând într-un sens giratoriu",
  "lovind spatele unui vehicul în timpul deplasării pe același sens și pe aceeași bandă",
  "deplasându-se în același sens dar pe benzi de circulație diferite",
  "schimbând banda de circulație",
  "depășind",
  "virând la dreapta",
  "virând la stânga",
  "mergând cu spatele",
  "intrând pe banda destinată pentru circulația în sens opus",
  "venind din dreapta (într-o intersecție)",
  "neobservând indicatorul de prioritate sau lumina roșie a semaforului",
];

export const IMPACT_ZONES = [
  "front-left",
  "front",
  "front-right",
  "left",
  "right",
  "rear-left",
  "rear",
  "rear-right",
] as const;
export type ImpactZone = (typeof IMPACT_ZONES)[number];

export const IMPACT_LABELS: Record<ImpactZone, string> = {
  "front-left": "Față stânga",
  front: "Față",
  "front-right": "Față dreapta",
  left: "Lateral stânga",
  right: "Lateral dreapta",
  "rear-left": "Spate stânga",
  rear: "Spate",
  "rear-right": "Spate dreapta",
};

export const DISCLAIMER =
  "Documentul generat e un instrument de asistență și nu înlocuiește procedura oficială. Termenele legale se confirmă la asigurător.";
