import { describe, expect, it } from "vitest";
import { decideLink, namesMatch, trustedCandidates, type PhoneCheck } from "./link-client";

const C1 = "21000000-0000-4000-8000-000000000001";
const C2 = "21000000-0000-4000-8000-000000000002";

describe("decideLink", () => {
  it("fără candidați nu leagă", () => {
    expect(decideLink([])).toBeNull();
  });

  it("polița are prioritate față de numărul de înmatriculare", () => {
    expect(
      decideLink([
        { client_id: C2, method: "plate" },
        { client_id: C1, method: "policy" },
      ]),
    ).toEqual({ clientId: C1, method: "policy" });
  });

  it("aceeași persoană găsită de două ori după poliță rămâne o singură potrivire", () => {
    expect(
      decideLink([
        { client_id: C1, method: "policy" },
        { client_id: C1, method: "policy" },
      ]),
    ).toEqual({ clientId: C1, method: "policy" });
  });

  it("poliță ambiguă (doi clienți) nu leagă, nici după număr", () => {
    expect(
      decideLink([
        { client_id: C1, method: "policy" },
        { client_id: C2, method: "policy" },
        { client_id: C1, method: "plate" },
      ]),
    ).toBeNull();
  });

  it("fără poliță: un singur client după număr", () => {
    expect(decideLink([{ client_id: C2, method: "plate" }])).toEqual({ clientId: C2, method: "plate" });
  });

  it("număr de înmatriculare la doi clienți nu leagă", () => {
    expect(
      decideLink([
        { client_id: C1, method: "plate" },
        { client_id: C2, method: "plate" },
      ]),
    ).toBeNull();
  });

  it("fără poliță și fără număr: un singur client după telefon", () => {
    expect(decideLink([{ client_id: C1, method: "phone" }])).toEqual({ clientId: C1, method: "phone" });
  });

  it("numărul de înmatriculare are prioritate față de telefon", () => {
    expect(
      decideLink([
        { client_id: C1, method: "phone" },
        { client_id: C2, method: "plate" },
      ]),
    ).toEqual({ clientId: C2, method: "plate" });
  });

  it("telefon comun la doi clienți (ex. familie) nu leagă", () => {
    expect(
      decideLink([
        { client_id: C1, method: "phone" },
        { client_id: C2, method: "phone" },
      ]),
    ).toBeNull();
  });
});

describe("namesMatch", () => {
  it("un cuvânt comun ajunge, fără diacritice, majuscule sau ordine", () => {
    expect(namesMatch("BENI CIRCIU", "Beni Circiu")).toBe(true);
    expect(namesMatch("POPESCU ION", "Ion Popescu")).toBe(true);
    expect(namesMatch("Ștefan Țurcanu", "Stefan Turcanu")).toBe(true);
    expect(namesMatch("Beni xiricu", "Beni Circiu")).toBe(true);
  });

  it("fără cuvânt comun, cu nume lipsă sau doar inițiale: nu", () => {
    expect(namesMatch("Uu uu", "Beni Circiu")).toBe(false);
    expect(namesMatch(null, "Beni Circiu")).toBe(false);
    expect(namesMatch("B. C.", "Beni Circiu")).toBe(false);
  });
});

describe("trustedCandidates", () => {
  const check = (driverName: string | null, otherClientId: string | null = null): PhoneCheck => ({
    driverName,
    otherClientId,
    clientNames: new Map([
      [C1, "Beni Circiu"],
      [C2, "Andreea Grigore"],
    ]),
  });

  it("telefon + nume potrivit: rămâne și leagă", () => {
    const c = trustedCandidates([{ client_id: C1, method: "phone" }], check("CIRCIU BENI"));
    expect(decideLink(c)).toEqual({ clientId: C1, method: "phone" });
  });

  it("telefon cu alt nume (o persoană a completat ambele părți): nu leagă", () => {
    expect(trustedCandidates([{ client_id: C1, method: "phone" }], check("Uu uu"))).toEqual([]);
  });

  it("telefonul clientului de pe cealaltă parte nu leagă, nici cu același nume", () => {
    expect(trustedCandidates([{ client_id: C1, method: "phone" }], check("Beni Circiu", C1))).toEqual([]);
  });

  it("polița și numărul rămân, chiar dacă e clientul de pe cealaltă parte (flotă, familie)", () => {
    const c = trustedCandidates(
      [
        { client_id: C1, method: "policy" },
        { client_id: C1, method: "plate" },
      ],
      check("Altcineva", C1),
    );
    expect(decideLink(c)).toEqual({ clientId: C1, method: "policy" });
  });

  it("un candidat respins după telefon nu-l mai face ambiguu pe cel bun", () => {
    const c = trustedCandidates(
      [
        { client_id: C1, method: "phone" },
        { client_id: C2, method: "phone" },
      ],
      check("Andreea Grigore"),
    );
    expect(decideLink(c)).toEqual({ clientId: C2, method: "phone" });
  });
});
