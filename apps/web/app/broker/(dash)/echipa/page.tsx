import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InviteForm } from "@/components/broker/team/invite-form";
import { MemberRow, type MemberView } from "@/components/broker/team/member-row";
import { displayName, phoneDisplay } from "@/lib/broker/format";
import { requireBroker } from "@/lib/broker/session";

export const metadata: Metadata = { title: "Echipă · BrokerPilot" };

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });

export default async function TeamPage() {
  const { db, broker } = await requireBroker();
  if (!broker.is_admin) redirect("/broker");

  // RLS: orice broker activ citește `brokers` (și pe cei inactivi), deci nu e nevoie de service_role pentru listă.
  const { data, error } = await db
    .from("brokers")
    .select("id, name, email, phone, active, is_admin, auth_user_id, created_at")
    .order("active", { ascending: false })
    .order("name");
  const members: MemberView[] = (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    label: displayName(b.name),
    email: b.email,
    phone: b.phone,
    phoneLabel: b.phone ? phoneDisplay(b.phone) : null,
    active: b.active,
    isAdmin: b.is_admin,
    hasLogin: b.auth_user_id !== null,
    added: dateLabel(b.created_at),
    isSelf: b.id === broker.id,
  }));
  const activeCount = members.filter((m) => m.active).length;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-card">
      <section aria-labelledby="titlu" className="text-[13px]">
        <header className="border-b border-border px-5 py-3">
          <h1 id="titlu" className="text-[20px] leading-tight font-semibold">
            Echipă
          </h1>
          <p className="mt-0.5 text-muted-foreground">
            {activeCount} {activeCount === 1 ? "broker activ" : "brokeri activi"}. Orice broker activ vede toate dosarele și clienții firmei.
          </p>
        </header>

        <div className="border-b border-border px-5 py-3">
          <h2 className="font-semibold">Adaugă broker</h2>
          <p className="mt-0.5 text-muted-foreground">
            Brokerul primește pe e-mail un link de acces, din care își alege parola. Linkul apare și aici, ca să-l puteți copia.
          </p>
          <InviteForm />
        </div>

        {error ? (
          <p role="alert" className="px-5 py-3 text-destructive">
            Nu am putut încărca lista. Reîncărcați pagina.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="px-5 py-2 font-medium">Broker</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Acces</th>
                <th className="px-3 py-2 font-medium">Adăugat</th>
                <th className="px-5 py-2 text-right font-medium">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <MemberRow key={m.id} m={m} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
