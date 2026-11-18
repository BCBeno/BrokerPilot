"use server";

import { revalidatePath } from "next/cache";
import { requireBroker } from "@/lib/broker/session";
import { changePasswordSchema, profileSchema } from "@/lib/broker/team";
import { getAdminClient } from "@/lib/supabase/admin";

export type ProfileState = { error: string | null; ok: number };

/**
 * Nume și telefon. Brokerii nu au politică de update pe `brokers` (nici nu trebuie: ar putea să-și pună `is_admin`),
 * deci scrierea merge cu service_role, strict pe rândul brokerului logat și doar pe aceste două coloane.
 */
export async function updateProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const parsed = profileSchema.safeParse({ name: form.get("name"), phone: form.get("phone") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Verificați câmpurile.", ok: _prev.ok };
  const { broker } = await requireBroker();
  const admin = getAdminClient();
  if (!admin) return { error: "Serviciul nu e disponibil acum.", ok: _prev.ok };
  const { error } = await admin.from("brokers").update({ name: parsed.data.name, phone: parsed.data.phone }).eq("id", broker.id);
  if (error) return { error: "Nu am putut salva. Încercați din nou.", ok: _prev.ok };
  revalidatePath("/broker", "layout");
  return { error: null, ok: _prev.ok + 1 };
}

/** Schimbă parola: întâi confirmă parola actuală (o nouă autentificare pe același cont), apoi o pune pe cea nouă. */
export async function changePassword(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const parsed = changePasswordSchema.safeParse({ current: form.get("current"), password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Parola nu e validă.", ok: _prev.ok };
  const { db } = await requireBroker();
  const { data } = await db.auth.getUser();
  const email = data.user?.email;
  if (!email) return { error: "Nu găsesc adresa contului. Ieșiți și intrați din nou.", ok: _prev.ok };

  const { error: wrong } = await db.auth.signInWithPassword({ email, password: parsed.data.current });
  if (wrong) return { error: "Parola actuală nu e corectă.", ok: _prev.ok };
  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("[profile] updateUser password", error.code);
    return { error: error.code === "weak_password" ? "Parola e prea slabă. Alegeți una mai lungă." : "Nu am putut schimba parola. Încercați din nou.", ok: _prev.ok };
  }
  return { error: null, ok: _prev.ok + 1 };
}
