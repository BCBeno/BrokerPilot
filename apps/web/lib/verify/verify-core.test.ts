import { describe, expect, it } from "vitest";
import { cnpControlDigit, isValidCnp, isValidIban, parseCnp, plateCountyExists } from "./ids";
import { assertRedacted, findLeaks, PiiLeakError, redact, rehydrate } from "./redact";

const NOW = new Date("2026-11-12T10:00:00Z");

describe("CNP", () => {
  it("acceptă CNP-urile fictive din fixtures", () => {
    expect(isValidCnp("2971001185821", NOW)).toBe(true);
    expect(isValidCnp("1930116022331", NOW)).toBe(true);
  });

  it("calculează cifra de control și scoate data nașterii și sexul", () => {
    expect(cnpControlDigit("297100118582")).toBe(1);
    expect(parseCnp("2971001185821", NOW)).toEqual({ birthDate: "1997-10-01", sex: "F", controlOk: true });
    expect(parseCnp("1930116022331", NOW)?.sex).toBe("M");
  });

  it("recunoaște secolul 2000 (5/6) și 1800 (3/4)", () => {
    expect(parseCnp("5100101400017", NOW)?.birthDate).toBe("2010-01-01");
    expect(parseCnp("3500101400012", NOW)?.birthDate).toBe("1850-01-01");
  });

  it("prinde o cifră de control greșită, dar tot îl tratează ca structură de CNP", () => {
    const info = parseCnp("2971001185822", NOW);
    expect(info?.controlOk).toBe(false);
    expect(info?.birthDate).toBe("1997-10-01");
  });

  it("respinge lungimi greșite, litere, date inexistente și prima cifră 0", () => {
    expect(parseCnp("29710011858", NOW)).toBeNull();
    expect(parseCnp("29710011858AB", NOW)).toBeNull();
    expect(parseCnp("2970231185821", NOW)).toBeNull(); // 31 februarie
    expect(parseCnp("0971001185821", NOW)).toBeNull();
  });

  it("județ inexistent (47) → cifra de control nu mai contează", () => {
    const first12 = "297100147582";
    const cnp = first12 + cnpControlDigit(first12);
    expect(parseCnp(cnp, NOW)?.controlOk).toBe(false);
  });
});

describe("IBAN", () => {
  it("acceptă un IBAN românesc valid, cu sau fără spații", () => {
    expect(isValidIban("RO49AAAA1B31007593840000")).toBe(true);
    expect(isValidIban("RO49 AAAA 1B31 0075 9384 0000")).toBe(true);
  });

  it("respinge cifra de control greșită, lungimea greșită și textul oarecare", () => {
    expect(isValidIban("RO48AAAA1B31007593840000")).toBe(false);
    expect(isValidIban("RO49AAAA1B3100759384000")).toBe(false);
    expect(isValidIban("nu este iban")).toBe(false);
  });
});

describe("județe pe plăcuță", () => {
  it("cunoaște județele reale și respinge pe cele inventate", () => {
    expect(plateCountyExists("CJ 12 ABC")).toBe(true);
    expect(plateCountyExists("B 123 ABC")).toBe(true);
    expect(plateCountyExists("XX 12 ABC")).toBe(false);
  });
});

