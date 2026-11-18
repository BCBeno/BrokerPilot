"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MailResult } from "@/lib/broker/mail";

type Props = { link: string; name: string; email?: string | null; mail?: MailResult | null; onClose?: () => void };

/**
 * Rezultatul unui link de acces. Dacă a plecat pe e-mail, o spunem întâi; linkul rămâne de copiat ca rezervă.
 * Nu se salvează nicăieri: după „Închide” se poate genera doar unul nou.
 */
export function AccessLink({ link, name, email, mail, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  const sent = mail === "sent";
  return (
    <div role="status" className="mt-2 rounded border border-border bg-card p-3 text-left text-[13px]">
      {sent ? (
        <>
          <p className="inline-flex items-center gap-1 font-medium text-tone-ok-foreground">
            <Check aria-hidden className="size-4" />
            Am trimis linkul de acces la {email}
          </p>
          <p className="mt-0.5 text-muted-foreground">Dacă {name} nu găsește e-mailul (verificați și Spam), copiați linkul de mai jos și trimiteți-i-l altfel.</p>
        </>
      ) : (
        <>
          <p className="font-medium">Link de acces pentru {name}</p>
          <p className="mt-0.5 text-muted-foreground">
            {mail === "failed" ? "E-mailul nu a putut fi trimis. Copiați linkul și trimiteți-l doar acestei persoane." : "Copiați linkul și trimiteți-l doar acestei persoane."} Merge o singură dată și expiră în scurt timp.
          </p>
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input readOnly value={link} aria-label="Link de acces" onFocus={(e) => e.currentTarget.select()} className="h-8 min-w-0 flex-1 rounded border border-border bg-muted/40 px-2 font-mono text-[12px]" />
        <Button type="button" size="sm" variant={sent ? "outline" : "default"} onClick={copy}>
          {copied ? "Copiat" : "Copiază"}
        </Button>
        {onClose && (
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Închide
          </Button>
        )}
      </div>
    </div>
  );
}
