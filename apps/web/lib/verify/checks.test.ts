import { describe, expect, it } from "vitest";
import { checkAmounts, checkDates, compareNames, crossCheckDocuments, parseAmount, runDeterministicChecks, type DocFields } from "./checks";

const NOW = new Date("2026-11-12T10:00:00Z");
const ctx = { now: NOW };

const good: DocFields = {
  type: "RCA",
  policyNo: "FX-RCA-0001",
  holderName: "Andreea Grigore",
  holderCnp: "2971001185821",
  holderBirthDate: "01.10.1997",
  plate: "B 200 TST",
  vin: "TSTSPEC0000000001",
  validFrom: "29.09.2026",
  validTo: "29.09.2027",
  issuedOn: "28.09.2026",
  premiumTotal: "1.250,00",
  installments: "4",
  installmentAmount: "312,50",
  premiumCurrency: "RON",
  installmentCurrency: "lei",
  iban: "RO49 AAAA 1B31 0075 9384 0000",
};

const ids = (issues: { id: string }[]) => issues.map((i) => i.id);

describe("poliță corectă", () => {
  it("nu produce nicio problemă", () => {
    expect(runDeterministicChecks(good, ctx)).toEqual([]);
  });
});

describe("date", () => {
  it("prinde 2037 în loc de 2027 și propune anul probabil", () => {
    const issues = checkDates({ ...good, validTo: "29.09.2037" }, ctx);
    expect(ids(issues)).toEqual(["dates-too-long"]);
    expect(issues[0]?.severity).toBe("critical");
    expect(issues[0]?.explanation).toMatch(/11 ani/);
    expect(issues[0]?.suggestedFix).toContain("29.09.2027");
  });

  it("expirarea înainte de început sau egală cu el", () => {
    expect(ids(checkDates({ ...good, validTo: "01.09.2026" }, ctx))).toContain("dates-order");
    expect(ids(checkDates({ ...good, validTo: "29.09.2026" }, ctx))).toContain("dates-order");
  });

  it("dată inexistentă sau în format greșit", () => {
    expect(ids(checkDates({ ...good, validTo: "31.02.2027" }, ctx))).toContain("date-format:validTo");
    expect(ids(checkDates({ ...good, validFrom: "mâine" }, ctx))).toContain("date-format:validFrom");
  });

  it("RCA prea scurtă; începe prea departe în viitor", () => {
    expect(ids(checkDates({ ...good, validTo: "05.10.2026" }, ctx))).toContain("dates-too-short");
    const far = checkDates({ ...good, validFrom: "01.06.2027", validTo: "01.06.2028", issuedOn: undefined }, ctx);
    expect(ids(far)).toContain("start-far-future");
  });

  it("emisă după început sau în viitor", () => {
    expect(ids(checkDates({ ...good, issuedOn: "30.09.2026" }, ctx))).toContain("issued-after-start");
    expect(ids(checkDates({ ...good, issuedOn: "01.01.2030" }, ctx))).toContain("issued-future");
  });

  it("vârstă imposibilă pentru un șofer", () => {
    expect(ids(checkDates({ ...good, holderBirthDate: "01.10.2015" }, ctx))).toContain("birth-implausible");
    expect(ids(checkDates({ ...good, holderBirthDate: "01.10.1900" }, ctx))).toContain("birth-implausible");
  });

  it("viața poate dura ani, RCA nu", () => {
    const life = { ...good, type: "VIATA" as const, validTo: "29.09.2036" };
    expect(checkDates(life, ctx)).toEqual([]);
  });
});

