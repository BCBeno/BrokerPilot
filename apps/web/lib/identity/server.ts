import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { getAdminClient } from "@/lib/supabase/admin";
import { otpSecret, readIdentityToken } from "./otp";
import type { ClientRow, PolicyRow, VehicleRow } from "./prefill";

export type IdentityContext = { db: SupabaseClient; secret: string; env: ServerEnv };

/** Baza de date (service role: `identity_verifications` nu are politici RLS) și secretul pentru hash-uri. `null` = neconfigurat. */
export function identityContext(): IdentityContext | null {
  const env = getServerEnv();
  const db = getAdminClient();
  const secret = otpSecret(env);
  return db && secret ? { db, secret, env } : null;
}

/** Clientul din spatele unui token de identitate: verificarea trebuie să existe, să fie „verified” și să aibă client. */
export async function verifiedClientId(ctx: IdentityContext, token: unknown): Promise<string | null> {
  const verificationId = readIdentityToken(ctx.secret, token);
  if (!verificationId) return null;
  const { data, error } = await ctx.db
    .from("identity_verifications")
    .select("client_id, status")
    .eq("id", verificationId)
    .maybeSingle();
  if (error || !data || data.status !== "verified" || !data.client_id) return null;
  return data.client_id as string;
}

/** Ziua accidentului (`YYYY-MM-DD`) din ciornă, sau azi. Contează doar pentru alegerea poliței valabile. */
export function accidentDay(occurredAt: unknown, now = new Date()): string {
  const d = typeof occurredAt === "string" ? new Date(occurredAt) : now;
  return (Number.isNaN(d.getTime()) ? now : d).toISOString().slice(0, 10);
}

export async function loadClientCar(db: SupabaseClient, clientId: string) {
  const [client, vehicles, policies] = await Promise.all([
    db.from("clients").select("full_name, phone, email").eq("id", clientId).maybeSingle(),
    db.from("vehicles").select("id, plate, vin, make, model, year").eq("client_id", clientId).order("plate"),
    db.from("policies").select("vehicle_id, type, insurer, policy_no, valid_from, valid_to").eq("client_id", clientId),
  ]);
  if (client.error || vehicles.error || policies.error || !client.data) return null;
  return {
    client: client.data as ClientRow,
    vehicles: (vehicles.data ?? []) as VehicleRow[],
    policies: (policies.data ?? []) as PolicyRow[],
  };
}
