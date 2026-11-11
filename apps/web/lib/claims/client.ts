"use client";

import type { PartyState } from "@/lib/amiabila/claim";

/** Apeluri către server ale unui șofer (A sau B). Tokenul îl identifică; la eșec întoarcem un mesaj gata de afișat. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<Result<T>> {
  try {
    const res = await fetch(path, { ...init, headers: { ...init.headers, "x-claim-token": token }, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (res.ok) return { ok: true, data: json };
    return { ok: false, error: json.error ?? "A apărut o eroare. Încercați din nou.", status: res.status };
  } catch {
    return { ok: false, error: "Nu avem conexiune. Verificați internetul și încercați din nou.", status: 0 };
  }
}

export const getPartyState = (token: string) => call<PartyState>("/api/party", token);

export async function uploadPhoto(token: string, dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  const body = new FormData();
  body.append("file", blob, "poza.jpg");
  return call<{ id: string }>("/api/party/files", token, { method: "POST", body });
}

export const deletePhoto = (token: string, id: string) => call<{ ok: true }>(`/api/party/files/${id}`, token, { method: "DELETE" });

export const putSignature = (token: string, signature: string) =>
  call<{ ok: true; bothSigned: boolean }>("/api/party/signature", token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signature }),
  });
