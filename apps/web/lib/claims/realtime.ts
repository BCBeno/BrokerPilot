"use client";

import { claimChannel } from "@/lib/amiabila/claim";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Ascultă semnale pe canalul dosarului (Supabase Realtime Broadcast). Mesajele nu poartă date personale:
 * la un semnal, A cere starea de la server. Returnează funcția de oprire. Fără Supabase configurat nu face nimic
 * (A are oricum interogare periodică ca rezervă).
 */
export function listenToClaim(claimId: string, events: string[], onSignal: (event: string) => void): () => void {
  const supabase = getBrowserClient();
  if (!supabase) return () => {};
  const channel = supabase.channel(claimChannel(claimId));
  for (const event of events) channel.on("broadcast", { event }, () => onSignal(event));
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Trimite un semnal (fără conținut) și închide canalul. Eșecul e ignorat: celălalt telefon se sincronizează oricum prin interogare. */
export async function signalClaim(claimId: string, event: string): Promise<void> {
  const supabase = getBrowserClient();
  if (!supabase) return;
  const channel = supabase.channel(claimChannel(claimId));
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 4000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await channel.send({ type: "broadcast", event, payload: {} });
  } catch {
    /* ignorat */
  } finally {
    void supabase.removeChannel(channel);
  }
}
