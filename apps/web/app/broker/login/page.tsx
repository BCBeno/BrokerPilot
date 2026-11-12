import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Autentificare broker · BrokerPilot" };

const NOTES: Record<string, string> = {
  not_broker: "Contul nu e asociat unui broker activ. Cereți administratorului să vă adauge.",
  config: "Autentificarea nu e configurată pe acest server.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-navy px-6 py-3 text-navy-foreground">
        <span className="text-[15px] font-semibold">BrokerPilot</span>
        <span className="ml-3 text-sm text-navy-muted">Dashboard broker</span>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-16">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">Autentificare</h1>
          <p className="mt-1 text-sm text-muted-foreground">Contul de broker al agenției.</p>
          <LoginForm note={e ? (NOTES[e] ?? null) : null} />
        </div>
      </main>
    </div>
  );
}
