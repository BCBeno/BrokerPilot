import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ocrDocument } from "./ocr";
import { verifyDocument } from "./pipeline";

/**
 * Test „live”, doar cu serviciul OCR pornit: `OCR_URL=http://localhost:8099 npm test -- ocr-live`
 * (imaginea: `docker build -t brokerpilot-ocr:local infra/ocr`). Fără `OCR_URL` se sare peste el.
 * Folosește PNG-urile din `data/fixtures/verify/` (`npm run data:verify`).
 */
const url = process.env.OCR_URL;
const dir = join(__dirname, "../../../../data/fixtures/verify");
const ref = { name: "Andreea Grigore", plate: "B 200 TST", vin: "TSTSPEC0000000001" };

async function ids(file: string) {
  const bytes = new Uint8Array(readFileSync(join(dir, file)));
  const pages = await ocrDocument(bytes, { url });
  const report = await verifyDocument({ pages, reference: ref, callModel: null });
  return report.issues.map((i) => i.id);
}

describe.skipIf(!url || !existsSync(dir))("OCR live pe fixtures", () => {
  it("polița corectă nu are probleme sigure", async () => {
    expect(await ids("01-corecta.png")).toEqual([]);
  }, 60_000);

  it("prinde expirarea în 2037", async () => {
    expect(await ids("02-expirare-2037.png")).toContain("dates-too-long");
  }, 60_000);

  it("prinde ratele care nu se adună", async () => {
    expect(await ids("03-nume-typo-casco-rate.png")).toContain("installments-sum");
  }, 60_000);

  it("prinde CNP, plăcuță și IBAN greșite", async () => {
    const found = await ids("04-identificatori-gresiti.png");
    for (const id of ["cnp-control", "plate-format", "iban-invalid"]) expect(found).toContain(id);
  }, 60_000);
});
