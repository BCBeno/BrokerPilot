"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, FileUp, LoaderCircle, PenLine, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { canContinue } from "@/lib/amiabila/draft";
import {
  DOC_META,
  DOC_TYPES,
  confirmDoc,
  editField,
  emptyDoc,
  extractedDocSchema,
  isDocConfirmed,
  isLowConfidence,
  policyCoversDate,
  policyMatchesVehicle,
  type DocType,
  type ExtractedDoc,
} from "@/lib/amiabila/documents";
import { prepareUpload } from "@/lib/amiabila/image";
import { cn } from "@/lib/utils";
import { listGroup } from "./choice";
import { StepFrame } from "./step-frame";
import { useWizard } from "./wizard-context";

type Busy = { state: "idle" } | { state: "reading" } | { state: "error"; message: string };

function DocCard({ type, consent }: { type: DocType; consent: boolean }) {
  const { draft, update } = useWizard();
  const setDoc = (t: DocType, doc: ExtractedDoc | null) =>
    update((d) => ({ ...d, documents: { ...d.documents, [t]: doc } }));
  const meta = DOC_META[type];
  // Actele care nu se fotografiază (permisul) arată direct câmpurile de completat.
  const doc = draft.documents[type] ?? (meta.scannable ? null : emptyDoc(type));
  const [busy, setBusy] = useState<Busy>({ state: "idle" });
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmed = isDocConfirmed(type, doc);

  async function read(file: File) {
    setBusy({ state: "reading" });
    try {
      const prepared = await prepareUpload(file);
      const body = new FormData();
      body.set("type", type);
      body.set("consent", "true");
      body.set("file", prepared);
      const res = await fetch("/api/extract", { method: "POST", body });
      const json: unknown = await res.json().catch(() => ({}));
      const parsed = extractedDocSchema.safeParse((json as { doc?: unknown }).doc);
      if (res.ok && parsed.success) {
        setDoc(type, parsed.data);
        setBusy({ state: "idle" });
        return;
      }
      const message = (json as { error?: string }).error ?? "Nu am reușit să citim actul. Completați manual.";
      setBusy({ state: "error", message });
    } catch {
      setBusy({ state: "error", message: "Nu am putut trimite poza. Verificați conexiunea sau completați manual." });
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void read(file);
  }

  return (
    <section className="space-y-3" aria-labelledby={`doc-${type}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={`doc-${type}`} className="text-lg font-semibold">
          {meta.label}
        </h2>
        {confirmed ? (
          <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-success">
            <CheckCircle2 className="size-5" aria-hidden />
            Verificat
          </span>
        ) : null}
      </div>

      {!doc ? (
        <div className="space-y-2.5">
          <p className="text-[15px] text-muted-foreground">{meta.hint}</p>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={onPick} />
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="xl"
              disabled={!consent || busy.state === "reading"}
              onClick={() => cameraRef.current?.click()}
            >
              {busy.state === "reading" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
              Fotografiază
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xl"
              disabled={!consent || busy.state === "reading"}
              onClick={() => fileRef.current?.click()}
            >
              <FileUp aria-hidden />
              Alege fișier
            </Button>
          </div>
          {busy.state === "reading" ? (
            <p role="status" className="text-[15px] text-muted-foreground">
              Citim actul… durează câteva secunde.
            </p>
          ) : null}
          {busy.state === "error" ? (
            <p role="alert" className="text-[15px] text-destructive">
              {busy.message}
            </p>
          ) : null}
          <Button type="button" variant="ghost" className="h-11 w-full text-base" onClick={() => setDoc(type, emptyDoc(type))}>
            <PenLine aria-hidden />
            Completez manual
          </Button>
        </div>
      ) : (
        <Review type={type} doc={doc} confirmed={confirmed} setDoc={setDoc} />
      )}
    </section>
  );
}

function Review({
  type,
  doc,
  confirmed,
  setDoc,
}: {
  type: DocType;
  doc: ExtractedDoc;
  confirmed: boolean;
  setDoc: (type: DocType, doc: ExtractedDoc | null) => void;
}) {
  const scannable = DOC_META[type].scannable;
  const needsCheck = DOC_META[type].fields.some((f) => isLowConfidence(doc.fields[f.key]));

  return (
    <div className="space-y-3">
      {needsCheck ? (
        <p className="text-[15px] text-muted-foreground">
          {scannable
            ? "Câmpurile galbene sunt nesigure sau goale. Verificați-le cu actul în față."
            : "Completați câmpurile galbene cu permisul în față."}
        </p>
      ) : null}
      <div className={cn(listGroup)}>
        {DOC_META[type].fields.map((def) => {
          const field = doc.fields[def.key];
          const low = isLowConfidence(field);
          return (
            <div key={`${def.key}:${field?.value ?? ""}`} className={cn("space-y-1.5 px-4 py-3", low && "bg-warning")}>
              <label htmlFor={`${type}-${def.key}`} className="flex items-center justify-between gap-2 text-[15px] text-muted-foreground">
                {def.label}
                {low ? (
                  <span className="inline-flex items-center gap-1 font-medium text-warning-foreground">
                    <TriangleAlert className="size-4" aria-hidden />
                    Verificați
                  </span>
                ) : null}
              </label>
              <Input
                id={`${type}-${def.key}`}
                defaultValue={field?.value ?? ""}
                placeholder={def.placeholder}
                className="h-11 rounded-lg bg-card px-3 text-base md:text-base"
                maxLength={200}
                autoComplete="off"
                onBlur={(e) => {
                  const next = e.target.value;
                  if (next.trim() === (field?.value ?? "")) return;
                  setDoc(type, { fields: { ...doc.fields, [def.key]: editField(def, next, new Date()) } });
                }}
              />
            </div>
          );
        })}
      </div>
      <div className={cn("grid gap-2.5", scannable ? "grid-cols-2" : "grid-cols-1")}>
        {scannable ? (
          <Button type="button" variant="outline" className="h-12 text-base" onClick={() => setDoc(type, null)}>
            Refă poza
          </Button>
        ) : null}
        <Button
          type="button"
          variant={confirmed ? "outline" : "default"}
          className="h-12 text-base"
          onClick={() => setDoc(type, confirmDoc(type, doc, new Date()))}
        >
          Datele sunt corecte
        </Button>
      </div>
    </div>
  );
}

export function DocsStep() {
  const { draft, update } = useWizard();
  const { documents, documentsConsent } = draft;
  const matches = policyMatchesVehicle(documents.registration, documents.policy);
  const covers = policyCoversDate(documents.policy, draft.place.occurredAt ? new Date(draft.place.occurredAt) : new Date());

  return (
    <StepFrame
      slug="acte"
      heading="Actele dumneavoastră"
      lead="Fotografiați talonul și polița, iar noi citim datele. Permisul îl completați dumneavoastră. Verificați totul la final."
      canContinue={canContinue("acte", draft, new Date())}
      disabledHint="Verificați cele trei acte ca să continuați."
    >
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 text-[15px] leading-snug">
        <Checkbox
          className="mt-0.5"
          checked={documentsConsent}
          onCheckedChange={(v) => update((d) => ({ ...d, documentsConsent: v === true }))}
        />
        <span>
          Sunt de acord ca pozele talonului și poliței să fie citite de un serviciu AI extern. Pozele nu se păstrează
          și sunt folosite doar pentru citire. Permisul nu se fotografiază. Fără acord, completați datele manual.
        </span>
      </label>

      {DOC_TYPES.map((t) => (
        <DocCard key={t} type={t} consent={documentsConsent} />
      ))}

      {matches === false ? (
        <Alert className="border-warning-foreground/30 bg-warning p-4">
          <TriangleAlert aria-hidden />
          <AlertDescription className="text-[15px] text-foreground">
            Numărul de pe poliță nu se potrivește cu cel din talon. Verificați că ați fotografiat polița mașinii
            potrivite.
          </AlertDescription>
        </Alert>
      ) : null}
      {covers === false ? (
        <Alert className="border-warning-foreground/30 bg-warning p-4">
          <TriangleAlert aria-hidden />
          <AlertDescription className="text-[15px] text-foreground">
            Polița pare să nu fie valabilă la data accidentului. Verificați datele; decizia finală aparține
            asigurătorului.
          </AlertDescription>
        </Alert>
      ) : null}
    </StepFrame>
  );
}
