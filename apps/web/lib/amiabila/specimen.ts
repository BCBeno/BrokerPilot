import { emptyForm, type FormData } from "./form";
import type { Sketch } from "./sketch";

/**
 * Formular complet completat, cu date inventate (fixtures fictive, marcat SPECIMEN).
 * Servește la demo, la capturi de ecran și la verificarea machetei fără să parcurgem tot wizard-ul.
 */

/** Semnătură de mântuială, desenată ca SVG, ca să avem ceva în caseta 15 fără date reale. */
function scribble(seed: 1 | 2): string {
  const d =
    seed === 1
      ? "M6 34 C14 4 22 4 24 22 S30 40 38 16 S52 6 56 26 S70 30 74 12 L96 30 C104 34 110 20 118 24"
      : "M8 28 C16 36 22 8 30 12 S38 40 46 22 S60 4 66 20 S84 36 92 14 C100 6 108 30 116 20";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 124 44"><path d="${d}" fill="none" stroke="#1d3a8a" stroke-width="2" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SPECIMEN_SKETCH: Sketch = {
  mode: "template",
  road: "crossing",
  streetNames: ["Bd. Demonstrației", "Str. Exemplului"],
  vehicles: {
    A: {
      x: 236,
      y: 107,
      angle: -40,
      path: [
        { x: 240, y: 214 },
        { x: 238, y: 168 },
        { x: 236, y: 140 },
      ],
    },
    B: {
      x: 266,
      y: 95,
      angle: -90,
      path: [
        { x: 420, y: 95 },
        { x: 296, y: 95 },
      ],
    },
  },
  signs: [
    { kind: "yield", x: 278, y: 188 },
    { kind: "priority", x: 340, y: 58 },
  ],
};

export function specimenForm(): FormData {
  const base = emptyForm();
  return {
    ...base,
    specimen: true,
    date: "10.11.2026",
    time: "08:45",
    country: "România",
    place: "Intersecția Str. Exemplului cu Bd. Demonstrației, București",
    injured: false,
    otherVehiclesDamaged: false,
    otherObjectsDamaged: false,
    witnesses: "Martor Exemplu, Str. Test 1, București, tel. 0700 000 003 (pieton, nu a fost în vehicul)",
    a: {
      holder: {
        surname: "IONESCU",
        firstName: "Mihai",
        address: "Str. Fictivă 12, ap. 3, București",
        postalCode: "030000",
        country: "România",
        contact: "0700 000 001 / mihai@example.ro",
      },
      vehicle: { makeType: "Dacia Logan", plate: "B 123 ABC", country: "România", trailerPlate: "", trailerCountry: "" },
      insurance: {
        company: "Asigurări Demo S.A.",
        policyNo: "RO/40/DEM/1234567",
        greenCardNo: "",
        validFrom: "01.03.2026",
        validTo: "28.02.2027",
        branchName: "Sucursala București Demo",
        branchAddress: "Calea Exemplu 10, București",
        branchCountry: "România",
        branchContact: "0800 000 000",
        casco: false,
      },
      driver: {
        surname: "IONESCU",
        firstName: "Mihai",
        birthDate: "14.05.1988",
        address: "Str. Fictivă 12, ap. 3, București",
        country: "România",
        contact: "0700 000 001",
        licenseNo: "B0000001",
        category: "B",
        licenseValidTo: "20.09.2031",
      },
      impactPoint: "right",
      visibleDamage: "Portieră dreapta față și aripă dreapta îndoite, oglindă dreapta ruptă.",
      circumstances: [13],
      observations: "Am semnalizat la stânga și am început virajul de pe Str. Exemplului. Celălalt vehicul a venit din dreapta, pe Bd. Demonstrației, și m-a lovit în lateral.",
      signature: scribble(1),
    },
    b: {
      holder: {
        surname: "POPESCU",
        firstName: "Elena",
        address: "Str. Imaginară 5, Cluj-Napoca",
        postalCode: "400000",
        country: "România",
        contact: "0700 000 002 / elena@example.ro",
      },
      vehicle: { makeType: "Volkswagen Golf", plate: "CJ 45 XYZ", country: "România", trailerPlate: "", trailerCountry: "" },
      insurance: {
        company: "Garanție Demo Asigurări",
        policyNo: "RO/22/GDA/7654321",
        greenCardNo: "",
        validFrom: "15.01.2026",
        validTo: "14.01.2027",
        branchName: "Agenția Cluj Demo",
        branchAddress: "Str. Test 7, Cluj-Napoca",
        branchCountry: "România",
        branchContact: "agentie@example.ro",
        casco: true,
      },
      driver: {
        surname: "POPESCU",
        firstName: "Elena",
        birthDate: "02.11.1991",
        address: "Str. Imaginară 5, Cluj-Napoca",
        country: "România",
        contact: "0700 000 002",
        licenseNo: "B0000002",
        category: "B",
        licenseValidTo: "11.06.2030",
      },
      impactPoint: "front",
      visibleDamage: "Bară față și capotă deformate, grilă spartă.",
      circumstances: [16],
      observations: "Circulam pe Bd. Demonstrației. Celălalt vehicul a virat în fața mea.",
      signature: scribble(2),
    },
    sketch: SPECIMEN_SKETCH,
  };
}
