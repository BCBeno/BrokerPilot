"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBroker } from "@/lib/broker/session";
import { accessLink, accessParamsSchema, inviteSchema, memberSchema, passwordSchema, type AccessType } from "@/lib/broker/team";
import { displayName } from "@/lib/broker/format";
import { sendAccessEmail, type MailResult } from "@/lib/broker/mail";
import { getServerEnv } from "@/lib/env";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

/** Doar administratorii firmei. Scrierile pe `brokers` și Admin API merg cu service_role, după această verificare. */
async function requireAdmin() {
  const { broker } = await requireBroker();
  if (!broker.is_admin) throw new Error("Doar un administrator poate face asta.");
  const admin = getAdminClient();
  if (!admin) throw new Error("Serviciul nu e disponibil acum.");
  return { broker, admin };
}

/** Generează linkul fără să trimită e-mail (Supabase nu trimite nimic la `generateLink`); îl trimitem noi, prin `mailLink`. */
async function makeLink(admin: NonNullable<ReturnType<typeof getAdminClient>>, email: string, type: AccessType) {
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  const token = data?.properties?.hashed_token;
  if (error || !token || !data.user) return { error };
  return { link: accessLink(getServerEnv().NEXT_PUBLIC_APP_URL, token, type), userId: data.user.id };
}

/**
 * Linkul pleacă pe e-mail prin Resend (dacă e configurat). Oricum îl întoarcem și adminului, ca să-l poată copia
 * dacă e-mailul nu ajunge. Linkul duce la pagina noastră, deci un filtru antispam care îl deschide nu consumă tokenul.
 */
function mailLink(to: string, name: string, link: string, type: AccessType): Promise<MailResult> {
  const env = getServerEnv();
  return sendAccessEmail({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }, { to, name: displayName(name), link, type });
}

export type InviteState = { error: string | null; link: string | null; name: string | null; email: string | null; mail: MailResult | null; ok: number };

/**
 * „Adaugă broker”: cont nou în Auth (fără parolă) + rândul din `brokers`, legat prin `auth_user_id`.
 * Dacă rândul nu se poate scrie, contul din Auth se șterge, ca să nu rămână utilizatori fără broker.
 */
export async function inviteBroker(_prev: InviteState, form: FormData): Promise<InviteState> {
  const fail = (error: string): InviteState => ({ ..._prev, error, link: null, name: null, email: null, mail: null });
  const parsed = inviteSchema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    phone: form.get("phone") ?? "",
    isAdmin: form.get("isAdmin") === "on",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Verificați câmpurile.");
  const { admin } = await requireAdmin();
  const { name, email, phone, isAdmin } = parsed.data;

  const { data: existing } = await admin.from("brokers").select("id").ilike("email", email).maybeSingle();
  if (existing) return fail("Există deja un broker cu acest e-mail. Folosiți „Link nou” din listă.");

  const made = await makeLink(admin, email, "invite");
  if (!made.link) {
    console.error("[team] generateLink invite", made.error?.status, made.error?.code);
    return fail(made.error?.code === "email_exists" ? "Există deja un cont cu acest e-mail." : "Nu am putut crea contul. Încercați din nou.");
  }

  const { error } = await admin.from("brokers").insert({ name, email, phone, is_admin: isAdmin, auth_user_id: made.userId });
  if (error) {
    console.error("[team] insert broker", error.code);
    await admin.auth.admin.deleteUser(made.userId);
    return fail("Nu am putut salva brokerul. Încercați din nou.");
  }
  const mail = await mailLink(email, name, made.link, "invite");
  revalidatePath("/broker/echipa");
  return { error: null, link: made.link, name, email, mail, ok: _prev.ok + 1 };
}

/** „Link nou”: pentru parolă uitată sau invitație expirată. Parola veche rămâne valabilă până o schimbă brokerul. */
export type LinkResult = { error: string | null; link: string | null; email: string | null; mail: MailResult | null };

export async function newAccessLink(brokerId: string): Promise<LinkResult> {
  const none = { link: null, email: null, mail: null };
  const id = z.uuid().parse(brokerId);
  const { admin } = await requireAdmin();
  const { data: target } = await admin.from("brokers").select("name, email, auth_user_id, active").eq("id", id).maybeSingle();
  if (!target?.email || !target.auth_user_id) return { error: "Brokerul nu are cont cu e-mail.", ...none };
  if (!target.active) return { error: "Reactivați brokerul înainte de a-i da acces.", ...none };
  const made = await makeLink(admin, target.email, "recovery");
  if (!made.link) {
    console.error("[team] generateLink recovery", made.error?.status, made.error?.code);
    return { error: "Nu am putut genera linkul. Încercați din nou.", ...none };
  }
  const mail = await mailLink(target.email, target.name, made.link, "recovery");
  return { error: null, link: made.link, email: target.email, mail };
}

/**
 * Dezactivează / reactivează. Un broker inactiv nu mai trece de `requireBroker` și nici de RLS (`current_broker_id()`),
 * chiar dacă are încă o sesiune deschisă. Dosarele lui rămân. Adminul nu se poate dezactiva singur (firma rămâne cu un admin).
 */
