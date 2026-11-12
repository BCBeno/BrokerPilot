import { describe, expect, it } from "vitest";
import { callDuration, callTurns, mentionsClaimRef, mentionsPlace, rankCandidateCalls, streetKey, type CallRow } from "./calls";

const call = (over: Partial<CallRow>): CallRow => ({ id: "c", created_at: "2026-11-12T10:00:00Z", summary: null, transcript: null, ...over });

describe("apelurile din fișa dosarului", () => {
  it("găsește codul dosarului oricum ar fi scris", () => {
    expect(mentionsClaimRef("Clientul întreabă de BP-2611-00017.", "BP-2611-00017")).toBe(true);
    expect(mentionsClaimRef("dosarul bp 2611 00017", "BP-2611-00017")).toBe(true);
    expect(mentionsClaimRef("B P, 2 6 1 1, 0 0 0 1 7", "BP-2611-00017")).toBe(true);
    expect(mentionsClaimRef("BP-2611-00018", "BP-2611-00017")).toBe(false);
    expect(mentionsClaimRef(null, "BP-2611-00017")).toBe(false);
    expect(mentionsClaimRef("orice", "")).toBe(false);
  });

  it("propune doar apelurile care pomenesc dosarul, cele mai noi primele", () => {
    const calls = [
      call({ id: "nou", created_at: "2026-11-12T12:00:00Z", summary: "Ceva despre o ofertă." }),
      call({ id: "vechi-cu-cod", created_at: "2026-11-10T09:00:00Z", summary: "Întreabă de BP-2611-00017." }),
      call({ id: "transcript", created_at: "2026-11-11T09:00:00Z", transcript: { text: "dosarul BP 2611 00017" } }),
      call({ id: "mediu", created_at: "2026-11-12T08:00:00Z" }),
    ];
    const ranked = rankCandidateCalls(calls, "BP-2611-00017", null);
    expect(ranked.map((c) => c.call.id)).toEqual(["transcript", "vechi-cu-cod"]);
    expect(ranked.map((c) => c.reason)).toEqual(["code", "code"]);
  });

  it("strada accidentului ca semnal mediu, după cod; fără semnal, apelul nu se propune", () => {
    expect(streetKey("Strada Grigore Ureche, Suceava")).toBe("grigore ureche");
    expect(streetKey("Str. Ștefan cel Mare nr. 12, Iași")).toBe("stefan cel mare");
    expect(streetKey("Suceava")).toBeNull(); // doar localitate: nu e semnal
    expect(streetKey("Strada Grigore Ureche")).toBe("grigore ureche");
    expect(streetKey("Strugurilor 4, Cluj")).toBe("strugurilor");
    expect(streetKey("DN2")).toBeNull();
    expect(streetKey(null)).toBeNull();
    expect(mentionsPlace("accident pe strada GRIGORE URECHE din Suceava", "Strada Grigore Ureche, Suceava")).toBe(true);
    expect(mentionsPlace("accident în sens giratoriu", "Strada Grigore Ureche, Suceava")).toBe(false);

    const calls = [
      call({ id: "recent", created_at: "2026-11-12T15:00:00Z", summary: "Ofertă RCA." }),
      call({ id: "loc", created_at: "2026-11-12T10:00:00Z", summary: "Accident pe strada Grigore Ureche." }),
      call({ id: "cod", created_at: "2026-11-11T10:00:00Z", summary: "Dosarul BP-2611-00017." }),
    ];
    const ranked = rankCandidateCalls(calls, "BP-2611-00017", "Strada Grigore Ureche, Suceava");
    expect(ranked.map((c) => [c.call.id, c.reason])).toEqual([["cod", "code"], ["loc", "place"]]);
  });

  it("durata și replicile", () => {
    expect(callDuration(call({ transcript: { durationSeconds: 42 } }))).toBe("42 s");
    expect(callDuration(call({ transcript: { durationSeconds: 125 } }))).toBe("2 min 5 s");
    expect(callDuration(call({ transcript: { durationSeconds: 120 } }))).toBe("2 min");
    expect(callDuration(call({}))).toBeNull();
    const turns = callTurns(call({ transcript: { messages: [{ role: "assistant", text: " Bună. " }, { role: "user", text: "" }, { role: "user", text: "Salut" }] } }));
    expect(turns).toEqual([{ who: "asistent", text: "Bună." }, { who: "client", text: "Salut" }]);
  });
});
