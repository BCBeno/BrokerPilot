import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Client cu sesiunea brokerului (cookie-uri), cheia publică și RLS. Pentru Server Components și Server Actions.
 * `null` dacă Supabase nu e configurat. Scrierea cookie-urilor eșuează în Server Components (doar citesc);
 * reîmprospătarea sesiunii o face `proxy.ts`.
 */
export async function getServerClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component: cookie-urile nu se pot scrie aici; le scrie proxy.ts la următoarea cerere.
        }
      },
    },
  });
}
