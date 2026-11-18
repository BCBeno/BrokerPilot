"use client";

import { Check } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { deleteMember, newAccessLink, setBrokerActive, updateMember, type LinkResult, type MemberState } from "@/app/broker/team-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AccessLink } from "./access-link";

export type MemberView = {
  id: string;
  name: string; // brut, pentru formular
  label: string; // afișat („prenume nume”)
  email: string | null;
  phone: string | null;
  phoneLabel: string | null;
  active: boolean;
  isAdmin: boolean;
  hasLogin: boolean;
  added: string;
  isSelf: boolean;
};

const COLS = 5;
const INITIAL: MemberState = { error: null, ok: 0 };

function EditForm({ m, onClose }: { m: MemberView; onClose: (saved: boolean) => void }) {
  const [state, action, pending] = useActionState(updateMember.bind(null, m.id), INITIAL);
  useEffect(() => {
    if (state.ok > 0) onClose(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doar la o salvare nouă
  }, [state.ok]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="block font-medium">
        Nume
        <Input name="name" defaultValue={m.name} required autoComplete="off" className="mt-1 h-8 w-52" />
      </label>
      <label className="block font-medium">
        E-mail de login
        <Input name="email" type="email" defaultValue={m.email ?? ""} required autoComplete="off" className="mt-1 h-8 w-60" />
      </label>
      <label className="block font-medium">
        Telefon <span className="font-normal text-muted-foreground">(opțional)</span>
        <Input name="phone" type="tel" defaultValue={m.phone ?? ""} autoComplete="off" className="mt-1 h-8 w-40" />
      </label>
      <label className={cn("flex h-8 items-center gap-2", m.isSelf && "text-muted-foreground")}>
        <input type="checkbox" name="isAdmin" defaultChecked={m.isAdmin} disabled={m.isSelf} className="size-4" />
        Administrator
        {/* Checkbox-ul dezactivat nu se trimite; propriul rol de admin rămâne. */}
        {m.isSelf && <input type="hidden" name="isAdmin" value="on" />}
      </label>
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" className="h-8" disabled={pending}>
          {pending ? "Se salvează…" : "Salvează"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8" disabled={pending} onClick={() => onClose(false)}>
          Renunță
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="basis-full text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function MemberRow({ m }: { m: MemberView }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [link, setLink] = useState<LinkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nu am putut salva. Încercați din nou.");
      }
    });

  return (
    <>
      <tr className={cn("align-top", !editing && !link && "border-b border-border", !m.active && "text-muted-foreground")}>
        <td className="px-5 py-2.5">
          <span className="font-medium">{m.label}</span>
          {m.isSelf && <span className="ml-1.5 text-muted-foreground">(dvs.)</span>}
          {m.isAdmin && <span className="ml-2 rounded bg-tone-info px-1.5 py-0.5 text-[11px] text-tone-info-foreground">administrator</span>}
        </td>
        <td className="px-3 py-2.5">
          <div>{m.email ?? "fără e-mail"}</div>
          {m.phoneLabel && <div className="text-muted-foreground">{m.phoneLabel}</div>}
        </td>
        <td className="px-3 py-2.5">{!m.active ? "Dezactivat" : m.hasLogin ? "Are cont" : "Fără cont"}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">{m.added}</td>
        <td className="px-5 py-2.5 text-right">
          <div className="inline-flex flex-wrap justify-end gap-1.5">
            {saved && !editing && (
              <span role="status" className="inline-flex h-7 items-center gap-1 text-tone-ok-foreground">
                <Check aria-hidden className="size-4" />
                Salvat
              </span>
            )}
            {!editing && (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => (setSaved(false), setEditing(true))}>
                Modifică
              </Button>
            )}
            {m.active && m.hasLogin && m.email && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await newAccessLink(m.id);
                    if (r.error) setError(r.error);
                    setLink(r.link ? r : null);
                  })
                }
              >
                Link nou
              </Button>
            )}
            {!m.isSelf && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (m.active && !window.confirm(`Dezactivați accesul pentru ${m.label}? Nu mai poate intra în cont. Îl puteți reactiva oricând.`)) return;
                  run(() => setBrokerActive(m.id, !m.active));
                }}
              >
                {m.active ? "Dezactivează" : "Reactivează"}
              </Button>
            )}
            {!m.isSelf && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-tone-danger hover:text-tone-danger-foreground"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Ștergeți contul lui ${m.label}? Nu mai poate intra, iar dosarele și clienții lui rămân fără broker alocat. Ștergerea nu se poate anula.`)) return;
                  run(() => deleteMember(m.id));
                }}
              >
                Șterge
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-1 text-destructive">
              {error}
            </p>
          )}
        </td>
      </tr>
      {(editing || link) && (
        <tr className="border-b border-border">
          <td colSpan={COLS} className="bg-muted/40 px-5 py-3">
            {editing && (
              <EditForm
                m={m}
                onClose={(ok) => {
                  setEditing(false);
                  setSaved(ok);
                }}
              />
            )}
            {link?.link && <AccessLink link={link.link} name={m.label} email={link.email} mail={link.mail} onClose={() => setLink(null)} />}
          </td>
        </tr>
      )}
    </>
  );
}
