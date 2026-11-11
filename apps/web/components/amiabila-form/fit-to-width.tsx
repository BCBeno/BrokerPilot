"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Micșorează o foaie cu lățime fixă (px) ca să încapă în ecran. Pe tipar revine la mărimea reală (vezi `form.css`). */
export function FitToWidth({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={outer} className="af-fit-outer" style={{ height: height * scale }}>
      <div className="af-fit-inner" style={{ width, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
