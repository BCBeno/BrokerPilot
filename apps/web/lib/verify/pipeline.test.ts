import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ChatMessage, ModelCall } from "../ai/extract";
import { parseKbFile } from "../kb/parse";
import { aiCheckDocument } from "./ai-check";
import { detectType, missingRequired, parsePolicyText, toRoDate } from "./parse";
import { computeHighlights, verifyDocument } from "./pipeline";
import { findLeaks } from "./redact";

const NOW = new Date("2026-11-12T10:00:00Z");
const FIXTURES = path.resolve(import.meta.dirname, "../../../../data/fixtures/verify");
const REFERENCE = { name: "Andreea Grigore", plate: "B 200 TST", vin: "TSTSPEC0000000001" };

async function load(file: string) {
  const parsed = await parseKbFile(new Uint8Array(readFileSync(path.join(FIXTURES, file))));
  return parsed.pages;
}

/** Model fals: înregistrează ce primește și răspunde cu un JSON fix. */
function fakeModel(issues: unknown[] = []) {
  const sent: ChatMessage[][] = [];
  const call: ModelCall = async ({ messages }) => {
    sent.push(messages);
    return { text: JSON.stringify({ issues }) };
  };
  return { call, sent };
}

const ids = (r: { issues: { id: string }[] }) => r.issues.map((i) => i.id);

describe("parser", () => {
  it("citește câmpurile din polița corectă", async () => {
    const [page] = await load("01-corecta.pdf");
    const f = parsePolicyText(page?.text ?? "");
    expect(f).toMatchObject({
      type: "RCA",
      insurer: "Asigurător Test A",
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
      premiumCurrency: "RON",
      installments: "4",
      installmentAmount: "312,50",
      installmentCurrency: "RON",
      iban: "RO49 AAAA 1B31 0075 9384 0000",
    });
    expect(missingRequired(f)).toEqual([]);
  });

  it("date scrise cu luna în litere, cu bară sau ISO", () => {
    expect(toRoDate("9 septembrie 2026")).toBe("09.09.2026");
    expect(toRoDate("2026-09-29")).toBe("29.09.2026");
    expect(toRoDate("9/9/2026")).toBe("09.09.2026");
    expect(toRoDate("31.02.2027")).toBe("31.02.2027");
  });

  it("tipul din titlu, nu din ce apare mai des în clauze", () => {
    expect(detectType("Poliță de asigurare RCA\n CASCO CASCO CASCO")).toBe("RCA");
    expect(detectType("Condiții generale CASCO. Casco acoperă")).toBe("CASCO");
    expect(detectType("nimic relevant")).toBeUndefined();
  });

  it("ce lipsește rămâne nedefinit și e raportat", () => {
    const f = parsePolicyText("Poliță de asigurare RCA\nAsigurat: Ion Popescu");
    expect(f.validTo).toBeUndefined();
    expect(missingRequired(f).map((m) => m.key)).toEqual(expect.arrayContaining(["validFrom", "validTo", "plate", "premiumTotal"]));
  });
});

