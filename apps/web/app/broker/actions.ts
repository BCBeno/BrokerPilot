"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addDays, todayRo } from "@/lib/broker/renewals";
import { requireBroker } from "@/lib/broker/session";
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

const snoozeSchema =z.union([z.literal(1), z.literal(3), z.literal(7)]);

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
