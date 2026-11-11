"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Camera, CarFront, ImagePlus, Pencil, RotateCcw, RotateCw, StickyNote, Trash2, Undo2, type LucideIcon } from "lucide-react";
import { SketchView } from "@/components/amiabila-form/sketch-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateDraft, useDraft, useHydrated } from "@/lib/amiabila/draft-store";
import { Textarea } from "@/components/ui/textarea";
import { compressPhoto } from "@/lib/amiabila/photo";
import {
  ROAD_LABELS,
  ROAD_TEMPLATES,
  SIGN_KINDS,
  SIGN_LABELS,
  angleToward,
  clampPoint,
  defaultTemplateSketch,
  extendStroke,
  isSketchEmpty,
  moveVehicle,
  placeMark,
  rotateMark,
  rotateVehicle,
  setMarkAngle,
  setVehicleAngle,
  type DrawingSketch,
  type Sketch,
  type SketchMode,
  type SketchStroke,
  type TemplateSketch,
} from "@/lib/amiabila/sketch";
import { cn } from "@/lib/utils";
import { StepFrame } from "./step-frame";

const MODES: { value: SketchMode; icon: LucideIcon; title: string; hint: string }[] = [
  { value: "template", icon: CarFront, title: "Aleg drumul și așez mașinile", hint: "Rezultatul cel mai curat, fără desenat." },
  { value: "drawing", icon: Pencil, title: "Desenez cu degetul", hint: "Liber, ca pe hârtie." },
  { value: "photo", icon: Camera, title: "Fotografiez o schiță de pe hârtie", hint: "Dacă ați desenat deja." },
];

const MODE_NAME: Record<SketchMode, string> = { template: "cu drum și mașini", drawing: "desen", photo: "poză" };

/** Un punct al desenului (unități ale caietului de 450 × 220) pornind de la poziția degetului pe ecran. */
function toPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return clampPoint(new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()));
}

/** Cere ca mișcările degetului să rămână la SVG chiar dacă iese din el; unele browsere refuză, iar desenul merge și fără. */
function capture(svg: SVGSVGElement, pointerId: number) {
  try {
    svg.setPointerCapture(pointerId);
  } catch {
    /* continuăm fără captură */
  }
}

const svgClass = "block h-auto w-full rounded-lg border bg-white";
const chip =
  "inline-flex min-h-11 items-center justify-center rounded-lg border bg-card px-3 text-[15px] transition-colors hover:bg-secondary/60 aria-pressed:border-foreground aria-pressed:bg-secondary aria-pressed:font-semibold";

// ---------------------------------------------------------------- A. șablon de drum

