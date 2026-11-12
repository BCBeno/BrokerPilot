import { Users } from "lucide-react";

export default function ClientsHome() {
  return (
    <section className="hidden min-h-0 items-center justify-center rounded-lg border border-dashed border-border bg-card lg:flex">
      <div className="text-center text-[13px] text-muted-foreground">
        <Users aria-hidden className="mx-auto mb-2 size-6" />
        Alegeți un client din listă ca să vedeți fișa lui.
      </div>
    </section>
  );
}
