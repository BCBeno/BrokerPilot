"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccessType } from "@/lib/broker/team";
import { setPassword, type PasswordState } from "../team-actions";

export function PasswordForm({ tokenHash, type }: { tokenHash: string; type: AccessType }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, { error: null });
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <label className="block text-sm font-medium">
        Parolă
        <Input name="password" type="password" autoComplete="new-password" minLength={10} required className="mt-1 h-10" />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">Cel puțin 10 caractere.</span>
      </label>
      <label className="block text-sm font-medium">
        Repetați parola
        <Input name="confirm" type="password" autoComplete="new-password" minLength={10} required className="mt-1 h-10" />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
        {pending ? "Se salvează…" : "Salvează parola și intră"}
      </Button>
    </form>
  );
}
