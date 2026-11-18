import { z } from "zod";

/** Tipurile de link de acces: `invite` pentru un cont nou, `recovery` pentru un link nou (parolă uitată, invitație expirată). */
export const ACCESS_TYPES = ["invite", "recovery"] as const;
export type AccessType = (typeof ACCESS_TYPES)[number];

const nameField = z.string().trim().min(2, "Scrieți numele.").max(120, "Numele e prea lung.");

/** Telefon opțional: gol → `null`; altfel fără spații („+40 722 000 111” → „+40722000111”). */
const phoneField = z
  .string()
  .trim()
  .max(20, "Telefonul e prea lung.")
  .regex(/^(\+?[0-9 ]{9,19})?$/, "Telefonul are doar cifre, spații și eventual + la început.")
  .transform((v) => (v === "" ? null : v.replace(/\s+/g, "")));

export const inviteSchema = z.object({
  name: nameField,
  email: z.string().trim().toLowerCase().pipe(z.email("Adresa de e-mail nu e validă.")),
  phone: phoneField,
  isAdmin: z.boolean(),
});

/** Ce schimbă un administrator la un membru din Echipă: aceleași câmpuri ca la adăugare. */
export const memberSchema = inviteSchema;

/** Ce își poate schimba singur brokerul în Profil. E-mailul de login îl schimbă doar un administrator. */
export const profileSchema = z.object({ name: nameField, phone: phoneField });

const newPassword = z.string().min(10, "Parola are cel puțin 10 caractere.").max(72, "Parola e prea lungă (cel mult 72 de caractere).");
const sameTwice = (v: { password: string; confirm: string }) => v.password === v.confirm;
const notSame = { message: "Cele două parole nu sunt la fel.", path: ["confirm"] };

export const passwordSchema = z.object({ password: newPassword, confirm: z.string() }).refine(sameTwice, notSame);

/** Schimbarea parolei din Profil cere și parola actuală (o sesiune uitată deschisă nu ajunge). */
export const changePasswordSchema = z
  .object({ current: z.string().min(1, "Scrieți parola actuală.").max(200), password: newPassword, confirm: z.string() })
  .refine(sameTwice, notSame)
  .refine((v) => v.current !== v.password, { message: "Parola nouă trebuie să fie diferită de cea actuală.", path: ["password"] });

export const accessParamsSchema = z.object({
  token_hash: z.string().regex(/^[A-Za-z0-9_-]{16,200}$/),
  type: z.enum(ACCESS_TYPES),
});

/**
 * Linkul pe care adminul îl trimite brokerului. Duce la pagina noastră, nu la `/auth/v1/verify` din Supabase:
 * tokenul se consumă abia la trimiterea formularului, deci previzualizarea linkului în WhatsApp/Telegram nu-l strică.
 */
export function accessLink(appUrl: string, hashedToken: string, type: AccessType): string {
  const url = new URL("/broker/parola", appUrl);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", type);
  return url.toString();
}
