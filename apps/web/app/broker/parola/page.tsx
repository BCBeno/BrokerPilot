import type { Metadata } from "next";
import Link from "next/link";
import { accessParamsSchema } from "@/lib/broker/team";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Alegeți parola · BrokerPilot", robots: { index: false } };

/**
 * Pagina din linkul de acces (`?token_hash=…&type=invite|recovery`). Afișarea nu consumă tokenul:
 * îl verifică abia formularul (`setPassword`), ca previzualizările de link din aplicațiile de chat să nu-l folosească.
 */
export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const params = accessParamsSchema.safeParse(await searchParams);
  const isNew = params.success && params.data.type === "invite";
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-navy px-6 py-3 text-navy-foreground">
        <span className="text-[15px] font-semibold">BrokerPilot</span>
        <span className="ml-3 text-sm text-navy-muted">Dashboard broker</span>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-16">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">{isNew ? "Bun venit în echipă" : "Parolă nouă"}</h1>
          {params.success ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {isNew ? "Alegeți parola cu care veți intra în cont." : "Alegeți o parolă nouă. Cea veche nu va mai funcționa."}
              </p>
              <PasswordForm tokenHash={params.data.token_hash} type={params.data.type} />
            </>
          ) : (
            <>
              <p role="alert" className="mt-2 text-sm text-destructive">
                Linkul nu e complet. Cereți administratorului un link nou.
              </p>
              <Link href="/broker/login" className="mt-4 inline-block text-sm underline underline-offset-4">
                Mergi la autentificare
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
