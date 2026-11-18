"use client";

import { Check } from "lucide-react";
import { useActionState, useState, type ComponentProps, type ReactNode } from "react";
import { changePassword, updateProfile, type ProfileState } from "@/app/broker/profile-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const INITIAL: ProfileState = { error: null, ok: 0 };

/** Un câmp pe un rând: eticheta deasupra, eventual o notă scurtă dedesubt. */
export function Field({ label, hint, ...input }: { label: string; hint?: ReactNode } & ComponentProps<typeof Input>) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <Input {...input} className={cn("mt-1 h-9 w-full text-[13px]", input.className)} />
      {hint && <span className="mt-1 block text-[12px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Butonul și, lângă el, rezultatul ultimei salvări (eroarea rămâne până la următoarea încercare). */
export function SubmitRow({ state, pending, idle, busy, done, disabled }: { state: ProfileState; pending: boolean; idle: string; busy: string; done: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <Button type="submit" size="sm" className="h-9 px-4" disabled={pending || disabled}>
        {pending ? busy : idle}
      </Button>
      {!pending && state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      {!pending && !state.error && state.ok > 0 && (
        <p role="status" className="inline-flex items-center gap-1 text-tone-ok-foreground">
          <Check aria-hidden className="size-4" />
          {done}
        </p>
      )}
    </div>
  );
}

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email?: string | null }) {
  const [state, action, pending] = useActionState(updateProfile, INITIAL);
  const [values, setValues] = useState({ name, phone });
  const dirty = values.name !== name || values.phone !== phone;
  return (
    <form action={action} className="space-y-4">
      <Field label="Nume" name="name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} required autoComplete="name" />
      <Field
        label="Telefon"
        name="phone"
        type="tel"
        value={values.phone}
        onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
        autoComplete="tel"
      />
      {email && <Field label="E-mail" hint="Îl schimbă un administrator." value={email} readOnly tabIndex={-1} className="bg-muted text-muted-foreground" />}
      <SubmitRow state={state} pending={pending} idle="Salvează modificările" busy="Se salvează…" done="Modificările au fost salvate." disabled={!dirty} />
    </form>
  );
}

/** O condiție a parolei noi; se bifează singură pe măsură ce se scrie. */
function Check_({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <li className={cn("flex items-center gap-2 transition-colors", met ? "text-tone-ok-foreground" : "text-muted-foreground")}>
      <span aria-hidden className={cn("flex size-4 items-center justify-center rounded-full border", met ? "border-transparent bg-tone-ok-foreground text-white" : "border-input")}>
        {met && <Check className="size-3" strokeWidth={3} />}
      </span>
      {children}
      <span className="sr-only">{met ? " (îndeplinită)" : " (neîndeplinită)"}</span>
    </li>
  );
}

export function PasswordChangeForm() {
  const [state, action, pending] = useActionState(changePassword, INITIAL);
  // `key` remontează câmpurile (și golește parolele) doar după o schimbare reușită, nu și la eroare.
  return <PasswordFields key={state.ok} state={state} action={action} pending={pending} />;
}

function PasswordFields({ state, action, pending }: { state: ProfileState; action: (fd: FormData) => void; pending: boolean }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const longEnough = pw.length >= 10;
  const matches = pw.length > 0 && pw === confirm;
  return (
    <form action={action} className="space-y-4">
      <Field label="Parola actuală" name="current" type="password" required autoComplete="current-password" />
      <Field label="Parola nouă" name="password" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      <Field label="Repetați parola nouă" name="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      <ul className="space-y-1.5 text-[12px]" aria-label="Condiții pentru parola nouă">
        <Check_ met={longEnough}>Cel puțin 10 caractere</Check_>
        <Check_ met={matches}>Cele două parole coincid</Check_>
      </ul>
      <SubmitRow state={state} pending={pending} idle="Schimbă parola" busy="Se schimbă…" done="Parola a fost schimbată." disabled={!longEnough || !matches} />
    </form>
  );
}

/** Două file, un singur formular pe ecran: datele personale și securitatea. */
export function ProfileTabs({ name, phone, email }: { name: string; phone: string; email: string | null }) {
  const [tab, setTab] = useState<"date" | "securitate">("date");
  const tabs = [
    { id: "date", label: "Date personale" },
    { id: "securitate", label: "Securitate" },
  ] as const;
  return (
    <div>
      <div role="tablist" aria-label="Setări profil" className="flex gap-6 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              tab === t.id ? "border-navy text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="max-w-sm pt-5">
        {tab === "date" ? (
          <div className="space-y-4">
            <ProfileForm name={name} phone={phone} />
            {email && (
              <label className="block">
                <span className="font-medium">E-mail</span>
                <Input value={email} readOnly tabIndex={-1} className="mt-1 h-9 w-full bg-muted text-[13px] text-muted-foreground" />
                <span className="mt-1 block text-[12px] text-muted-foreground">Contul e legat de această adresă; o schimbă un administrator.</span>
              </label>
            )}
          </div>
        ) : (
          <PasswordChangeForm />
        )}
      </div>
    </div>
  );
}
