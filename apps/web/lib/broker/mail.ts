import type { AccessType } from "./team";

/** Rezultatul trimiterii: `off` = Resend neconfigurat (adminul copiază linkul), `failed` = configurat, dar n-a mers. */
export type MailResult = "sent" | "off" | "failed";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Mesajul cu linkul de acces, în text simplu și HTML (stiluri inline, fără imagini). Fără apeluri externe, deci testabil. */
export function accessEmail({ name, link, type }: { name: string; link: string; type: AccessType }) {
  const invite = type === "invite";
  const subject = invite ? "Contul dvs. BrokerPilot" : "Link nou pentru contul BrokerPilot";
  const intro = invite
    ? "Ați fost adăugat în echipa BrokerPilot. Alegeți-vă parola din linkul de mai jos, apoi intrați cu această adresă de e-mail."
    : "Administratorul v-a trimis un link nou. Din el vă alegeți o parolă nouă, apoi intrați cu această adresă de e-mail.";
  const action = invite ? "Alegeți parola" : "Alegeți o parolă nouă";
  const note = "Linkul merge o singură dată și expiră în scurt timp. Dacă nu mai merge, cereți administratorului unul nou.";
  const ignore = invite ? null : "Dacă nu așteptați acest mesaj, îl puteți ignora: parola actuală rămâne valabilă.";

  const text = [`Bună ziua, ${name},`, "", intro, "", `${action}: ${link}`, "", note, ...(ignore ? ["", ignore] : [])].join("\n");
  const p = (s: string, extra = "") => `<p style="margin:0 0 16px;${extra}">${escapeHtml(s)}</p>`;
  const html = `<!doctype html><html lang="ro"><body style="margin:0;background:#EEF1F6;font-family:'IBM Plex Sans',Arial,sans-serif;color:#10233F">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<div style="background:#10233F;color:#FFFFFF;padding:16px 20px;border-radius:8px 8px 0 0;font-weight:600;font-size:16px">BrokerPilot</div>
<div style="background:#FFFFFF;padding:24px 20px;border-radius:0 0 8px 8px;font-size:15px;line-height:1.5">
${p(`Bună ziua, ${name},`)}${p(intro)}
<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#F26B21;color:#10233F;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px">${escapeHtml(action)}</a></p>
${p(note, "color:#55607A;font-size:13px")}${ignore ? p(ignore, "color:#55607A;font-size:13px") : ""}
</div></div></body></html>`;
  return { subject, text, html };
}

/** Trimite prin API-ul Resend (`POST /emails`). Nu aruncă: întoarce `failed` și notează doar codul, fără adresă. */
export async function sendAccessEmail(
  cfg: { apiKey?: string; from: string },
  msg: { to: string; name: string; link: string; type: AccessType },
): Promise<MailResult> {
  if (!cfg.apiKey) return "off";
  const { subject, text, html } = accessEmail(msg);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.from, to: [msg.to], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return "sent";
    const body = (await res.json().catch(() => null)) as { name?: string } | null;
    console.error("[mail] resend", res.status, body?.name);
  } catch (e) {
    console.error("[mail] resend", e instanceof Error ? e.name : "error");
  }
  return "failed";
}
