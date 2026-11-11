"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_DRAFT, parseDraft, type Draft } from "./draft";

/**
 * Ciorna amiabilei trăiește pe telefon (localStorage), ca să supraviețuiască unui refresh sau unui apel primit.
 * Nu conține date din acte; acestea vin în S3 și merg în Supabase. Dacă storage-ul e blocat, ținem ciorna doar în memorie.
 */
const KEY = "bp.amiabila.draft.v1";

let cachedRaw: string | null = null;
let cached: Draft = EMPTY_DRAFT;
const listeners = new Set<() => void>();

function read(): Draft {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cached = parseDraft(raw);
    }
  } catch {
    /* storage blocat: rămâne ciorna din memorie */
  }
  return cached;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useDraft(): Draft {
  return useSyncExternalStore(subscribe, read, () => EMPTY_DRAFT);
}

export function updateDraft(change: (draft: Draft) => Draft): void {
  const next = change(read());
  cached = next;
  cachedRaw = JSON.stringify(next);
  try {
    window.localStorage.setItem(KEY, cachedRaw);
  } catch {
    /* ignorat, vezi mai sus */
  }
  listeners.forEach((l) => l());
}

export function resetDraft(): void {
  updateDraft(() => EMPTY_DRAFT);
}
