import { describe, expect, it } from "vitest";
import { brokerFilePath, cleanFileName } from "./files";

describe("cleanFileName", () => {
  it("păstrează doar numele, fără cale și caractere de control", () => {
    expect(cleanFileName(String.raw`C:\Users\ion\proces-verbal.pdf`)).toBe("proces-verbal.pdf");
    expect(cleanFileName("../../deviz\u0000.pdf")).toBe("deviz.pdf");
    expect(cleanFileName("   ")).toBe("document");
    expect(cleanFileName("a".repeat(300))).toHaveLength(120);
  });
});

it("brokerFilePath pune fișierul în folderul dosarului", () => {
  expect(brokerFilePath("c1", "f1", "pdf")).toBe("claims/c1/broker-f1.pdf");
});
