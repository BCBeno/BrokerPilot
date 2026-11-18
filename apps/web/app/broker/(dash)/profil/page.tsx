import type { Metadata } from "next";
import { ProfileTabs } from "@/components/broker/profile/profile-forms";
import { displayName } from "@/lib/broker/format";
import { requireBroker } from "@/lib/broker/session";

export const metadata: Metadata = { title: "Profil · BrokerPilot" };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export default async function ProfilePage() {
  const { db, broker } = await requireBroker();
  const { data: me } = await db
    .from("brokers")
    .select("name, phone, email")
    .eq("id", broker.id)
    .maybeSingle<{ name: string; phone: string | null; email: string | null }>();
  const name = displayName(me?.name ?? broker.name);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-card px-5 py-5 text-[13px]">
      <header className="mb-5 flex items-center gap-3">
        <div aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy text-[14px] font-semibold text-navy-foreground">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] leading-tight font-semibold">{name}</h1>
          <p className="text-muted-foreground">{broker.is_admin ? "Administrator" : "Broker"}</p>
        </div>
      </header>
      <ProfileTabs name={me?.name ?? broker.name} phone={me?.phone ?? ""} email={me?.email ?? null} />
    </main>
  );
}
