import { describe, expect, it } from "vitest";
import { isDocConfirmed } from "@/lib/amiabila/documents";
import {
  CODE_RE,
  IDENTITY_TTL_MS,
  codeMatches,
  generateCode,
  hashCode,
  hashPhone,
  makeIdentityToken,
  maskPhone,
  otpSecret,
  readIdentityToken,
  toE164,
  toLocalDigits,
} from "./otp";
import { maskPolicyNo, pickPolicy, prefillDocuments, vehicleCards, type PolicyRow, type VehicleRow } from "./prefill";
import { smsMode } from "./sms";

const VID = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";

describe("telefon", () => {
  it("aduce numerele românești la E.164 și înapoi la forma din `clients.phone`", () => {
    expect(toE164("0722 123 456")).toBe("+40722123456");
    expect(toE164("+40 722-123-456")).toBe("+40722123456");
    expect(toE164("0040722123456")).toBe("+40722123456");
    expect(toE164("+49 151 2345678")).toBe("+491512345678");
    expect(toE164("123")).toBeNull();
    expect(toLocalDigits("+40722123456")).toBe("0722123456");
    expect(toLocalDigits("+491512345678")).toBeNull();
  });
  it("maschează numărul (doar prefixul și ultimele 3 cifre)", () => {
    expect(maskPhone("+40722123456")).toBe("07•• ••• 456");
  });
});

describe("cod și hash-uri", () => {
  it("codul are 6 cifre", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(CODE_RE);
  });
  it("hash-ul codului depinde de verificare și de secret", () => {
    const h = hashCode("s", ID, "123456");
    expect(codeMatches("s", ID, "123456", h)).toBe(true);
    expect(codeMatches("s", ID, "123457", h)).toBe(false);
    expect(codeMatches("alt", ID, "123456", h)).toBe(false);
    expect(codeMatches("s", VID, "123456", h)).toBe(false);
    expect(h).not.toContain("123456");
    expect(hashPhone("s", "+40722123456")).not.toContain("722");
  });
  it("secretul vine din pepper sau, în lipsa lui, e derivat din cheia service role", () => {
    expect(otpSecret({ OTP_HASH_PEPPER: "p", SUPABASE_SERVICE_ROLE_KEY: "k" })).toBe("p");
    const derived = otpSecret({ SUPABASE_SERVICE_ROLE_KEY: "k" });
    expect(derived).toBeTruthy();
    expect(derived).not.toBe("k");
    expect(otpSecret({})).toBeNull();
  });
});

describe("tokenul de identitate", () => {
  const now = 1_800_000_000_000;
  it("e valabil 2 ore, doar cu secretul nostru", () => {
    const t = makeIdentityToken("s", ID, now);
    expect(readIdentityToken("s", t, now + 60_000)).toBe(ID);
    expect(readIdentityToken("s", t, now + IDENTITY_TTL_MS + 1)).toBeNull();
    expect(readIdentityToken("alt", t, now)).toBeNull();
  });
  it("respinge tokenurile modificate sau stricate", () => {
    const t = makeIdentityToken("s", ID, now);
    const [, exp, sig] = t.split(".");
    expect(readIdentityToken("s", `${VID}.${exp}.${sig}`, now)).toBeNull();
    expect(readIdentityToken("s", `${ID}.${Number(exp) + 1}.${sig}`, now)).toBeNull();
    expect(readIdentityToken("s", "abc", now)).toBeNull();
    expect(readIdentityToken("s", null, now)).toBeNull();
  });
});

describe("modul SMS", () => {
  it("Twilio doar cu toate cele trei chei; fără ele, local în dev și oprit în producție", () => {
    const keys = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_VERIFY_SERVICE_SID: "VA1" };
    expect(smsMode(keys, "production")).toBe("twilio");
    expect(smsMode({ ...keys, TWILIO_AUTH_TOKEN: undefined }, "development")).toBe("local");
    expect(smsMode({}, "production")).toBe("off");
  });
});

describe("precompletarea din fișă", () => {
  const vehicle: VehicleRow = { id: VID, plate: "B123ABC", vin: "UU1HSDAG512345678", make: "Dacia", model: "Logan", year: 2019 };
  const policies: PolicyRow[] = [
    { vehicle_id: VID, type: "RCA", insurer: "Allianz", policy_no: "RO25ABC000111", valid_from: "2025-01-01", valid_to: "2025-12-31" },
    { vehicle_id: VID, type: "RCA", insurer: "Groupama", policy_no: "RO26XYZ000222", valid_from: "2026-01-01", valid_to: "2026-12-31" },
    { vehicle_id: VID, type: "CASCO", insurer: "Omniasig", policy_no: "C-9", valid_from: "2026-01-01", valid_to: "2026-12-31" },
  ];

  it("alege RCA-ul valabil în ziua accidentului, altfel cel mai recent", () => {
    expect(pickPolicy(policies, VID, "2025-06-01")?.insurer).toBe("Allianz");
    expect(pickPolicy(policies, VID, "2026-11-14")?.insurer).toBe("Groupama");
    expect(pickPolicy(policies, VID, "2027-03-01")?.insurer).toBe("Groupama");
    expect(pickPolicy(policies, "alt", "2026-11-14")).toBeNull();
  });

  it("cardurile arată mașina, dar nu și numărul complet al poliței", () => {
    const [card] = vehicleCards([vehicle], policies, "2026-11-14");
    expect(card).toEqual({
      id: VID,
      plate: "B 123 ABC",
      title: "Dacia Logan, 2019",
      insurer: "Groupama",
      policyNoMasked: "••••0222",
      validTo: "2026-12-31",
    });
    expect(maskPolicyNo("RO26XYZ000222")).toBe("••••0222");
    expect(JSON.stringify(card)).not.toContain(vehicle.vin);
  });

  it("talonul și polița ies verificate; permisul are numele și contactul, restul de completat", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    const docs = prefillDocuments(
      { full_name: "Andreea Grigore", phone: "0722123456", email: "andreea@exemplu.ro" },
      vehicle,
      pickPolicy(policies, VID, "2026-11-14"),
      now,
    );
    expect(isDocConfirmed("registration", docs.registration)).toBe(true);
    expect(isDocConfirmed("policy", docs.policy)).toBe(true);
    expect(docs.registration.fields.plate.value).toBe("B 123 ABC");
    expect(docs.policy.fields.plate.value).toBe("B 123 ABC");
    expect(docs.license.fields.phone.value).toBe("0722 123 456");
    expect(docs.license.fields.fullName).toEqual({ value: "Andreea Grigore", confidence: 1 });
    expect(docs.license.fields.licenseNo).toEqual({ value: null, confidence: 0 });
    expect(isDocConfirmed("license", docs.license)).toBe(false);
  });

  it("fără RCA în fișă, polița rămâne de completat (doar numărul mașinii e pus)", () => {
    const docs = prefillDocuments({ full_name: "X", phone: null, email: null }, vehicle, null, new Date());
    expect(isDocConfirmed("policy", docs.policy)).toBe(false);
    expect(docs.policy.fields.plate.value).toBe("B 123 ABC");
  });
});
