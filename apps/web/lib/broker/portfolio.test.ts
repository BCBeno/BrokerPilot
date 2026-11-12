import { describe, expect, it } from "vitest";
import { SAMPLE_CSV, parseAmount, parseCsv, parsePortfolio, planImport, type ExistingPortfolio } from "./portfolio";

const HEADER = "nume;telefon;email;nr_inmatriculare;marca;model;an;vin;tip_polita;asigurator;nr_polita;valabila_de_la;valabila_pana_la;prima";
const EMPTY: ExistingPortfolio = { clients: [], vehicles: [], policies: [] };
const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe("parseCsv", () => {
  it("separator ; sau , după antet, ghilimele, BOM și CRLF", () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"spune ""da"""\r\n')).toEqual([
      ["a", "b"],
      ["x;1", 'spune "da"'],
    ]);
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("sare peste rândurile goale", () => {
    expect(parseCsv("a;b\n\n;\n1;2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseAmount", () => {
  it("format românesc și internațional", () => {
    expect(parseAmount("1.240,00")).toBe(1240);
    expect(parseAmount("1105.50")).toBe(1105.5);
    expect(parseAmount("1 234 lei")).toBe(1234);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("mult")).toBeNaN();
  });
});

describe("parsePortfolio", () => {
  it("modelul CSV trece fără erori", () => {
    const { rows, errors } = parsePortfolio(SAMPLE_CSV);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      line: 2,
      client: { name: "Ionescu Mihai (fictiv)", phone: "0700 000 901" },
      vehicle: { plate: "B 901 TST", year: 2019 },
      policy: { type: "RCA", validFrom: "2025-11-20", validTo: "2026-11-19", premium: 1240 },
    });
    expect(rows[2].vehicle).toBeNull();
    expect(rows[2].policy?.type).toBe("LOCUINTA");
  });

  it("antet cu diacritice și majuscule", () => {
    const { rows, errors } = parsePortfolio("Nume;Telefon;Nr. înmatriculare\nPopa Ana;0722123456;b123abc");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ client: { phone: "0722 123 456" }, vehicle: { plate: "B 123 ABC" }, policy: null });
  });

  it("rândurile greșite ies cu linia și motivul", () => {
    const csv = [HEADER, ";0722;x;;;;;;;;;;;", "Popa Ana;;;;;;;;RCA;A;1;01.01.2026;31.13.2026;"].join("\n");
    const { rows, errors } = parsePortfolio(csv);
    expect(rows).toEqual([]);
    expect(errors[0].line).toBe(2);
    expect(errors[0].message).toContain("lipsește numele");
    expect(errors[0].message).toContain("telefon nerecunoscut");
    expect(errors[1].line).toBe(3);
    expect(errors[1].message).toContain("data de sfârșit");
    expect(errors[1].message).toContain("cere numărul de înmatriculare");
  });

  it("fără coloana „nume” refuză tot fișierul", () => {
    expect(parsePortfolio("client;telefon\nA;1").errors[0].message).toContain("nume");
  });
});

describe("planImport", () => {
  it("un client cu mai multe polițe pe același vehicul = un client, un vehicul", () => {
    const plan = planImport(parsePortfolio(SAMPLE_CSV).rows, EMPTY, ids());
    expect(plan.clients).toHaveLength(3);
    expect(plan.vehicles).toHaveLength(3);
    expect(plan.policies).toHaveLength(5);
    const mihai = plan.clients[0].id;
    expect(plan.policies.filter((p) => p.client_id === mihai)).toHaveLength(3);
    expect(plan.policies.find((p) => p.type === "LOCUINTA")?.vehicle_id).toBeNull();
  });

  it("recunoaște clienții existenți după telefon și nu dublează polițele", () => {
    const existing: ExistingPortfolio = {
      clients: [{ id: "c-old", full_name: "Mihai Ionescu", phone: "+40 700 000 901", email: null }],
      vehicles: [{ id: "v-old", client_id: "c-old", plate: "B 901 TST" }],
      policies: [{ insurer: "Asigurător Test A", policy_no: "IMP-RCA-0901" }],
    };
    const plan = planImport(parsePortfolio(SAMPLE_CSV).rows, existing, ids());
    expect(plan.matchedClients).toBe(1);
    expect(plan.clients.map((c) => c.full_name)).toEqual(["Stan Elena (fictiv)", "Matei Radu (fictiv)"]);
    expect(plan.duplicatePolicies).toBe(1);
    expect(plan.policies.find((p) => p.policy_no === "IMP-CASCO-0901")).toMatchObject({ client_id: "c-old", vehicle_id: "v-old" });
  });

  it("al doilea import al aceluiași fișier nu adaugă nimic", () => {
    const first = planImport(parsePortfolio(SAMPLE_CSV).rows, EMPTY, ids());
    const after: ExistingPortfolio = {
      clients: first.clients,
      vehicles: first.vehicles,
      policies: first.policies.map((p) => ({ insurer: p.insurer, policy_no: p.policy_no })),
    };
    const second = planImport(parsePortfolio(SAMPLE_CSV).rows, after, ids());
    expect(second.clients).toEqual([]);
    expect(second.vehicles).toEqual([]);
    expect(second.policies).toEqual([]);
    expect(second.duplicatePolicies).toBe(5);
  });

  it("un număr de înmatriculare al altui client e eroare de rând", () => {
    const existing: ExistingPortfolio = {
      clients: [{ id: "c-x", full_name: "Altcineva", phone: "0700 000 902", email: null }],
      vehicles: [{ id: "v-x", client_id: "c-y", plate: "CJ 92 TST" }],
      policies: [],
    };
    const plan = planImport(parsePortfolio(SAMPLE_CSV).rows, existing, ids());
    expect(plan.errors).toEqual([{ line: 5, message: "CJ 92 TST aparține deja altui client din portofoliu" }]);
  });
});
