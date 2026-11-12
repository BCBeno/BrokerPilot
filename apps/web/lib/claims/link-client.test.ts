import { describe, expect, it } from "vitest";
import { decideLink } from "./link-client";

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
