import type { ReactNode } from "react";
import {
  SKETCH_H,
  SKETCH_W,
  endAngle,
  pathData,
  type RoadTemplate,
  type Sketch,
  type SketchVehicle,
} from "@/lib/amiabila/sketch";

/**
 * Desenează caseta 13 („Schița accidentului la momentul producerii impactului”) din modelul `Sketch`.
 * Fără sketch (încă), caseta rămâne un caiet gol, ca pe hârtie.
 */

const ROAD = "#e6e9ef";
const MARK = "#98a2b3";
const INK = "#111827";
const COLORS = { A: { fill: "#2b4bb0", text: "#ffffff", trail: "#1c3b8f" }, B: { fill: "#f6c22d", text: "#1f2937", trail: "#b45309" } };

/** Unde se scrie numele fiecărei străzi, în ordinea din `streetNames`, pentru fiecare șablon. */
const STREET_ANCHORS: Record<RoadTemplate, { x: number; y: number; rot: number }[]> = {
  straight: [{ x: 14, y: 74, rot: 0 }],
  crossing: [
    { x: 14, y: 74, rot: 0 },
    { x: 188, y: 208, rot: -90 },
  ],
  "t-junction": [
    { x: 14, y: 74, rot: 0 },
    { x: 188, y: 208, rot: -90 },
  ],
  roundabout: [
    { x: 14, y: 74, rot: 0 },
    { x: 178, y: 208, rot: -90 },
  ],
  parking: [{ x: 14, y: 22, rot: 0 }],
};

function Road({ template }: { template: RoadTemplate }): ReactNode {
  const dash = { stroke: MARK, strokeWidth: 1.2, strokeDasharray: "8 6" } as const;
  switch (template) {
    case "straight":
      return (
        <>
          <rect x={0} y={80} width={SKETCH_W} height={60} fill={ROAD} />
          <line x1={0} y1={110} x2={SKETCH_W} y2={110} {...dash} />
        </>
      );
    case "crossing":
      return (
        <>
          <rect x={0} y={80} width={SKETCH_W} height={60} fill={ROAD} />
          <rect x={195} y={0} width={60} height={SKETCH_H} fill={ROAD} />
          <line x1={0} y1={110} x2={195} y2={110} {...dash} />
          <line x1={255} y1={110} x2={SKETCH_W} y2={110} {...dash} />
          <line x1={225} y1={0} x2={225} y2={80} {...dash} />
          <line x1={225} y1={140} x2={225} y2={SKETCH_H} {...dash} />
        </>
      );
    case "t-junction":
      return (
        <>
          <rect x={0} y={80} width={SKETCH_W} height={60} fill={ROAD} />
          <rect x={195} y={140} width={60} height={SKETCH_H - 140} fill={ROAD} />
          <line x1={0} y1={110} x2={SKETCH_W} y2={110} {...dash} />
          <line x1={225} y1={140} x2={225} y2={SKETCH_H} {...dash} />
        </>
      );
    case "roundabout":
      return (
        <>
          <rect x={0} y={88} width={SKETCH_W} height={44} fill={ROAD} />
          <rect x={203} y={0} width={44} height={SKETCH_H} fill={ROAD} />
          <circle cx={225} cy={110} r={58} fill={ROAD} />
          <circle cx={225} cy={110} r={26} fill="#ffffff" stroke={MARK} strokeWidth={1.2} />
        </>
      );
    case "parking":
      return (
        <>
          <rect x={0} y={0} width={SKETCH_W} height={44} fill={ROAD} />
          <rect x={40} y={70} width={370} height={130} fill={ROAD} />
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={70 + i * 40} y1={70} x2={70 + i * 40} y2={110} stroke={MARK} strokeWidth={1.2} />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={70 + i * 40} y1={160} x2={70 + i * 40} y2={200} stroke={MARK} strokeWidth={1.2} />
          ))}
          <rect x={205} y={44} width={40} height={26} fill={ROAD} />
        </>
      );
  }
}

