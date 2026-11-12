"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { compressPhoto } from "@/lib/amiabila/photo";
import { deletePhoto, getPartyState, uploadPhoto } from "@/lib/claims/client";
import { MAX_PHOTOS_PER_PARTY } from "@/lib/claims/files";
import { StepFrame } from "./step-frame";
import { useWizard } from "./wizard-context";

type Photo = { id: string; url: string };

const TIPS = [
  "Din față și din spate, ca să se vadă numărul de înmatriculare.",
  "Din lateral, tot vehiculul.",
  "De aproape, locul loviturii și daunele.",
];

/** Poze cu daunele vehiculului propriu. Se încarcă pe loc pe server (comprimate pe telefon); aici nu se păstrează în ciornă. */
export function PhotosStep() {
  const { partyToken, role, basePath } = useWizard();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!partyToken) return;
    const res = await getPartyState(partyToken);
    if (res.ok) setPhotos(res.data.photos);
    else setError(res.error);
    setLoading(false);
  }, [partyToken]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  async function add(files: FileList | null) {
    if (!partyToken || !files || files.length === 0) return;
    setError(null);
    const room = MAX_PHOTOS_PER_PARTY - photos.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > chosen.length) setError(`Puteți încărca cel mult ${MAX_PHOTOS_PER_PARTY} poze.`);
    setBusy(chosen.length);
    for (const file of chosen) {
      try {
        const res = await uploadPhoto(partyToken, await compressPhoto(file));
        if (!res.ok) setError(res.error);
      } catch {
        setError("Nu am putut citi poza. Încercați cu alta.");
      }
      setBusy((n) => n - 1);
    }
    await refresh();
  }

  async function remove(id: string) {
    if (!partyToken) return;
    setPhotos((p) => p.filter((x) => x.id !== id));
    const res = await deletePhoto(partyToken, id);
    if (!res.ok) setError(res.error);
    await refresh();
  }

  const full = photos.length >= MAX_PHOTOS_PER_PARTY;

  return (
    <StepFrame
      slug="poze"
      heading="Poze cu daunele"
      lead={`Fotografiați vehiculul ${role}. Pozele rămân în dosar ca dovadă.`}
      continueLabel={photos.length === 0 ? "Continuă fără poze" : "Continuă"}
      quietAction={photos.length === 0}
    >
      {!partyToken ? (
        <div role="alert" className="rounded-lg border border-warning-foreground/30 bg-warning p-4 text-[17px]">
          Pozele se încarcă în dosar, iar dosarul se creează la pasul „Șofer B”.{" "}
          <Link href={`${basePath}/sofer-b`} className="font-medium underline underline-offset-4">
            Mergeți la acel pas
          </Link>
          .
        </div>
      ) : (
        <>
          <ul className="list-disc space-y-1 pl-5 text-[17px]">
            {TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="cta" size="xl" disabled={full || busy > 0} onClick={() => camera.current?.click()}>
              <Camera aria-hidden />
              Fotografiază
            </Button>
            <Button type="button" variant="outline" size="xl" disabled={full || busy > 0} onClick={() => gallery.current?.click()}>
              <ImagePlus aria-hidden />
              Din galerie
            </Button>
          </div>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={gallery}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />

          {loading ? (
            <p role="status" className="flex items-center gap-2 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden />
              Se încarcă pozele…
            </p>
          ) : null}
          {busy > 0 ? (
            <p role="status" className="flex items-center gap-2 text-[17px]">
              <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden />
              Se încarcă {busy === 1 ? "poza" : `${busy} poze`}…
            </p>
          ) : null}

          {photos.length > 0 ? (
            <section aria-label="Pozele încărcate" className="space-y-2">
              <p className="text-[15px] text-muted-foreground">
                {photos.length} din {MAX_PHOTOS_PER_PARTY} poze
              </p>
              <ul className="grid grid-cols-2 gap-3">
                {photos.map((p, i) => (
                  <li key={p.id} className="relative overflow-hidden rounded-lg border bg-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Poza ${i + 1} cu daunele`} className="aspect-[4/3] w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => void remove(p.id)}
                      aria-label={`Șterge poza ${i + 1}`}
                      className="absolute top-1.5 right-1.5 inline-flex size-11 items-center justify-center rounded-full bg-background/90 text-destructive shadow outline-none focus-visible:ring-3 focus-visible:ring-ring"
                    >
                      <Trash2 className="size-5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      {error ? (
        <p role="alert" className="text-[15px] text-destructive">
          {error}
        </p>
      ) : null}
    </StepFrame>
  );
}
