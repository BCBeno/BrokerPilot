"use client";

import { createContext, useContext, useMemo } from "react";
import { B_STEPS, STEPS, type Draft, type StepList } from "@/lib/amiabila/draft";
import { A_DRAFT_KEY, bDraftKey, getDraftStore, useDraftStore } from "@/lib/amiabila/draft-store";

/** Cine completează: A pe `/amiabila/...`, B pe `/b/<token>/...`. Pașii partajați (acte, circumstanțe, impact) citesc de aici. */
type WizardConfig = { role: "A" | "B"; basePath: string; steps: StepList; storeKey: string; token: string | null };

const A_CONFIG: WizardConfig = { role: "A", basePath: "/amiabila", steps: STEPS, storeKey: A_DRAFT_KEY, token: null };

const WizardContext = createContext<WizardConfig>(A_CONFIG);

export function BWizardProvider({ token, children }: { token: string; children: React.ReactNode }) {
  const config = useMemo<WizardConfig>(
    () => ({ role: "B", basePath: `/b/${token}`, steps: B_STEPS, storeKey: bDraftKey(token), token }),
    [token],
  );
  return <WizardContext.Provider value={config}>{children}</WizardContext.Provider>;
}

export function useWizard() {
  const config = useContext(WizardContext);
  const store = getDraftStore(config.storeKey);
  const draft: Draft = useDraftStore(store);
  /** Cheia șoferului pentru server: la B tokenul din link, la A `aToken` din dosar (null până se creează dosarul). */
  const partyToken = config.role === "B" ? config.token : (draft.claim?.aToken ?? null);
  return { ...config, draft, update: store.update, reset: store.reset, partyToken };
}
