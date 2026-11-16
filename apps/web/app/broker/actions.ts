"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addDays, todayRo } from "@/lib/broker/renewals";
import { requireBroker } from "@/lib/broker/session";
import { CLAIM_BUCKET } from "@/lib/claims/files";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });

export type LoginState = { error: string | null };

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Introduceți adresa de e-mail și parola." };
  const db = await getServerClient();
  if (!db) return { error: "Autentificarea nu e configurată pe acest server." };
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error) return { error: "E-mailul sau parola nu sunt corecte." };
  redirect("/broker");
}

export async function signOut() {
  const db = await getServerClient();
  await db?.auth.signOut();
  redirect("/broker/login");
}

/**
 * „Preiau”: dosarul trece la brokerul logat și în „În lucru”. RLS permite update doar în agenția lui.
 * Un dosar deja preluat de alt broker nu se suprascrie.
 */
export async function takeClaim(claimId: string) {
  const id = z.uuid().parse(claimId);
  const { db, broker } = await requireBroker();
  const { error } = await db
    .from("claims")
    .update({ broker_id: broker.id, status: "in_progress" })
    .eq("id", id)
    .or(`broker_id.is.null,broker_id.eq.${broker.id}`)
    .in("status", ["signed", "submitted", "in_progress"]);
  if (error) throw new Error("Nu am putut prelua dosarul.");
  revalidatePath("/broker", "layout");
}

export async function closeClaim(claimId: string) {
  const id = z.uuid().parse(claimId);
  const { db, broker } = await requireBroker();
  const { error } = await db.from("claims").update({ status: "closed" }).eq("id", id).eq("broker_id", broker.id);
  if (error) throw new Error("Nu am putut închide dosarul.");
  revalidatePath("/broker", "layout");
}

/** „Marchează ca verificat”: brokerul a confirmat datele unui client adăugat automat din dosar. */
export async function verifyClient(clientId: string) {
  const id = z.uuid().parse(clientId);
  const { db } = await requireBroker();
  const { error } = await db.from("clients").update({ needs_review: false }).eq("id", id);
  if (error) throw new Error("Nu am putut salva. Încercați din nou.");
  revalidatePath("/broker", "layout");
}

const noteSchema = z.string().trim().min(1, "Scrieți nota.").max(2000, "Nota e prea lungă (cel mult 2000 de caractere).");

export type NoteState = { error: string | null; ok: number };

/**
 * Notă internă pe dosar (ex. „clientul a trimis pe WhatsApp devizul”). E un rând în `events` (apare și în istoric);
 * RLS (`events_insert_claim_note`) permite doar dosare din agenția brokerului și doar în numele lui. Nu se editează, nu se șterge.
 */
export async function addClaimNote(claimId: string, _prev: NoteState, form: FormData): Promise<NoteState> {
  const id = z.uuid().parse(claimId);
  const text = noteSchema.safeParse(form.get("text"));
  if (!text.success) return { error: text.error.issues[0]?.message ?? "Nota nu e validă.", ok: _prev.ok };
  const { db, broker } = await requireBroker();
  const { error } = await db
    .from("events")
    .insert({ entity_type: "claim", entity_id: id, type: "broker_note", payload: { broker_id: broker.id, text: text.data } });
  if (error) return { error: "Nu am putut salva nota. Încercați din nou.", ok: _prev.ok };
  revalidatePath("/broker", "layout");
  return { error: null, ok: _prev.ok + 1 };
}

/**
 * Șterge un fișier adăugat greșit. Doar fișierele încărcate de broker (`uploaded_by`), niciodată pozele sau actele șoferilor.
 * RLS confirmă că fișierul e într-un dosar al agenției; ștergerea efectivă merge cu service_role (brokerul nu scrie în Storage).
 */
export async function removeClaimFile(claimId: string, fileId: string) {
  const claim = z.uuid().parse(claimId);
  const file = z.uuid().parse(fileId);
  const { db } = await requireBroker();
  const admin = getAdminClient();
  if (!admin) throw new Error("Serviciul nu e disponibil acum.");
  const { data } = await db
    .from("claim_files")
    .select("storage_path")
    .eq("id", file)
    .eq("claim_id", claim)
    .not("uploaded_by", "is", null)
    .maybeSingle();
  if (!data) throw new Error("Fișierul nu mai există sau nu poate fi șters.");
  const { error } = await admin.from("claim_files").delete().eq("id", file);
  if (error) throw new Error("Nu am putut șterge fișierul. Încercați din nou.");
  await admin.storage.from(CLAIM_BUCKET).remove([data.storage_path]);
  revalidatePath("/broker", "layout");
}

/**
 * „Atașează” un apel vocal la dosar. Funcția SQL `attach_voice_call` verifică singură că apelul și dosarul sunt ale
 * agenției brokerului și că apelul nu era deja legat, apoi scrie interacțiunea și evenimentul din istoric.
 */
export async function attachCall(claimId: string, conversationId: string) {
  const claim = z.uuid().parse(claimId);
  const conversation = z.uuid().parse(conversationId);
  const { db } = await requireBroker();
  const { data, error } = await db.rpc("attach_voice_call", { p_conversation_id: conversation, p_claim_id: claim });
  if (error || data !== true) throw new Error("Nu am putut atașa apelul. Poate e deja legat de un dosar.");
  revalidatePath("/broker", "layout");
}

/** „Atașează la dosar” din pagina Apeluri: același lucru, cu dosarul ales din listă (câmpurile `claim` și `call`). */
export async function attachCallFromList(form: FormData) {
  const claim = z.uuid().safeParse(form.get("claim"));
  const call = z.uuid().safeParse(form.get("call"));
  if (!claim.success || !call.success) throw new Error("Alegeți dosarul.");
  await attachCall(claim.data, call.data);
}

/** „Ignoră”: apelul nu ține de niciun dosar și nu mai e propus. Rămâne în baza de date. */
export async function ignoreCall(conversationId: string) {
  const conversation = z.uuid().parse(conversationId);
  const { db } = await requireBroker();
  const { error } = await db
    .from("conversations")
    .update({ claim_ignored_at: new Date().toISOString() })
    .eq("id", conversation)
    .eq("channel", "voice")
    .is("claim_id", null);
  if (error) throw new Error("Nu am putut salva. Încercați din nou.");
  revalidatePath("/broker", "layout");
}

const snoozeSchema = z.union([z.literal(1), z.literal(3), z.literal(7)]);

/**
 * Reînnoiri: „Am contactat” și „Reamintește-mi” sunt rânduri în `events` (entity_type 'policy').
 * RLS (`events_insert_renewal`) permite doar aceste tipuri, în numele brokerului logat, pe polițe din agenția lui.
 */
async function recordRenewal(policyId: string, type: "renewal_contacted" | "renewal_snoozed", extra: Record<string, string> = {}) {
  const id = z.uuid().parse(policyId);
  const { db, broker } = await requireBroker();
  const { error } = await db.from("events").insert({ entity_type: "policy", entity_id: id, type, payload: { broker_id: broker.id, ...extra } });
  if (error) throw new Error("Nu am putut salva acțiunea. Încercați din nou.");
  revalidatePath("/broker", "layout");
}

export async function markRenewalContacted(policyId: string) {
  await recordRenewal(policyId, "renewal_contacted");
}

export async function snoozeRenewal(policyId: string, days: number) {
  const n = snoozeSchema.parse(days);
  await recordRenewal(policyId, "renewal_snoozed", { until: addDays(todayRo(), n) });
}
