"use client";

import { useState } from "react";
import { Car, CheckCircle2, ChevronRight, LoaderCircle, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emptyDoc, type ExtractedDoc } from "@/lib/amiabila/documents";
import { prefillSchema, vehicleCardSchema, type VehicleCard } from "@/lib/identity/prefill";
import { cn } from "@/lib/utils";
import { listGroup } from "./choice";
import { useWizard } from "./wizard-context";

type Stage =
  | { name: "idle" }
  | { name: "phone" }
  | { name: "code"; verificationId: string; masked: string; local: boolean }
  | { name: "cars"; token: string; person: string | null; vehicles: VehicleCard[] };

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, json: { error: "Nu ne-am putut conecta. Verificați internetul și încercați din nou." } };
  }
}

const errorOf = (json: Record<string, unknown>, fallback: string) => (typeof json.error === "string" ? json.error : fallback);

/** „2026-12-31” → „31.12.2026”. */
const roDate = (iso: string) => iso.split("-").reverse().join(".");

/** Permisul nu e în fișă: păstrăm ce a scris deja omul și completăm doar câmpurile goale (nume, telefon, e-mail). */
function mergeLicense(current: ExtractedDoc | null, fromFile: ExtractedDoc): ExtractedDoc {
  const base = current ?? emptyDoc("license");
  const fields = { ...base.fields };
  for (const [key, field] of Object.entries(fromFile.fields)) {
    if (field.value && !fields[key]?.value) fields[key] = field;
  }
  return { fields };
}

/**
 * „Sunteți deja client al agenției?” (spec 04, E): cod prin SMS, apoi clientul alege mașina implicată din fișa lui
 * și talonul + polița se completează singure. Cine sare pasul scanează actele ca până acum.
 */