function TemplateEditor() {
  const draft = useDraft();
  const [work, setWork] = useState<TemplateSketch>(() => (draft.sketch?.mode === "template" ? draft.sketch : defaultTemplateSketch()));
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const rotating = useRef<"A" | "B" | null>(null);
  /** Ultima schiță, ca ridicarea degetului să salveze și ultima mișcare chiar dacă ecranul nu s-a redesenat încă. */
  const latest = useRef(work);

  // Dacă nu există nicio schiță, pornim cu cea implicită ca să nu rămână ecranul „salvat” gol.
  useEffect(() => {
    if (draft.sketch === null) updateDraft((d) => ({ ...d, sketch: work }));
    // doar la montare
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = (next: TemplateSketch) => {
    latest.current = next;
    setWork(next);
  };

  const commit = (next: TemplateSketch) => {
    show(next);
    updateDraft((d) => ({ ...d, sketch: next }));
  };

  const position = (id: string) => (id === "A" || id === "B" ? work.vehicles[id] : work.signs[Number(id.slice(5))]);

  const onGrab = (id: string, e: ReactPointerEvent<SVGElement>) => {
    e.stopPropagation();
    const svg = svgRef.current;
    const item = position(id);
    if (!svg || !item) return;
    const p = toPoint(svg, e);
    dragging.current = { id, dx: item.x - p.x, dy: item.y - p.y };
    setSelected(id);
    capture(svg, e.pointerId);
  };

  const onRotate = (who: "A" | "B", e: ReactPointerEvent<SVGElement>) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    rotating.current = who;
    setSelected(who);
    capture(svg, e.pointerId);
  };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const who = rotating.current;
    if (who) {
      const w = latest.current;
      const angle = angleToward(w.vehicles[who], toPoint(svg, e));
      if (angle !== null) show({ ...w, vehicles: { ...w.vehicles, [who]: setVehicleAngle(w.vehicles[who], angle) } });
      return;
    }
    const drag = dragging.current;
    if (!drag) return;
    const p = toPoint(svg, e);
    const to = { x: p.x + drag.dx, y: p.y + drag.dy };
    if (drag.id === "A" || drag.id === "B") {
      const who = drag.id as "A" | "B";
      const w = latest.current;
      show({ ...w, vehicles: { ...w.vehicles, [who]: moveVehicle(w.vehicles[who], to) } });
    } else {
      const i = Number(drag.id.slice(5));
      const c = clampPoint(to);
      const w = latest.current;
      show({ ...w, signs: w.signs.map((s, j) => (j === i ? { ...s, x: Math.round(c.x), y: Math.round(c.y) } : s)) });
    }
  };

  const onUp = () => {
    if (!dragging.current && !rotating.current) return;
    dragging.current = null;
    rotating.current = null;
    commit(latest.current);
  };

  const rotate = (delta: number) => {
    if (selected !== "A" && selected !== "B") return;
    commit({ ...work, vehicles: { ...work.vehicles, [selected]: rotateVehicle(work.vehicles[selected], delta) } });
  };

  const addSign = (kind: (typeof SIGN_KINDS)[number]) => {
    if (work.signs.length >= 8) return;
    const n = work.signs.length;
    commit({ ...work, signs: [...work.signs, { kind, x: 30 + n * 34, y: 26 }] });
    setSelected(`sign-${n}`);
  };

  const removeSelectedSign = () => {
    if (!selected?.startsWith("sign-")) return;
    const i = Number(selected.slice(5));
    commit({ ...work, signs: work.signs.filter((_, j) => j !== i) });
    setSelected(null);
  };

  const streets = work.road === "straight" || work.road === "parking" ? 1 : 2;
  const selectedIsCar = selected === "A" || selected === "B";
  const selectedIsSign = selected?.startsWith("sign-") ?? false;

  return (
    <div className="space-y-5">
      <SketchView
        sketch={work}
        svgRef={svgRef}
        grab={{ selected, onGrab, onRotate }}
        svgProps={{
          className: svgClass,
          style: { touchAction: "none" },
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onUp,
          onPointerDown: () => setSelected(null),
        }}
      />
      <p className="text-[15px] text-muted-foreground">Trageți mașinile și semnele ca să le mutați. Atingeți o mașină și rotiți-o din cerculețul de deasupra ei sau din butoane.</p>

      <div className="space-y-2">
        <p className="text-base font-semibold">Drumul</p>
        <div className="flex flex-wrap gap-2">
          {ROAD_TEMPLATES.map((r) => (
            <button key={r} type="button" aria-pressed={work.road === r} className={chip} onClick={() => commit({ ...work, road: r })}>
              {ROAD_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-base font-semibold">
          Mașina {selectedIsCar ? selected : "aleasă"}
        </p>
        <div className="grid grid-cols-4 gap-2">
          <Button type="button" variant="outline" className="h-11" disabled={!selectedIsCar} onClick={() => rotate(-90)} aria-label="Rotește 90 de grade la stânga">
            <RotateCcw aria-hidden /> 90°
          </Button>
          <Button type="button" variant="outline" className="h-11" disabled={!selectedIsCar} onClick={() => rotate(-15)} aria-label="Rotește 15 grade la stânga">
            <RotateCcw aria-hidden /> 15°
          </Button>
          <Button type="button" variant="outline" className="h-11" disabled={!selectedIsCar} onClick={() => rotate(15)} aria-label="Rotește 15 grade la dreapta">
            <RotateCw aria-hidden /> 15°
          </Button>
          <Button type="button" variant="outline" className="h-11" disabled={!selectedIsCar} onClick={() => rotate(90)} aria-label="Rotește 90 de grade la dreapta">
            <RotateCw aria-hidden /> 90°
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-base font-semibold">Semne de circulație</p>
        <div className="flex flex-wrap gap-2">
          {SIGN_KINDS.map((k) => (
            <button key={k} type="button" className={chip} onClick={() => addSign(k)}>
              + {SIGN_LABELS[k]}
            </button>
          ))}
        </div>
        {selectedIsSign ? (
          <Button type="button" variant="ghost" className="h-11" onClick={removeSelectedSign}>
            <Trash2 aria-hidden />
            Șterge semnul ales
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-base font-semibold">Numele străzilor</p>
        {Array.from({ length: streets }, (_, i) => (
          <Input
            key={i}
            aria-label={`Numele străzii ${i + 1}`}
            maxLength={40}
            placeholder={i === 0 ? "Ex.: Str. Mihai Eminescu" : "Ex.: Bd. Unirii"}
            className="h-12 rounded-lg bg-card px-4 text-base md:text-base"
            value={work.streetNames[i] ?? ""}
            onChange={(e) => {
              const names = [...work.streetNames, "", ""].slice(0, 2);
              names[i] = e.target.value;
              commit({ ...work, streetNames: names });
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- B. desen liber

type Tool = "pen" | "A" | "B";

function DrawingEditor() {
  const draft = useDraft();
  const [work, setWork] = useState<DrawingSketch>(() =>
    draft.sketch?.mode === "drawing" ? draft.sketch : { mode: "drawing", strokes: [], marks: [] },
  );
  const [tool, setTool] = useState<Tool>("pen");
  const [selected, setSelected] = useState<"A" | "B" | null>(null);
  const [live, setLive] = useState<SketchStroke | null>(null);
  const liveRef = useRef<SketchStroke | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ who: "A" | "B"; dx: number; dy: number } | null>(null);
  const rotating = useRef<"A" | "B" | null>(null);
  /** Ultimul desen, ca ridicarea degetului să salveze și ultima mișcare chiar dacă ecranul nu s-a redesenat încă. */
  const latest = useRef(work);

  const show = (next: DrawingSketch) => {
    latest.current = next;
    setWork(next);
  };

  const commit = (next: DrawingSketch) => {
    show(next);
    updateDraft((d) => ({ ...d, sketch: next }));
  };

  // Mașinile se mută trăgându-le, indiferent de unealta aleasă.
  const onGrab = (id: string, e: ReactPointerEvent<SVGElement>) => {
    e.stopPropagation();
    const svg = svgRef.current;
    const mark = latest.current.marks.find((m) => m.who === id);
    if (!svg || !mark) return;
    const p = toPoint(svg, e);
    dragging.current = { who: mark.who, dx: mark.x - p.x, dy: mark.y - p.y };
    setSelected(mark.who);
    capture(svg, e.pointerId);
  };

  const onRotate = (who: "A" | "B", e: ReactPointerEvent<SVGElement>) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    rotating.current = who;
    setSelected(who);
    capture(svg, e.pointerId);
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const p = toPoint(svg, e);
    if (tool === "pen") {
      setSelected(null);
      capture(svg, e.pointerId);
      liveRef.current = extendStroke([], p, 0);
      setLive(liveRef.current);
    } else {
      commit({ ...latest.current, marks: placeMark(latest.current.marks, tool, p) });
      setSelected(tool);
    }
  };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const w = latest.current;
    const who = rotating.current;
    if (who) {
      const mark = w.marks.find((m) => m.who === who);
      const angle = mark ? angleToward(mark, toPoint(svg, e)) : null;
      if (angle !== null) show({ ...w, marks: setMarkAngle(w.marks, who, angle) });
      return;
    }
    const drag = dragging.current;
    if (drag) {
      const p = toPoint(svg, e);
      show({ ...w, marks: placeMark(w.marks, drag.who, { x: p.x + drag.dx, y: p.y + drag.dy }) });
      return;
    }
    if (liveRef.current) {
      liveRef.current = extendStroke(liveRef.current, toPoint(svg, e));
      setLive(liveRef.current);
    }
  };

  const onUp = () => {
    if (dragging.current || rotating.current) {
      dragging.current = null;
      rotating.current = null;
      commit(latest.current);
      return;
    }
    const stroke = liveRef.current;
    liveRef.current = null;
    setLive(null);
    const w = latest.current;
    if (stroke && stroke.length >= 2 && w.strokes.length < 300) commit({ ...w, strokes: [...w.strokes, stroke] });
  };

  const shown: DrawingSketch = live ? { ...work, strokes: [...work.strokes, live] } : work;

  return (
    <div className="space-y-5">
      <SketchView
        sketch={shown}
        svgRef={svgRef}
        grab={{ selected, onGrab, onRotate }}
        svgProps={{
          className: cn(svgClass, tool === "pen" ? "cursor-crosshair" : "cursor-copy"),
          style: { touchAction: "none" },
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onUp,
        }}
      />
      <div className="grid grid-cols-3 gap-2">
        {(["pen", "A", "B"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tool === t} className={chip} onClick={() => {
              setTool(t);
              setSelected(t !== "pen" && work.marks.some((m) => m.who === t) ? t : null);
            }}
          >
            {t === "pen" ? (
              <>
                <Pencil className="mr-1.5 size-4" aria-hidden />
                Creion
              </>
            ) : (
              <>
                <CarFront className="mr-1.5 size-4" aria-hidden />
                Mașina {t}
              </>
            )}
          </button>
        ))}
      </div>
      <p className="text-[15px] text-muted-foreground">
        Desenați drumul și traseul. Alegeți „Mașina A” sau „Mașina B” și atingeți locul unde era la impact. Apoi trageți-o ca s-o mutați și
        rotiți-o din cerculețul de deasupra ei sau din butoane.
      </p>
      {selected ? (
        <div className="space-y-2">
          <p className="text-base font-semibold">Rotește mașina {selected}</p>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                [-90, RotateCcw, "90°", "la stânga cu 90 de grade"],
                [-15, RotateCcw, "15°", "la stânga cu 15 grade"],
                [15, RotateCw, "15°", "la dreapta cu 15 grade"],
                [90, RotateCw, "90°", "la dreapta cu 90 de grade"],
              ] as const
            ).map(([delta, Icon, label, aria]) => (
              <Button
                key={delta}
                type="button"
                variant="outline"
                className="h-11"
                aria-label={`Rotește mașina ${selected} ${aria}`}
                onClick={() => commit({ ...work, marks: rotateMark(work.marks, selected, delta) })}
              >
                <Icon aria-hidden /> {label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={work.strokes.length === 0}
          onClick={() => commit({ ...work, strokes: work.strokes.slice(0, -1) })}
        >
          <Undo2 aria-hidden />
          Anulează ultima linie
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          disabled={work.strokes.length === 0 && work.marks.length === 0}
          onClick={() => {
            if (window.confirm("Ștergeți tot desenul?")) commit({ mode: "drawing", strokes: [], marks: [] });
          }}
        >
          <Trash2 aria-hidden />
          Șterge tot
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- D. poză cu schița

function PhotoEditor() {
  const draft = useDraft();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = draft.sketch?.mode === "photo" ? draft.sketch : null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const image = await compressPhoto(file);
      updateDraft((d) => ({ ...d, sketch: { mode: "photo", image } }));
    } catch {
      setError("Nu am putut folosi poza. Încercați din nou, cu o poză clară.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Alegeți poza schiței"
        tabIndex={-1}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {photo ? (
        <SketchView sketch={photo} svgProps={{ className: svgClass }} />
      ) : (
        <div className="rounded-lg border border-dashed bg-card px-4 py-8 text-center text-muted-foreground">
          <ImagePlus className="mx-auto mb-2 size-8" aria-hidden />
          Desenați pe o foaie drumul, mașinile A și B cu săgeți, semnele și numele străzilor. Apoi fotografiați foaia de sus, cu lumină bună.
        </div>
      )}
      <Button type="button" variant={photo ? "outline" : "cta"} size="xl" className="w-full" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Camera aria-hidden />
        {busy ? "Se pregătește poza…" : photo ? "Faceți altă poză" : "Fotografiați schița"}
      </Button>
      {error ? (
        <p role="alert" className="text-[15px] text-destructive">
          {error}
        </p>
      ) : null}
      {photo ? (
        <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => updateDraft((d) => ({ ...d, sketch: null }))}>
          <Trash2 aria-hidden />
          Elimină poza
        </Button>
      ) : null}
      <p className="text-[15px] text-muted-foreground">Poza se păstrează deocamdată doar pe telefonul dumneavoastră.</p>
    </div>
  );
}

// ---------------------------------------------------------------- pasul

export function SketchStep() {
  const hydrated = useHydrated();
  const draft = useDraft();
  const [picked, setPicked] = useState<SketchMode | null>(null);
  const mode = picked ?? draft.sketch?.mode ?? null;
  const saved: Sketch | null = draft.sketch;
  const replacing = hydrated && saved && !isSketchEmpty(saved) && mode !== null && saved.mode !== mode;

  return (
    <StepFrame
      slug="schita"
      heading="Cum s-a întâmplat?"
      lead="Faceți schița accidentului. Alegeți cum vă e mai ușor."
      continueLabel={isSketchEmpty(saved) ? "Continuă fără schiță" : "Continuă"}
    >
      <fieldset>
        <legend className="sr-only">Cum faceți schița</legend>
        <div className="space-y-2">
          {MODES.map(({ value, icon: Icon, title, hint }) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setPicked(value)}
              className="flex min-h-16 w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary/60 aria-pressed:border-foreground aria-pressed:bg-secondary"
            >
              <Icon className="size-6 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-base font-semibold">{title}</span>
                <span className="block text-[15px] text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {hydrated && mode ? (
        <div className="space-y-3">
          {replacing && saved ? (
            <p role="status" className="rounded-lg border bg-card px-4 py-3 text-[15px] text-muted-foreground">
              Acum e salvată o schiță de tip „{MODE_NAME[saved.mode]}”. Dacă modificați ceva aici, o înlocuiește.
            </p>
          ) : null}
          {mode === "template" ? <TemplateEditor key="template" /> : null}
          {mode === "drawing" ? <DrawingEditor key="drawing" /> : null}
          {mode === "photo" ? <PhotoEditor key="photo" /> : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="sketch-note" className="flex items-center gap-2 text-lg font-semibold">
          <StickyNote className="size-5 text-primary" aria-hidden />
          Observații <span className="font-normal text-muted-foreground">(opțional)</span>
        </label>
        <Textarea
          id="sketch-note"
          rows={3}
          maxLength={1000}
          placeholder="Ex.: A venea dinspre Str. Florilor; B a ieșit din parcare"
          className="rounded-lg bg-card px-4 py-3 text-base md:text-base"
          value={draft.circumstances.notes}
          onChange={(e) => updateDraft((d) => ({ ...d, circumstances: { ...d.circumstances, notes: e.target.value } }))}
        />
        <p className="text-[15px] text-muted-foreground">Același câmp ca la Impact. Apare pe formular, la caseta 14.</p>
      </div>
    </StepFrame>
  );
}
