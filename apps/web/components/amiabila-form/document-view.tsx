"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormData } from "@/lib/amiabila/form";
import { FitToWidth } from "./fit-to-width";
import { FormBack } from "./form-back";
import { FormSheet } from "./form-sheet";

/** Documentul complet, în două pagini, cu bară de unelte (ascunsă la tipar). */
export function DocumentView({ form, backHref, notice }: { form: FormData; backHref: string; notice?: string }) {
  return (
    <main className="min-h-screen bg-neutral-200 px-2 py-4 print:bg-white print:p-0">
      <div className="af-noprint mx-auto mb-3 flex max-w-[794px] flex-wrap items-center justify-between gap-2">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[15px] font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Înapoi
        </Link>
        <Button variant="cta" className="h-11 px-4 text-base" onClick={() => window.print()}>
          <Printer aria-hidden />
          Tipărește sau salvează PDF
        </Button>
      </div>
      {notice ? <p className="af-noprint mx-auto mb-3 max-w-[794px] text-sm text-neutral-700">{notice}</p> : null}

      <div className="af-page-break mx-auto max-w-[794px] shadow-md print:shadow-none">
        <FitToWidth width={794} height={1123}>
          <FormSheet form={form} />
        </FitToWidth>
      </div>

      <div className="mx-auto mt-4 max-w-[1123px] shadow-md print:mt-0 print:shadow-none">
        <FitToWidth width={1123} height={794}>
          <FormBack />
        </FitToWidth>
      </div>
    </main>
  );
}