export function AgencyAccount() {
  const { draft, update } = useWizard();
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const occurredAt = draft.place.occurredAt;

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { ok, json } = await post("/api/identity/sms/start", { phone });
    setBusy(false);
    if (!ok || typeof json.verificationId !== "string") return setError(errorOf(json, "Nu am putut trimite codul. Încercați din nou."));
    setCode("");
    setStage({ name: "code", verificationId: json.verificationId, masked: String(json.masked ?? ""), local: json.local === true });
  }

  async function checkCode(verificationId: string) {
    setBusy(true);
    setError(null);
    const { ok, json } = await post("/api/identity/sms/check", { verificationId, code, occurredAt });
    setBusy(false);
    const vehicles = vehicleCardSchema.array().safeParse(json.vehicles);
    if (!ok || typeof json.token !== "string" || !vehicles.success) {
      if (json.code === "locked" || json.code === "expired") setStage({ name: "phone" });
      setCode("");
      return setError(errorOf(json, "Codul nu a putut fi verificat. Încercați din nou."));
    }
    setStage({ name: "cars", token: json.token, person: typeof json.name === "string" ? json.name : null, vehicles: vehicles.data });
  }

  async function choose(token: string, name: string | null, vehicleId: string) {
    setBusy(true);
    setError(null);
    const { ok, json } = await post("/api/identity/vehicle", { token, vehicleId, occurredAt });
    setBusy(false);
    const prefill = prefillSchema.safeParse(json);
    if (!ok || !prefill.success) {
      if (json.code === "unverified") setStage({ name: "phone" });
      return setError(errorOf(json, "Nu am putut prelua datele mașinii. Încercați din nou."));
    }
    const { documents, plate } = prefill.data;
    update((d) => ({
      ...d,
      identity: { token, vehicleId, plate, name },
      documents: { registration: documents.registration, policy: documents.policy, license: mergeLicense(d.documents.license, documents.license) },
    }));
    setStage({ name: "idle" });
  }

  function forget() {
    update((d) => ({ ...d, identity: null, documents: { registration: null, license: d.documents.license, policy: null } }));
    setStage({ name: "idle" });
  }

  const errorLine = error ? (
    <p role="alert" className="text-[15px] text-destructive">
      {error}
    </p>
  ) : null;

  // Datele au fost preluate din fișă.
  if (draft.identity && stage.name === "idle") {
    return (
      <section className="flex items-start gap-3 rounded-lg border border-success/30 bg-card p-4" aria-label="Date din fișa agenției">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <div className="flex-1 space-y-1">
          <p className="text-base font-semibold">Am preluat datele mașinii {draft.identity.plate} din fișa dumneavoastră.</p>
          <p className="text-[15px] text-muted-foreground">Verificați-le mai jos. Permisul îl completați dumneavoastră.</p>
          <Button type="button" variant="link" className="h-auto p-0 text-[15px]" onClick={forget}>
            Nu e mașina potrivită
          </Button>
        </div>
      </section>
    );
  }

  if (stage.name === "idle") {
    return (
      <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="agency-account">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 id="agency-account" className="text-base font-semibold">
              Sunteți deja client al agenției?
            </h2>
            <p className="text-[15px] text-muted-foreground">
              Vă trimitem un cod prin SMS și completăm talonul și polița din fișa dumneavoastră. Nu mai fotografiați actele.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="xl" className="w-full" onClick={() => setStage({ name: "phone" })}>
          Da, completați din fișă
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Date din fișa agenției">
      {stage.name === "phone" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <label htmlFor="agency-phone" className="block text-base font-semibold">
            Numărul de telefon din contractul cu agenția
          </label>
          <Input
            id="agency-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="ex. 0722 123 456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-12 rounded-lg px-3 text-base md:text-base"
            maxLength={30}
          />
          {errorLine}
          <Button type="submit" size="xl" className="w-full" disabled={busy || phone.trim().length < 9}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            Trimite codul
          </Button>
          <Button type="button" variant="ghost" className="h-11 w-full text-base" onClick={() => setStage({ name: "idle" })}>
            Renunț, fotografiez actele
          </Button>
        </form>
      ) : null}

      {stage.name === "code" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void checkCode(stage.verificationId);
          }}
        >
          <label htmlFor="agency-code" className="block text-base font-semibold">
            Codul primit prin SMS
          </label>
          <p className="text-[15px] text-muted-foreground">
            Dacă numărul {stage.masked} e în fișele agenției, ați primit un cod de 6 cifre. E valabil 5 minute.
          </p>
          {stage.local ? (
            <p className="rounded-md bg-secondary px-3 py-2 text-[15px]">Mod demo: codul apare în consola serverului.</p>
          ) : null}
          <Input
            id="agency-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-14 rounded-lg px-3 text-center font-mono text-2xl tracking-[0.4em] md:text-2xl"
          />
          {errorLine}
          <Button type="submit" size="xl" className="w-full" disabled={busy || code.length !== 6}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            Verifică codul
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            <Button type="button" variant="ghost" className="h-11 text-base" disabled={busy} onClick={() => void sendCode()}>
              Trimite din nou
            </Button>
            <Button type="button" variant="ghost" className="h-11 text-base" onClick={() => setStage({ name: "phone" })}>
              Alt număr
            </Button>
          </div>
        </form>
      ) : null}

      {stage.name === "cars" ? (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">
            {stage.person ? `Bună ziua, ${stage.person}. ` : ""}Cu ce mașină ați avut accidentul?
          </h2>
          {stage.vehicles.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">
              Nu am găsit mașini în fișa dumneavoastră. Fotografiați actele mai jos.
            </p>
          ) : (
            <ul className={cn(listGroup)}>
              {stage.vehicles.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void choose(stage.token, stage.person, v.id)}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:bg-secondary focus-visible:outline-none disabled:opacity-60"
                  >
                    <Car className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1">
                      <span className="block text-lg font-semibold tracking-wide">{v.plate}</span>
                      <span className="block text-[15px] text-muted-foreground">{v.title}</span>
                      <span className="block text-[15px] text-muted-foreground">
                        {v.insurer && v.validTo
                          ? `RCA ${v.insurer} (${v.policyNoMasked}), valabilă până la ${roDate(v.validTo)}`
                          : "Fără RCA în fișă: o completați mai jos"}
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {errorLine}
          <Button type="button" variant="ghost" className="h-11 w-full text-base" onClick={() => setStage({ name: "idle" })}>
            Nu e niciuna, fotografiez actele
          </Button>
        </div>
      ) : null}
    </section>
  );
}