describe("pipeline pe polițele-fixture", () => {
  it("polița corectă: nicio problemă sigură", async () => {
    const m = fakeModel();
    const r = await verifyDocument({ pages: await load("01-corecta.pdf"), reference: REFERENCE, now: NOW, callModel: m.call });
    expect(r.issues).toEqual([]);
    expect(r.ai.status).toBe("ok");
  });

  it("2037: eroare critică, cu anul propus și evidențiată în text", async () => {
    const r = await verifyDocument({ pages: await load("02-expirare-2037.pdf"), reference: REFERENCE, now: NOW, callModel: fakeModel().call });
    expect(ids(r)).toEqual(["dates-too-long"]);
    expect(r.issues[0]?.suggestedFix).toContain("29.09.2027");
    const h = r.highlights[0];
    expect(r.text.slice(h?.start, h?.end)).toBe("29.09.2037");
    expect(h?.severity).toBe("critical");
  });

  it("nume cu typo și rate care nu se adună, față de dosarul clientului", async () => {
    const r = await verifyDocument({ pages: await load("03-nume-typo-casco-rate.pdf"), reference: REFERENCE, now: NOW, callModel: fakeModel().call });
    expect(ids(r)).toEqual(expect.arrayContaining(["installments-sum", "name-typo"]));
    expect(r.issues.find((i) => i.id === "name-typo")?.severity).toBe("warning");
  });

  it("identificatori greșiți", async () => {
    const r = await verifyDocument({ pages: await load("04-identificatori-gresiti.pdf"), reference: REFERENCE, now: NOW, callModel: fakeModel().call });
    expect(ids(r)).toEqual(expect.arrayContaining(["cnp-control", "plate-format", "iban-invalid"]));
  });

  it("fără model configurat, raportul sigur rămâne și AI e marcat „skipped”", async () => {
    const r = await verifyDocument({ pages: await load("02-expirare-2037.pdf"), now: NOW, callModel: null, skipReason: "Modelul nu e configurat." });
    expect(ids(r)).toEqual(["dates-too-long"]);
    expect(r.ai).toMatchObject({ status: "skipped", message: "Modelul nu e configurat." });
  });
});

describe("ce primește AI-ul", () => {
  it("niciun CNP, nume, telefon, email, plăcuță, VIN sau IBAN în payload, pe nicio poliță", async () => {
    for (const file of ["01-corecta.pdf", "02-expirare-2037.pdf", "03-nume-typo-casco-rate.pdf", "04-identificatori-gresiti.pdf"]) {
      const m = fakeModel();
      const r = await verifyDocument({ pages: await load(file), reference: REFERENCE, now: NOW, callModel: m.call });
      const payload = JSON.stringify(m.sent);
      expect(m.sent, file).toHaveLength(1);
      for (const secret of ["2971001185821", "2971001185822", "0722", "B 200 TST", "ABC 123", "TSTSPEC0000000001", "RO49", "RO48", "FX-RCA-0001", "Grigore", "Andreea", "Andrea ", "01.10.1997"]) {
        expect(payload, `${file}: ${secret}`).not.toContain(secret);
      }
      expect(findLeaks(r.ai.sentText), file).toEqual([]);
      // Datele contractuale și sumele rămân vizibile pentru AI.
      expect(payload).toContain("1.250,00 RON");
    }
  });

  it("raportul arată textul trimis și câte valori s-au redactat", async () => {
    const r = await verifyDocument({ pages: await load("01-corecta.pdf"), reference: REFERENCE, now: NOW, callModel: fakeModel().call });
    expect(r.ai.sentText).toContain("<CNP_1>");
    expect(r.ai.sentText).toContain("<NUME_1>");
    expect(r.ai.redactionCounts.CNP).toBe(1);
  });
});