describe("identificatori", () => {
  it("CNP cu cifră de control greșită", () => {
    expect(ids(runDeterministicChecks({ ...good, holderCnp: "2971001185822" }, ctx))).toContain("cnp-control");
  });

  it("data nașterii care nu se potrivește cu CNP-ul", () => {
    const issues = runDeterministicChecks({ ...good, holderBirthDate: "02.10.1997" }, ctx);
    expect(ids(issues)).toContain("cnp-birth-mismatch");
  });

  it("VIN cu O/I/Q, plăcuță fără format, județ inexistent, IBAN stricat", () => {
    expect(ids(runDeterministicChecks({ ...good, vin: "TSTSPEC000000000O" }, ctx))).toContain("vin-format");
    expect(ids(runDeterministicChecks({ ...good, plate: "ABC 123" }, ctx))).toContain("plate-format");
    expect(ids(runDeterministicChecks({ ...good, plate: "XX 12 ABC" }, ctx))).toContain("plate-county");
    expect(ids(runDeterministicChecks({ ...good, iban: "RO48 AAAA 1B31 0075 9384 0000" }, ctx))).toContain("iban-invalid");
  });

  it("câmpurile lipsă nu produc probleme (le prinde pasul AI / lista de câmpuri obligatorii)", () => {
    expect(runDeterministicChecks({}, ctx)).toEqual([]);
  });
});

describe("sume", () => {
  it("parsează formatele românești și englezești", () => {
    expect(parseAmount("1.250,00")).toBe(1250);
    expect(parseAmount("1250.50")).toBe(1250.5);
    expect(parseAmount("1 250,5 lei")).toBe(1250.5);
    expect(parseAmount("1.250")).toBe(1250);
    expect(parseAmount("abc")).toBeNull();
  });

  it("rate × număr ≠ total", () => {
    const issues = checkAmounts({ ...good, installmentAmount: "300,00" });
    expect(ids(issues)).toEqual(["installments-sum"]);
  });

  it("rotunjirea de câțiva bani nu e eroare", () => {
    expect(checkAmounts({ ...good, premiumTotal: "1000,00", installments: "3", installmentAmount: "333,33" })).toEqual([]);
  });

  it("prima 0 și moneda diferită", () => {
    expect(ids(checkAmounts({ premiumTotal: "0,00" }))).toContain("premium-zero");
    expect(ids(checkAmounts({ ...good, installmentCurrency: "EUR" }))).toContain("currency-mismatch");
  });
});

describe("nume", () => {
  it("fără diacritice și în orice ordine = același nume", () => {
    expect(compareNames("Șerban Țurcanu", "Turcanu Serban")).toBe("same");
  });

  it("„Popecu” vs „Popescu” e typo, nu alt om", () => {
    expect(compareNames("Ion Popecu", "Ion Popescu")).toBe("typo");
    expect(compareNames("Ion Popescu", "Maria Ionescu")).toBe("different");
  });
});

describe("verificare încrucișată", () => {
  const reference = { name: "Andreea Grigore", plate: "B 200 TST", vin: "TSTSPEC0000000001" };

  it("față de baza de date: typo în nume, plăcuță și VIN diferite", () => {
    const issues = runDeterministicChecks({ ...good, holderName: "Andrea Grigore", plate: "B 201 TST", vin: "TSTSPEC0000000002" }, { now: NOW, reference });
    expect(ids(issues)).toEqual(expect.arrayContaining(["name-typo", "plate-mismatch", "vin-mismatch"]));
    expect(issues.find((i) => i.id === "name-typo")?.severity).toBe("warning");
  });

  it("titular cu totul diferit e eroare, nu avertisment", () => {
    const issues = runDeterministicChecks({ ...good, holderName: "Mihai Radu" }, { now: NOW, reference });
    expect(issues.find((i) => i.id === "name-different")?.severity).toBe("critical");
  });

  it("între documente: talon, poliță, constatare", () => {
    const issues = crossCheckDocuments([
      { label: "talon", fields: { plate: "B 200 TST", vin: "TSTSPEC0000000001", holderName: "Andreea Grigore" } },
      { label: "poliță", fields: { plate: "b-200-tst", vin: "TSTSPEC0000000001", holderName: "Grigore Andreea" } },
      { label: "constatare", fields: { plate: "B 200 TSV", holderName: "Andreea Grigore" } },
    ]);
    expect(ids(issues)).toEqual(["cross-plate:constatare"]);
  });
});
