import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";

export type Broker = { id: string; name: string; agency_id: string };

/**
 * Brokerul logat și clientul lui (RLS pe agenție). Fără sesiune → login; cont fără broker activ → login cu mesaj.
 * `getClaims` verifică semnătura JWT-ului, deci nu ne bazăm pe cookie-uri necitite.
 */
export async function requireBroker(): Promise<{ db: SupabaseClient; broker: Broker }> {
  const db = await getServerClient();
  if (!db) redirect("/broker/login?e=config");
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/broker/login");
  const { data: broker } = await db.from("brokers").select("id, name, agency_id").eq("auth_user_id", userId).eq("active", true).maybeSingle();
  if (!broker) redirect("/broker/login?e=not_broker");
  return { db, broker };
}
