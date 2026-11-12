import { describe, expect, it } from "vitest";
import { KbParseError, normalizeRo, parseKbFile } from "./parse";

const enc = (s: string) => new TextEncoder().encode(s);

/** PDF minimal cu două pagini (text ASCII), scris de mână: pdf.js reconstruiește tabela xref când lipsește. */
function tinyPdf(pageTexts: string[]): Uint8Array {
  const objs: string[] = [];
  const n = pageTexts.length;
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${pageTexts.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${n} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pageTexts.forEach((t, i) => {
    const content = `BT /F1 14 Tf 20 100 Td (${t}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return enc(out);
}

describe("normalizeRo", () => {
  it("trece ş/ţ cu sedilă la ș/ț cu virgulă", () => {
    expect(normalizeRo("Condiţii generale, şofer, Şcoala, Ţara")).toBe("Condiții generale, șofer, Școala, Țara");
  });

  it("lasă diacriticele corecte neschimbate", () => {
    expect(normalizeRo("Asigurarea obligatorie și țările")).toBe("Asigurarea obligatorie și țările");
  });

  it("curăță spațiile, cratima moale și liniile goale în exces", () => {
    expect(normalizeRo("  a  b \t c \r\n\r\n\r\n\r\n d­e  ")).toBe("a b c\n\nde");
  });

  it("scoate caracterele nule", () => {
    expect(normalizeRo("a\u0000b")).toBe("ab");
  });
});

describe("parseKbFile", () => {
  it("citește text simplu ca o singură pagină, normalizat", async () => {
    const r = await parseKbFile(enc("Condiţii generale\n\nArt. 1 Obiectul asigurării"));
    expect(r.totalPages).toBe(1);
    expect(r.pages).toEqual([{ page: 1, text: "Condiții generale\n\nArt. 1 Obiectul asigurării" }]);
  });

  it("împarte textul pe pagini după „form feed” și sare peste paginile goale", async () => {
    const r = await parseKbFile(enc("Pagina unu\fpagina doi\f  \fpagina patru"));
    expect(r.totalPages).toBe(4);
    expect(r.pages.map((p) => p.page)).toEqual([1, 2, 4]);
  });

  it("ignoră BOM-ul UTF-8", async () => {
    const r = await parseKbFile(new Uint8Array([0xef, 0xbb, 0xbf, ...enc("Text")]));
    expect(r.pages[0]?.text).toBe("Text");
  });

  it("citește un PDF pe pagini, cu numărul paginii", async () => {
    const r = await parseKbFile(tinyPdf(["Prima pagina", "A doua pagina"]));
    expect(r.totalPages).toBe(2);
    expect(r.pages).toEqual([
      { page: 1, text: "Prima pagina" },
      { page: 2, text: "A doua pagina" },
    ]);
  });

  it("respinge fișierele goale și cele binare care nu sunt PDF", async () => {
    await expect(parseKbFile(new Uint8Array())).rejects.toMatchObject({ code: "unsupported" });
    await expect(parseKbFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00]))).rejects.toBeInstanceOf(KbParseError);
  });

  it("raportează un PDF stricat ca ilizibil", async () => {
    await expect(parseKbFile(enc("%PDF-1.4\nnu e un pdf valid"))).rejects.toMatchObject({ code: "unreadable" });
  });
});
