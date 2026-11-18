"use client";

import { useActionState } from "react";
import { inviteBroker, type InviteState } from "@/app/broker/team-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessLink } from "./access-link";

const INITIAL: InviteState = { error: null, link: null, name: null, email: null, mail: null, ok: 0 };

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteBroker, INITIAL);
  return (
    <>
      {/* `key` golește câmpurile după fiecare broker adăugat. */}
      <form key={state.ok} action={action} className="mt-2 flex flex-wrap items-end gap-3">
        <label className="block font-medium">
          Nume
          <Input name="name" required autoComplete="off" className="mt-1 h-8 w-52" />
        </label>
        <label className="block font-medium">
          E-mail (pentru login)
          <Input name="email" type="email" required autoComplete="off" className="mt-1 h-8 w-60" />
        </label>
        <label className="block font-medium">
          Telefon <span className="font-normal text-muted-foreground">(opțional)</span>
          <Input name="phone" type="tel" autoComplete="off" className="mt-1 h-8 w-40" />
        </label>
        <label className="flex h-8 items-center gap-2">
          <input type="checkbox" name="isAdmin" className="size-4" />
          Administrator
        </label>
        <Button type="submit" size="sm" className="h-8" disabled={pending}>
          {pending ? "Se creează…" : "Adaugă și creează link"}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="mt-2 text-destructive">
          {state.error}
        </p>
      )}
      {state.link && state.name && <AccessLink link={state.link} name={state.name} email={state.email} mail={state.mail} />}
    </>
  );
}
