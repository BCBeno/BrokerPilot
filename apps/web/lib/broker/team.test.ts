import { describe, expect, it } from "vitest";
import { accessLink, accessParamsSchema, changePasswordSchema, inviteSchema, passwordSchema, profileSchema } from "./team";

describe("inviteSchema", () => {
  it("normalizează e-mailul și telefonul", () => {
    const r = inviteSchema.parse({ name: " Ana Pop ", email: " Ana.Pop@Firma.RO ", phone: "+40 722 000 111", isAdmin: false });
    expect(r).toEqual({ name: "Ana Pop", email: "ana.pop@firma.ro", phone: "+40722000111", isAdmin: false });
  });

  it("acceptă telefon gol", () => {
    expect(inviteSchema.parse({ name: "Ana Pop", email: "a@b.ro", phone: "", isAdmin: true }).phone).toBeNull();
  });

  it("respinge e-mail și telefon invalide", () => {
    expect(inviteSchema.safeParse({ name: "Ana Pop", email: "nu-e-mail", phone: "", isAdmin: false }).success).toBe(false);
    expect(inviteSchema.safeParse({ name: "Ana Pop", email: "a@b.ro", phone: "07a2", isAdmin: false }).success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("cere minim 10 caractere și confirmare identică", () => {
    expect(passwordSchema.safeParse({ password: "scurta", confirm: "scurta" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "parola-lunga-1", confirm: "parola-lunga-2" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "parola-lunga-1", confirm: "parola-lunga-1" }).success).toBe(true);
  });
});

describe("profileSchema", () => {
  it("păstrează doar numele și telefonul, normalizate", () => {
    expect(profileSchema.parse({ name: " Ana Pop ", phone: "0722 000 111" })).toEqual({ name: "Ana Pop", phone: "0722000111" });
    expect(profileSchema.safeParse({ name: "A", phone: "" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("cere parola actuală și o parolă nouă diferită", () => {
    expect(changePasswordSchema.safeParse({ current: "", password: "parola-noua-1", confirm: "parola-noua-1" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ current: "parola-noua-1", password: "parola-noua-1", confirm: "parola-noua-1" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ current: "veche", password: "parola-noua-1", confirm: "parola-noua-1" }).success).toBe(true);
  });
});

describe("accessLink", () => {
  it("duce la /broker/parola cu tokenul și tipul", () => {
    const link = accessLink("https://app.exemplu.test", "abc123def456ghi789", "invite");
    expect(link).toBe("https://app.exemplu.test/broker/parola?token_hash=abc123def456ghi789&type=invite");
    const back = new URL(link).searchParams;
    expect(accessParamsSchema.parse({ token_hash: back.get("token_hash"), type: back.get("type") }).type).toBe("invite");
  });

  it("respinge tipuri necunoscute", () => {
    expect(accessParamsSchema.safeParse({ token_hash: "abc123def456ghi789", type: "magiclink" }).success).toBe(false);
  });
});

describe("memberSchema", () => {
  it("normalizează ca la adăugare și respinge e-mail invalid", async () => {
    const { memberSchema } = await import("./team");
    expect(memberSchema.parse({ name: "Ana Pop", email: " A@B.RO ", phone: "", isAdmin: true })).toEqual({ name: "Ana Pop", email: "a@b.ro", phone: null, isAdmin: true });
    expect(memberSchema.safeParse({ name: "Ana Pop", email: "x", phone: "", isAdmin: false }).success).toBe(false);
  });
});
