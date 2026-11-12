import Link from "next/link";

export default function ClientsHome() {
  return (
    <section className="hidden min-h-0 items-center justify-center lg:flex">
      <div className="max-w-sm text-center text-[13px] text-muted-foreground">
        <p>Alegeți un client din listă.</p>
        <p className="mt-1">
          Clienți noi:{" "}
          <Link href="/broker/clienti/import" className="font-medium text-foreground underline">
            importați portofoliul din CSV
          </Link>{" "}
          sau adăugați un șofer direct din dosar.
        </p>
      </div>
    </section>
  );
}
