"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, type LoginState } from "../actions";

export function LoginForm({ note }: { note: string | null }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, { error: null });
  const message = state.error ?? note;
  return (
    <form action={action} className="mt-5 space-y-4">
      <label className="block text-sm font-medium">
        E-mail
        <Input name="email" type="email" autoComplete="username" required className="mt-1 h-10" />
      </label>
      <label className="block text-sm font-medium">
        Parolă
        <Input name="password" type="password" autoComplete="current-password" required className="mt-1 h-10" />
      </label>
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
        {pending ? "Se verifică…" : "Intră în cont"}
      </Button>
    </form>
  );
}
