"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_DRAFT, parseDraft, type Draft } from "./draft";

/**
 * Ciorna amiabilei trăiește pe telefon (localStorage), ca să supraviețuiască unui refresh sau unui apel primit.
 * Dacă storage-ul e blocat, ținem ciorna doar în memorie. Fiecare șofer are cheia lui: A `bp.amiabila.draft.v1`,
 * B `bp.amiabila.b.<token>` (un telefon poate fi invitat la mai multe dosare, fiecare cu ciorna lui).
 */
export type DraftStore = {
  read: () => Draft;
  subscribe: (onChange: () => void) => () => void;
  update: (change: (draft: Draft) => Draft) => void;
  reset: () => void;
};

export function createDraftStore(key: string): DraftStore {
  let cachedRaw: string | null = null;
  let cached: Draft = EMPTY_DRAFT;
  const listeners = new Set<() => void>();

  function read(): Draft {
    try {
      const raw = window.localStorage.getItem(key);
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

  function update(change: (draft: Draft) => Draft) {
    const next = change(read());
    cached = next;
    cachedRaw = JSON.stringify(next);
    try {
      window.localStorage.setItem(key, cachedRaw);
    } catch {
      /* ignorat, vezi mai sus */
    }
    listeners.forEach((l) => l());
  }

  return { read, subscribe, update, reset: () => update(() => EMPTY_DRAFT) };
}

const stores = new Map<string, DraftStore>();

/** Același store pentru aceeași cheie, ca toate componentele să vadă aceeași ciornă. */
export function getDraftStore(key: string): DraftStore {
  let store = stores.get(key);
  if (!store) {
    store = createDraftStore(key);
    stores.set(key, store);
  }
  return store;
}

export const A_DRAFT_KEY = "bp.amiabila.draft.v1";
export const bDraftKey = (token: string) => `bp.amiabila.b.${token}`;

export function useDraftStore(store: DraftStore): Draft {
  return useSyncExternalStore(store.subscribe, store.read, () => EMPTY_DRAFT);
}

const aStore = getDraftStore(A_DRAFT_KEY);

/** Ciorna șoferului A. Pașii partajați cu B folosesc `useWizard()` din `components/wizard/wizard-context`. */
export function useDraft(): Draft {
  return useDraftStore(aStore);
}

const noopSubscribe = () => () => {};

/** `false` pe server și la hidratare, `true` după. Ascunde conținutul până se citește ciorna, ca să nu apară ecrane goale. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function updateDraft(change: (draft: Draft) => Draft): void {
  aStore.update(change);
}

export function resetDraft(): void {
  aStore.reset();
}
