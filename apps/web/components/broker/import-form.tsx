"use client";

import { CheckCircle2, CircleAlert, Download, Upload } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { importPortfolio, type ImportState } from "@/app/broker/portfolio-actions";
import { Button } from "@/components/ui/button";
import { PORTFOLIO_COLUMNS, SAMPLE_CSV } from "@/lib/broker/portfolio";

const SAMPLE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${SAMPLE_CSV}`)}`;

/** Încărcarea CSV-ului și raportul: ce s-a adăugat, ce exista deja, ce rânduri au probleme (cu linia). */
export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importPortfolio, { status: "idle" });

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3 rounded-md border border-border p-3">
        <label className="block">
          <span className="mb-1 block font-medium">Fișier CSV</span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-[13px] file:mr-3 file:h-8 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:text-[13px] file:font-medium"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="cta" className="h-9 px-4 text-[13px]" disabled={pending}>
            <Upload aria-hidden className="size-4" /> {pending ? "Se importă…" : "Importă"}
          </Button>
          <a
            href={SAMPLE_HREF}
            download="portofoliu-model.csv"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 font-medium hover:bg-muted"
          >
            <Download aria-hidden className="size-4" /> Descarcă modelul CSV
          </a>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Un rând = o poliță, cu clientul și vehiculul ei. Coloane: {PORTFOLIO_COLUMNS.join(", ")}. Separator „;” sau „,”, date ZZ.LL.AAAA.
          Clienții existenți se recunosc după telefon, e-mail sau nume, vehiculele după număr, polițele după asigurător și număr: același
          fișier importat de două ori nu dublează nimic.
        </p>
      </form>

      {state.status === "error" && (
        <div role="alert" className="rounded-md bg-tone-danger px-3 py-2 text-tone-danger-foreground">
          <p className="flex items-center gap-1.5 font-semibold">
            <CircleAlert aria-hidden className="size-4" /> {state.message}
          </p>
          <RowErrors errors={state.errors} />
        </div>
      )}

      {state.status === "done" && (
        <div role="status" className="space-y-2">
          <div className="rounded-md bg-tone-ok px-3 py-2 text-tone-ok-foreground">
            <p className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 aria-hidden className="size-4" /> Import terminat: {state.totalRows} {state.totalRows === 1 ? "rând" : "rânduri"} citite.
            </p>
            <ul className="mt-1 ml-[22px] list-disc">
              <li>
                {state.newClients} clienți noi, {state.matchedClients} existenți recunoscuți
              </li>
              <li>{state.newVehicles} vehicule noi</li>
              <li>
                {state.newPolicies} polițe noi
                {state.duplicatePolicies > 0 && `, ${state.duplicatePolicies} existau deja (sărite)`}
              </li>
            </ul>
            <p className="mt-1">
              <Link href="/broker/reinnoiri" className="font-medium underline">
                Vezi reînnoirile
              </Link>
            </p>
          </div>
          {state.errors.length > 0 && (
            <div className="rounded-md bg-tone-todo px-3 py-2 text-tone-todo-foreground">
              <p className="font-semibold">
                {state.errors.length === 1 ? "Un rând nu a fost importat" : `${state.errors.length} rânduri nu au fost importate`}
              </p>
              <RowErrors errors={state.errors} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RowErrors({ errors }: { errors: { line: number; message: string }[] }) {
  if (!errors.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {errors.map((e, i) => (
        <li key={i}>
          <span className="font-medium tabular-nums">Linia {e.line}:</span> {e.message}
        </li>
      ))}
    </ul>
  );
}
