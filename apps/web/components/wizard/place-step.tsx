"use client";

import { useState } from "react";
import { CalendarClock, LoaderCircle, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canContinue, resolveOccurredAt } from "@/lib/amiabila/draft";
import { updateDraft, useDraft } from "@/lib/amiabila/draft-store";
import { RadioCard } from "./choice";
import { StepFrame } from "./step-frame";

type Locating = { state: "idle" } | { state: "loading" } | { state: "message"; text: string };

export function PlaceStep() {
  const draft = useDraft();
  const { place } = draft;
  const [locating, setLocating] = useState<Locating>({ state: "idle" });

  const setPlace = (patch: Partial<typeof place>) => updateDraft((d) => ({ ...d, place: { ...d.place, ...patch } }));

  function locateMe() {
    if (!("geolocation" in navigator)) {
      setLocating({ state: "message", text: "Telefonul nu oferă locația. Scrieți adresa mai jos." });
      return;
    }
    setLocating({ state: "loading" });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setPlace({ lat: coords.latitude, lng: coords.longitude, source: "gps" });
        try {
          const res = await fetch(`/api/geocode?lat=${coords.latitude}&lng=${coords.longitude}`);
          const body: { address?: string } = res.ok ? await res.json() : {};
          if (body.address) {
            setPlace({ address: body.address });
            setLocating({ state: "idle" });
          } else {
            setLocating({ state: "message", text: "Am găsit locația, dar nu și adresa. Scrieți un reper mai jos." });
          }
        } catch {
          setLocating({ state: "message", text: "Am găsit locația, dar nu și adresa. Scrieți un reper mai jos." });
        }
      },
      (error) => {
        setLocating({
          state: "message",
          text:
            error.code === error.PERMISSION_DENIED
              ? "Nu avem acces la locație. Puteți scrie adresa mai jos."
              : "Nu am putut afla locația. Scrieți adresa mai jos.",
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  return (
    <StepFrame
      slug="loc-timp"
      heading="Locul și ora accidentului"
      lead="Adresa ajunge doar în dosarul acestui accident."
      canContinue={canContinue("loc-timp", draft, new Date())}
      disabledHint="Completați adresa ca să continuați."
      onContinue={() => setPlace({ occurredAt: resolveOccurredAt(place, new Date()) })}
    >
      <section className="space-y-3">
        <Button
          type="button"
          variant="outline"
          size="xl"
          className="w-full"
          onClick={locateMe}
          disabled={locating.state === "loading"}
        >
          {locating.state === "loading" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Navigation aria-hidden />}
          {locating.state === "loading" ? "Căutăm locația…" : "Completează cu locația mea"}
        </Button>
        {locating.state === "message" ? (
          <p role="status" className="text-[15px] text-muted-foreground">
            {locating.text}
          </p>
        ) : null}
        <div className="space-y-2">
          <label htmlFor="address" className="flex items-center gap-2 text-lg font-semibold">
            <MapPin className="size-5 text-primary" aria-hidden />
            Adresa sau un reper
          </label>
          <Input
            id="address"
            autoComplete="street-address"
            placeholder="Bd. Unirii 12, București"
            className="h-14 rounded-xl border-2 px-4 text-base md:text-base"
            value={place.address}
            maxLength={300}
            onChange={(e) => setPlace({ address: e.target.value, source: place.source === "gps" ? "gps" : "manual" })}
          />
        </div>
      </section>

      <fieldset className="space-y-3">
        <legend className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <CalendarClock className="size-5 text-primary" aria-hidden />
          Când s-a întâmplat?
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <RadioCard name="when" label="Chiar acum" checked={place.whenMode === "now"} onChange={() => setPlace({ whenMode: "now" })} />
          <RadioCard name="when" label="Mai devreme" checked={place.whenMode === "custom"} onChange={() => setPlace({ whenMode: "custom" })} />
        </div>
        {place.whenMode === "custom" ? (
          <div className="space-y-2">
            <label htmlFor="when-custom" className="block text-[15px] text-muted-foreground">
              Data și ora aproximativă
            </label>
            <Input
              id="when-custom"
              type="datetime-local"
              className="h-14 rounded-xl border-2 px-4 text-base md:text-base"
              value={place.customWhen}
              onChange={(e) => setPlace({ customWhen: e.target.value })}
            />
            {place.customWhen && resolveOccurredAt(place, new Date()) === null ? (
              <p role="alert" className="text-[15px] text-destructive">
                Ora nu poate fi în viitor. Alegeți momentul accidentului.
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>
    </StepFrame>
  );
}
