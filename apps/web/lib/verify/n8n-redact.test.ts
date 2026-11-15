import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findLeaks, redact } from "./redact";

/**
 * n8n nu poate importa `redact()` din TypeScript, așa că workflow-urile care trimit text la un LLM au o copie în nodurile Code.
 * Testul rulează exact codul din JSON-ul exportat și cere ca acea copie să nu lase să treacă nimic din ce prinde `redact()`.
 */
const COPIES = [
  { file: "WF04-rag-answer.json", node: "Prepare query" },
  { file: "WF05-telegram-broker-bot.json", node: "Parse update" },
];

/** Scoate din nodul Code funcțiile `norm`, `cnpOk` și `redact` (de la `const norm` până la sfârșitul lui `redact`). */
function loadN8nRedact(file: string, node: string): (text: string) => string {
  const wf = JSON.parse(readFileSync(new URL(`../../../../n8n/workflows/${file}`, import.meta.url), "utf8")) as {
    nodes: { name: string; parameters: { jsCode?: string } }[];
  };
  const code = wf.nodes.find((n) => n.name === node)?.parameters.jsCode ?? "";
  const start = code.indexOf("const norm");
  const fnStart = code.indexOf("const redact", start);
  const end = code.indexOf("\n};", fnStart);
  if (start < 0 || fnStart < 0 || end < 0) throw new Error(`${file} / ${node}: nu găsesc funcția redact`);
  return new Function(`${code.slice(start, end + 3)}\nreturn redact;`)() as (text: string) => string;
}

// Toate valorile sunt fictive. CNP-ul al doilea are cifra de control greșită: un typo tot e o dată personală.
const SAMPLES: Record<string, string> = {
  "CNP valid": "Clientul cu CNP 1960101410019 a sunat.",
  "CNP cu typo": "CNP-ul din poliță e 2971001185822.",
  telefon: "Sunați-l la 0722 123 456 sau +40 744 555 666.",
  email: "Scrie-i la ion.popescu@exemplu.ro.",
  IBAN: "Plata în RO49AAAA1B31007593840000.",
  "nr. înmatriculare": "Mașina CJ 12 ABC a fost lovită de B 123 XYZ.",
  VIN: "VIN-ul este WVWZZZ1JZXW000001.",
  "serie poliță": "Polița ALZ-RCA-123456 expiră luna viitoare.",
};

describe.each(COPIES)("redactarea din $file ($node)", ({ file, node }) => {
  const n8nRedact = loadN8nRedact(file, node);

  it.each(Object.entries(SAMPLES))("ascunde %s", (_kind, text) => {
    const out = n8nRedact(text);
    expect(findLeaks(out)).toEqual([]);
    // Ce înlocuiește `redact()` din TypeScript nu are voie să rămână nici în copia din n8n.
    const ts = redact(text);
    for (const original of Object.values(ts.map)) expect(out).not.toContain(original);
  });

  it("lasă neatinse textele fără date personale", () => {
    const text = "Ce acoperă RCA-ul la o daună în parcare?";
    expect(n8nRedact(text)).toBe(text);
  });
});
