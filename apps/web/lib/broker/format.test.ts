import { describe, expect, it } from "vitest";
import { displayName, expiryText, insurerName, licenseCategory, phoneDisplay, vehicleName } from "./format";

describe("formatare la afișare", () => {
  it("scoate „(fictiv)” din nume", () => {
    expect(displayName("Bogdan Albu (fictiv)")).toBe("Bogdan Albu");
    expect(displayName("Ana Pop")).toBe("Ana Pop");
  });

  it("marca și modelul fără majuscule de formular, siglele rămân", () => {
    expect(vehicleName("SKODA RAPID")).toBe("Skoda Rapid");
    expect(vehicleName("VW GOLF")).toBe("VW Golf");
    expect(vehicleName("BMW X5")).toBe("BMW X5");
    expect(vehicleName("Opel Astra")).toBe("Opel Astra");
  });

  it("numele scurt al asigurătorului", () => {
    expect(insurerName("Societatea de Asigurare-Reasigurare CITY INSURANCE SA")).toBe("City Insurance");
    expect(insurerName("Asigurător Test D")).toBe("Asigurător Test D");
  });

  it("categoria permisului și telefonul", () => {
    expect(licenseCategory("b")).toBe("B");
    expect(phoneDisplay("0700000201")).toBe("0700 000 201");
    expect(phoneDisplay("+40700000201")).toBe("0700 000 201");
    expect(phoneDisplay("021 123 4567")).toBe("021 123 4567");
  });

  it("în săptămâna curentă spune ziua", () => {
    expect(expiryText(3, "2026-11-15")).toBe("expiră duminică");
    expect(expiryText(1, "2026-11-13")).toBe("expiră mâine");
    expect(expiryText(12, "2026-11-24")).toBe("expiră în 12 zile");
    expect(expiryText(-4, "2026-11-08")).toBe("expirată de 4 zile");
  });
});