describe("pasul AI", () => {
  const redactedSample = "Asiguratul <NUME_1> trebuie să anunțe asigurătorul în termen de 48 de ore de la producera evenimentului.";

  it("transformă răspunsul în sugestii, păstrează locația doar dacă e în text", async () => {
    const m = fakeModel([
      { category: "typo", severity: "warning", location: "producera evenimentului", explanation: "Greșeală de scriere.", suggested_fix: "producerea evenimentului" },
      { category: "ambiguitate", severity: "info", location: "citat inventat care nu există", explanation: "Ambiguu.", suggested_fix: null },
    ]);
    const r = await aiCheckDocument(redactedSample, "RCA", m.call);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issues[0]).toMatchObject({ source: "ai", quote: "producera evenimentului", suggestedFix: "producerea evenimentului" });
    expect(r.issues[1]?.quote).toBeUndefined();
  });

  it("reia o dată dacă răspunsul nu respectă schema, apoi renunță", async () => {
    let calls = 0;
    const bad: ModelCall = async () => {
      calls++;
      return { text: '{"issues":[{"severity":"foarte grav"}]}' };
    };
    const r = await aiCheckDocument(redactedSample, "RCA", bad);
    expect(calls).toBe(2);
    expect(r.ok).toBe(false);
  });

  it("refuză să trimită un text care mai conține PII", async () => {
    const m = fakeModel();
    await expect(aiCheckDocument("CNP 1930116022331 și email ion@example.test", "RCA", m.call)).rejects.toThrow(/date personale/);
    expect(m.sent).toHaveLength(0);
  });

  it("sugestiile AI primesc înapoi valorile reale în raport (doar pentru UI)", async () => {
    const pages = await load("01-corecta.pdf");
    const m = fakeModel([{ category: "inconsistenta", severity: "warning", location: "<NUME_1>", explanation: "Numele <NUME_1> apare diferit.", suggested_fix: null }]);
    const r = await verifyDocument({ pages, reference: REFERENCE, now: NOW, callModel: m.call });
    const ai = r.issues.find((i) => i.source === "ai");
    expect(ai?.explanation).toBe("Numele Andreea Grigore apare diferit.");
    expect(ai?.quote).toBe("Andreea Grigore");
  });

  it("o eroare a modelului nu strică raportul sigur", async () => {
    const boom: ModelCall = async () => {
      throw new Error("503");
    };
    const r = await verifyDocument({ pages: await load("02-expirare-2037.pdf"), now: NOW, callModel: boom });
    expect(ids(r)).toEqual(["dates-too-long"]);
    expect(r.ai.status).toBe("failed");
  });
});

describe("highlight", () => {
  it("prima apariție, fără suprapuneri, cel mai grav câștigă", () => {
    const text = "Valabilă 29.09.2026 – 29.09.2037, prima 1.250,00 RON";
    const h = computeHighlights(text, [
      { id: "a", source: "determinist", severity: "warning", explanation: "", quote: "29.09.2037, prima" },
      { id: "b", source: "determinist", severity: "critical", explanation: "", quote: "29.09.2037" },
      { id: "c", source: "ai", severity: "info", explanation: "", quote: "inexistent" },
    ]);
    expect(h.map((x) => x.issueId)).toEqual(["b"]);
    expect(text.slice(h[0]?.start, h[0]?.end)).toBe("29.09.2037");
  });
});

describe("locația AI peste rupturi de rând", () => {
  it("găsește citatul chiar dacă PDF-ul a rupt rândul în mijloc și întoarce fragmentul exact", async () => {
    const { locationIn } = await import("./ai-check");
    const text = "… fără franșiză. Polița\nacoperă și daunele proprii prin CASCO, fără franșiză.";
    expect(locationIn(text, "Polița acoperă și daunele proprii")).toBe("Polița\nacoperă și daunele proprii");
    expect(locationIn(text, "nu există")).toBeUndefined();
  });
});

describe("eroare de credit sau de limită la provider", () => {
  it("402 are mesaj explicit, iar raportul sigur rămâne", async () => {
    const noCredit: ModelCall = async () => {
      throw new Error("Providerul AI (groq) a răspuns cu 402.");
    };
    const r = await verifyDocument({ pages: await load("02-expirare-2037.pdf"), now: NOW, callModel: noCredit });
    expect(r.ai.status).toBe("failed");
    expect(r.ai).toMatchObject({ message: expect.stringContaining("credit") });
    expect(ids(r)).toEqual(["dates-too-long"]);
  });

  it("429 spune că limita a fost atinsă", async () => {
    const limited: ModelCall = async () => {
      throw new Error("Providerul AI (groq) a răspuns cu 429.");
    };
    const r = await verifyDocument({ pages: await load("02-expirare-2037.pdf"), now: NOW, callModel: limited });
    expect(r.ai).toMatchObject({ status: "failed", message: expect.stringContaining("limita") });
    expect(ids(r)).toEqual(["dates-too-long"]);
  });
});