describe("redact", () => {
  const sample = [
    "Poliță RCA seria FX-RCA-0001",
    "Asigurat: Andreea Grigore, CNP 2971001185821, născută la 01.10.1997",
    "Telefon: 0722 123 456 / +40 733 456 789, email: andreea.grigore@example.test",
    "Autovehicul B 200 TST, VIN TSTSPEC0000000001, IBAN RO49 AAAA 1B31 0075 9384 0000",
    "Valabilă 29.09.2026 – 29.09.2027, prima de 1.250,00 RON",
  ].join("\n");

  it("scoate CNP, telefoane, email, plăcuță, VIN, IBAN, poliță, data nașterii și numele", () => {
    const { text, counts } = redact(sample, { knownNames: ["Andreea Grigore"] });
    for (const secret of ["2971001185821", "0722", "+40 733", "andreea.grigore", "B 200 TST", "TSTSPEC0000000001", "RO49", "FX-RCA-0001", "Grigore", "Andreea", "01.10.1997"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain("<CNP_1>");
    expect(text).toContain("<TEL_1>");
    expect(text).toContain("<TEL_2>");
    expect(text).toContain("<EMAIL_1>");
    expect(text).toContain("<PLATE_1>");
    expect(text).toContain("<VIN_1>");
    expect(text).toContain("<IBAN_1>");
    expect(text).toContain("<POLITA_1>");
    expect(text).toContain("<DATA_NASTERE_1>");
    expect(text).toContain("<NUME_1>");
    expect(counts.CNP).toBe(1);
  });

  it("păstrează datele contractuale și sumele, ca AI-ul să le poată verifica", () => {
    const { text } = redact(sample, { knownNames: ["Andreea Grigore"] });
    expect(text).toContain("29.09.2026 – 29.09.2027");
    expect(text).toContain("1.250,00 RON");
  });

  it("același lucru → același token, în orice formă de scriere", () => {
    const { text } = redact("B 200 TST, apoi b-200-tst, apoi B200TST. CNP 2971001185821 și 2971001185821.");
    expect(text.match(/<PLATE_1>/g)).toHaveLength(3);
    expect(text.match(/<CNP_1>/g)).toHaveLength(2);
  });

  it("prinde numele fără diacritice, în ambele ordini și singure", () => {
    const { text } = redact("Șerban Țurcanu a semnat. Țurcanu Șerban și apoi Turcanu.", { knownNames: ["Șerban Țurcanu"] });
    expect(text).not.toMatch(/rcanu/);
    expect(text).not.toMatch(/erban/);
  });

  it("prinde un CNP cu cifră de control greșită (typo), dar nu orice număr de 13 cifre", () => {
    expect(redact("CNP 2971001185822").text).toContain("<CNP_1>");
    expect(redact("referință 9999999999999").text).toBe("referință 9999999999999");
    expect(redact("referință 1234567890123").text).toBe("referință 1234567890123");
  });

  it("scoate data nașterii dedusă din CNP, chiar fără etichetă", () => {
    const { text } = redact("CNP 2971001185821. Alt document: 1997-10-01.");
    expect(text).not.toContain("1997-10-01");
  });

  it("nu stricăm cuvinte obișnuite și nu prindem numere scurte", () => {
    const plain = "Asigurătorul răspunde pentru daune în limita a 1.220.000 EUR, conform art. 12 alin. 3.";
    expect(redact(plain).text).toBe(plain);
  });

  it("nume după etichetă, fără să înghită cuvintele de după", () => {
    const { text } = redact("Titular: Ion Popescu CNP 1930116022331");
    expect(text).toBe("Titular: <NUME_1> CNP <CNP_1>");
  });

  it("valorile cu etichetă se redactează și când sunt scrise greșit (tocmai ele sunt greșelile căutate)", () => {
    const raw = ["Număr de înmatriculare: ABC 123", "Serie șasiu: TSTSPEC00000000O1", "CNP: 29710011858", "Telefon: 0722 12 34", "IBAN asigurător: RO48 AAAA 1B31 0075 9384 0000"].join("\n");
    const { text } = redact(raw);
    for (const secret of ["ABC 123", "TSTSPEC", "29710011858", "0722 12 34", "RO48"]) expect(text).not.toContain(secret);
    expect(text).toContain("Număr de înmatriculare: <PLATE_1>");
    expect(findLeaks(text)).toEqual([]);
  });

  it("re-hidratează tokenurile la loc", () => {
    const { text, map } = redact(sample, { knownNames: ["Andreea Grigore"] });
    expect(rehydrate(text, map)).toContain("2971001185821");
    expect(rehydrate(text, map)).toContain("B 200 TST");
    expect(rehydrate("<NUME_9> necunoscut", map)).toBe("<NUME_9> necunoscut");
  });
});

describe("plasa de siguranță dinaintea apelului AI", () => {
  it("textul redactat trece", () => {
    const { text } = redact("Asigurat: Ion Popescu, CNP 1930116022331, tel 0722123456, B 12 ABC", { knownNames: ["Ion Popescu"] });
    expect(findLeaks(text)).toEqual([]);
    expect(() => assertRedacted(text)).not.toThrow();
  });

  it("textul neredactat e oprit, cu tipurile găsite în mesaj, fără valorile", () => {
    const raw = "CNP 1930116022331 și email ion@example.test";
    expect(() => assertRedacted(raw)).toThrow(PiiLeakError);
    try {
      assertRedacted(raw);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/CNP/);
      expect(msg).not.toContain("1930116022331");
    }
  });
});
