"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Rezoluția internă fixă: PNG-ul rămâne mic (zeci de KB) indiferent de ecran. */
const W = 800;
const H = 320;

/** Zona de semnat. Desenează cu degetul sau mouse-ul; `onChange` primește PNG-ul (data URL) sau `null` cât timp e goală. */
export function SignaturePad({ onChange, disabled }: { onChange: (png: string | null) => void; disabled?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1b3a";
  }, []);

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  function down(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* desenul merge și fără captură */
    }
    last.current = point(e);
    const ctx = canvas.current?.getContext("2d");
    if (ctx) {
      // un punct, ca o atingere scurtă să lase urmă
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0b1b3a";
      ctx.fill();
    }
  }

  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    const from = last.current;
    if (!from || disabled) return;
    const to = point(e);
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    last.current = to;
  }

  function up() {
    if (!last.current) return;
    last.current = null;
    setInked(true);
    onChange(canvas.current?.toDataURL("image/png") ?? null);
  }

  function clear() {
    canvas.current?.getContext("2d")?.clearRect(0, 0, W, H);
    last.current = null;
    setInked(false);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border-2 border-dashed bg-white">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          aria-label="Zonă pentru semnătură. Semnați cu degetul."
          className="block h-auto w-full touch-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {!inked ? (
          <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg text-muted-foreground/60">
            Semnați aici
          </span>
        ) : null}
        <span aria-hidden className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-muted-foreground/30" />
      </div>
      <Button type="button" variant="ghost" className="h-11 text-base" onClick={clear} disabled={!inked || disabled}>
        <Eraser aria-hidden />
        Șterge semnătura
      </Button>
    </div>
  );
}
