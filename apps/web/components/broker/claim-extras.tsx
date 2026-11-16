"use client";

import { FileText, ImageIcon, Paperclip, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addClaimNote, removeClaimFile, type NoteState } from "@/app/broker/actions";
import { RoleTag } from "@/components/broker/status-pill";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ExtraFile = { id: string; name: string; url: string | null; role: "A" | "B" | null; pdf: boolean; at: string; by: string | null };
export type ClaimNote = { at: string; by: string | null; text: string };

const TZ = "Europe/Bucharest";
const when = (iso: string) =>
  new Date(iso).toLocaleString("ro-RO", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Ce adaugă brokerul după ce a primit dosarul: poze sau PDF-uri venite mai târziu (pe e-mail, WhatsApp) și note interne.
 * Datele semnate de șoferi și PDF-ul amiabilei rămân cum sunt; totul de aici apare și în istoric.
 */
export function ClaimExtras({ claimId, files, notes }: { claimId: string; files: ExtraFile[]; notes: ClaimNote[] }) {
  return (
    <section aria-labelledby="completari" className="border-b border-border py-3.5">
      <h2 id="completari" className="text-[14px] font-semibold">
        Completări de la broker
      </h2>
      <p className="text-[12px] text-muted-foreground">
        Poze sau documente primite după trimiterea dosarului și note interne.
      </p>
      <div className="mt-2.5 grid gap-x-8 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Files claimId={claimId} files={files} />
        <Notes claimId={claimId} notes={notes} />
      </div>
    </section>
  );
}

function Files({ claimId, files }: { claimId: string; files: ExtraFile[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<"A" | "B" | "doc">("doc");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();

  async function upload() {
    const picked = Array.from(input.current?.files ?? []);
    if (picked.length === 0) {
      setMessage("Alegeți cel puțin un fișier.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const failed: string[] = [];
    for (const file of picked) {
      const body = new FormData();
      body.set("file", file);
      body.set("for", target);
      const res = await fetch(`/api/broker/claims/${claimId}/files`, { method: "POST", body }).catch(() => null);
      if (!res?.ok) {
        const err = (await res?.json().catch(() => null)) as { error?: string } | null;
        failed.push(`${file.name}: ${err?.error ?? "nu s-a putut încărca."}`);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    setMessage(failed.length ? failed.join(" ") : null);
    router.refresh();
  }

  function remove(f: ExtraFile) {
    if (!window.confirm(`Ștergeți „${f.name}” din dosar?`)) return;
    startRemove(async () => {
      try {
        await removeClaimFile(claimId, f.id);
        router.refresh();
      } catch {
        setMessage("Nu am putut șterge fișierul. Încercați din nou.");
      }
    });
  }

  return (
    <div>
      <h3 className="font-medium">Fișiere</h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="extra-for">
          Pentru cine e fișierul
        </label>
        <select
          id="extra-for"
          value={target}
          onChange={(e) => setTarget(e.target.value as "A" | "B" | "doc")}
          className="h-8 rounded-md border border-border bg-card px-2 text-[13px]"
        >
          <option value="doc">Document pentru dosar</option>
          <option value="A">Poză cu daune, șofer A</option>
          <option value="B">Poză cu daune, șofer B</option>
        </select>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-label="Alegeți pozele sau PDF-urile"
          className="max-w-full text-[12px] file:mr-2 file:h-8 file:rounded-md file:border file:border-border file:bg-card file:px-2 file:text-[13px] file:font-medium"
        />
        <Button type="button" variant="outline" className="h-8 px-3 text-[13px]" disabled={busy} onClick={upload}>
          <Paperclip aria-hidden className="size-3.5" /> {busy ? "Se încarcă…" : "Adaugă"}
        </Button>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">JPEG, PNG, WebP sau PDF, cel mult 10 MB fiecare. Pozele pentru A sau B apar și la Poze.</p>
      {message && (
        <p role="alert" className="mt-1.5 text-[12px] text-destructive">
          {message}
        </p>
      )}
      {files.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-1.5">
              {f.pdf ? <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <ImageIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
              {f.role && <RoleTag role={f.role} />}
              <span className="min-w-0 flex-1">
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noreferrer" className="block truncate font-medium underline-offset-2 hover:underline">
                    {f.name}
                  </a>
                ) : (
                  <span className="block truncate font-medium">{f.name}</span>
                )}
                <span className="block text-[12px] text-muted-foreground">
                  {when(f.at)}
                  {f.by && `, ${f.by}`}
                </span>
              </span>
              <button
                type="button"
                disabled={removing}
                onClick={() => remove(f)}
                aria-label={`Șterge ${f.name}`}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Notes({ claimId, notes }: { claimId: string; notes: ClaimNote[] }) {
  const [state, action, pending] = useActionState<NoteState, FormData>(addClaimNote.bind(null, claimId), { error: null, ok: 0 });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok > 0) form.current?.reset();
  }, [state.ok]);

  return (
    <div>
      <h3 className="font-medium">Note interne</h3>
      <form ref={form} action={action} className="mt-1.5">
        <label className="sr-only" htmlFor="note-text">
          Notă nouă
        </label>
        <Textarea
          id="note-text"
          name="text"
          maxLength={2000}
          rows={2}
          placeholder="Ex.: Clientul a trimis devizul pe e-mail; aștept procesul-verbal de la poliție."
          className="min-h-14 text-[13px] md:text-[13px]"
        />
        <div className="mt-1.5 flex items-center gap-3">
          <Button type="submit" variant="outline" className="h-8 px-3 text-[13px]" disabled={pending}>
            {pending ? "Se salvează…" : "Salvează nota"}
          </Button>
          {state.error && (
            <p role="alert" className="text-[12px] text-destructive">
              {state.error}
            </p>
          )}
        </div>
      </form>
      {notes.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {notes.map((n, i) => (
            <li key={i} className="py-1.5">
              <p className="text-[12px] text-muted-foreground">
                {when(n.at)}
                {n.by && `, ${n.by}`}
              </p>
              <p className="whitespace-pre-line">{n.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