function Sign({ kind, x, y }: { kind: Sketch["signs"][number]["kind"]; x: number; y: number }): ReactNode {
  return (
    <g transform={`translate(${x} ${y})`}>
      {kind === "stop" && (
        <>
          <polygon points="-5,-12 5,-12 12,-5 12,5 5,12 -5,12 -12,5 -12,-5" fill="#dc2626" stroke="#fff" strokeWidth={1} />
          <text textAnchor="middle" y={2.5} fontSize={6.5} fontWeight={700} fill="#fff">
            STOP
          </text>
        </>
      )}
      {kind === "yield" && <polygon points="-12,-9 12,-9 0,12" fill="#fff" stroke="#dc2626" strokeWidth={3} strokeLinejoin="round" />}
      {kind === "priority" && (
        <>
          <rect x={-9} y={-9} width={18} height={18} transform="rotate(45)" fill="#facc15" stroke="#fff" strokeWidth={2.5} />
          <rect x={-9} y={-9} width={18} height={18} transform="rotate(45)" fill="none" stroke={INK} strokeWidth={0.8} />
        </>
      )}
      {kind === "lights" && (
        <>
          <rect x={-5} y={-13} width={10} height={26} rx={3} fill={INK} />
          <circle cx={0} cy={-7} r={2.8} fill="#ef4444" />
          <circle cx={0} cy={0} r={2.8} fill="#f59e0b" />
          <circle cx={0} cy={7} r={2.8} fill="#22c55e" />
        </>
      )}
      {kind === "no-entry" && (
        <>
          <circle r={11} fill="#dc2626" stroke="#fff" strokeWidth={1} />
          <rect x={-7} y={-2} width={14} height={4} fill="#fff" />
        </>
      )}
    </g>
  );
}

function Car({ who, v }: { who: "A" | "B"; v: SketchVehicle }): ReactNode {
  const c = COLORS[who];
  const tip = endAngle(v.path);
  const last = v.path[v.path.length - 1];
  return (
    <g>
      {v.path.length >= 2 && (
        <>
          <path d={pathData(v.path)} fill="none" stroke={c.trail} strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" />
          {tip !== null && last && (
            <polygon points="0,0 -10,-5 -10,5" fill={c.trail} transform={`translate(${last.x} ${last.y}) rotate(${tip})`} />
          )}
        </>
      )}
      <g transform={`translate(${v.x} ${v.y}) rotate(${v.angle})`}>
        <rect x={-11} y={-22} width={22} height={44} rx={5} fill={c.fill} stroke={INK} strokeWidth={1.2} />
        <rect x={-8} y={-16} width={16} height={9} rx={2} fill="#ffffff" fillOpacity={0.55} />
        <rect x={-8} y={10} width={16} height={7} rx={2} fill="#ffffff" fillOpacity={0.35} />
        <text textAnchor="middle" y={4} fontSize={13} fontWeight={700} fill={c.text} transform={`rotate(${-v.angle} 0 0)`}>
          {who}
        </text>
      </g>
    </g>
  );
}

export function SketchView({ sketch }: { sketch: Sketch | null }) {
  return (
    <svg
      viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`}
      className="af-sketch-svg"
      role="img"
      aria-label={sketch ? "Schița accidentului" : "Schița accidentului, necompletată"}
    >
      <defs>
        <pattern id="af-grid" width={25} height={25} patternUnits="userSpaceOnUse">
          <path d="M25 0H0V25" fill="none" stroke="#c3c9d4" strokeWidth={0.8} strokeDasharray="1.5 3" />
        </pattern>
      </defs>
      <rect width={SKETCH_W} height={SKETCH_H} fill="url(#af-grid)" />
      {sketch && (
        <>
          <Road template={sketch.road} />
          {sketch.streetNames.map((name, i) => {
            const anchor = STREET_ANCHORS[sketch.road][i];
            if (!anchor || !name) return null;
            return (
              <text
                key={i}
                x={anchor.x}
                y={anchor.y}
                fontSize={9}
                fontWeight={600}
                fill={INK}
                transform={anchor.rot ? `rotate(${anchor.rot} ${anchor.x} ${anchor.y})` : undefined}
              >
                {name}
              </text>
            );
          })}
          {sketch.signs.map((s, i) => (
            <Sign key={i} kind={s.kind} x={s.x} y={s.y} />
          ))}
          <Car who="A" v={sketch.vehicles.A} />
          <Car who="B" v={sketch.vehicles.B} />
        </>
      )}
    </svg>
  );
}