export async function setBrokerActive(brokerId: string, active: boolean) {
  const id = z.uuid().parse(brokerId);
  const { broker, admin } = await requireAdmin();
  if (id === broker.id && !active) throw new Error("Nu vă puteți dezactiva propriul cont.");
  const { error } = await admin.from("brokers").update({ active }).eq("id", id);
  if (error) throw new Error("Nu am putut salva. Încercați din nou.");
  revalidatePath("/broker/echipa");
}

export type MemberState = { error: string | null; ok: number };

/**
 * „Modifică” din Echipă: nume, e-mail de login, telefon, administrator. Un e-mail nou se schimbă și în contul din Auth
 * (confirmat direct, fără e-mail trimis), altfel brokerul n-ar mai putea intra. Adminul nu-și poate scoate singur dreptul de admin.
 */
export async function updateMember(brokerId: string, _prev: MemberState, form: FormData): Promise<MemberState> {
  const fail = (error: string): MemberState => ({ error, ok: _prev.ok });
  const id = z.uuid().parse(brokerId);
  const parsed = memberSchema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    phone: form.get("phone") ?? "",
    isAdmin: form.get("isAdmin") === "on",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Verificați câmpurile.");
  const { broker, admin } = await requireAdmin();
  const { name, email, phone, isAdmin } = parsed.data;
  if (id === broker.id && !isAdmin) return fail("Nu vă puteți scoate singur dreptul de administrator.");

  const { data: target } = await admin.from("brokers").select("email, auth_user_id").eq("id", id).maybeSingle();
  if (!target) return fail("Brokerul nu mai există. Reîncărcați pagina.");

  if (email !== target.email?.toLowerCase()) {
    const { data: taken } = await admin.from("brokers").select("id").ilike("email", email).neq("id", id).maybeSingle();
    if (taken) return fail("Alt broker folosește deja acest e-mail.");
    if (target.auth_user_id) {
      const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { email, email_confirm: true });
      if (error) {
        console.error("[team] updateUserById email", error.status, error.code);
        return fail(error.code === "email_exists" ? "Există deja un cont cu acest e-mail." : "Nu am putut schimba e-mailul. Încercați din nou.");
      }
    }
  }

  const { error } = await admin.from("brokers").update({ name, email, phone, is_admin: isAdmin }).eq("id", id);
  if (error) {
    console.error("[team] update broker", error.code);
    return fail("Nu am putut salva. Încercați din nou.");
  }
  revalidatePath("/broker", "layout");
  return { error: null, ok: _prev.ok + 1 };
}

/**
 * „Șterge”: rândul din `brokers` și contul din Auth. Dosarele, clienții și istoricul rămân; legăturile spre broker
 * devin goale (`on delete set null`). Adminul nu se poate șterge singur.
 */
export async function deleteMember(brokerId: string) {
  const id = z.uuid().parse(brokerId);
  const { broker, admin } = await requireAdmin();
  if (id === broker.id) throw new Error("Nu vă puteți șterge propriul cont.");
  const { data: target } = await admin.from("brokers").select("auth_user_id").eq("id", id).maybeSingle();
  if (!target) throw new Error("Brokerul nu mai există. Reîncărcați pagina.");

  const { error } = await admin.from("brokers").delete().eq("id", id);
  if (error) {
    console.error("[team] delete broker", error.code);
    throw new Error("Nu am putut șterge brokerul. Încercați din nou.");
  }
  // Fără rândul din `brokers`, contul oricum nu mai trece de `requireBroker`; dacă ștergerea din Auth eșuează, doar o notăm.
  if (target.auth_user_id) {
    const { error: authError } = await admin.auth.admin.deleteUser(target.auth_user_id);
    if (authError) console.error("[team] deleteUser", authError.status, authError.code);
  }
  revalidatePath("/broker/echipa");
}

export type PasswordState = { error: string | null };

/**
 * Pagina din linkul de acces: tokenul se verifică abia acum (deschide sesiunea), apoi se pune parola.
 * Un token folosit sau expirat dă eroare, iar brokerul cere un link nou.
 */
export async function setPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const params = accessParamsSchema.safeParse({ token_hash: form.get("token_hash"), type: form.get("type") });
  if (!params.success) return { error: "Linkul nu e complet. Cereți administratorului un link nou." };
  const pw = passwordSchema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!pw.success) return { error: pw.error.issues[0]?.message ?? "Parola nu e validă." };

  const db = await getServerClient();
  if (!db) return { error: "Autentificarea nu e configurată pe acest server." };
  const { error: otpError } = await db.auth.verifyOtp({ token_hash: params.data.token_hash, type: params.data.type });
  if (otpError) return { error: "Linkul a expirat sau a fost deja folosit. Cereți administratorului un link nou." };
  const { error } = await db.auth.updateUser({ password: pw.data.password });
  if (error) {
    console.error("[team] updateUser password", error.code);
    return { error: error.code === "weak_password" ? "Parola e prea slabă. Alegeți una mai lungă." : "Nu am putut salva parola. Cereți un link nou." };
  }
  redirect("/broker");
}
