"use client";

import { useMemo } from "react";
import { useDraft, useHydrated } from "@/lib/amiabila/draft-store";
import { buildForm } from "@/lib/amiabila/form";
import { DocumentView } from "./document-view";

/** Formularul completat cu ce a răspuns șoferul A în wizard. Ce lipsește rămâne gol, ca pe hârtie. */
export function DraftDocument() {
  const draft = useDraft();
  const hydrated = useHydrated();
  const form = useMemo(() => buildForm(draft), [draft]);
  if (!hydrated) return null;
  return (
    <DocumentView
      form={form}
      backHref="/amiabila/rezumat"
      notice="Documentul are datele completate până acum. Coloana vehiculului B, martorii, schița și semnăturile se adaugă în pașii următori."
    />
  );
}
