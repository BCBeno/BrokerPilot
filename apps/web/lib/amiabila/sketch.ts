import { z } from "zod";

/**
 * Schița accidentului (caseta 13 din formular). Șoferul o obține în unul din trei moduri, iar formularul doar o desenează:
 * - `template`: alege un tip de drum și așază mașinile (acoperă cele cinci cerințe tipărite pe formular: configurația drumului,
 *   traseul vehiculelor, poziția la impact, semnele fixe, numele străzilor);
 * - `drawing`: desen liber cu degetul, cu marcaje A și B;
 * - `photo`: poza unei schițe făcute pe hârtie.
 *
 * Coordonatele sunt în unități ale unui caiet de 450 × 220, același cu caseta din formular.
 */
export const SKETCH_W = 450;
export const SKETCH_H = 220;

export const SKETCH_MODES = ["template", "drawing", "photo"] as const;
export type SketchMode = (typeof SKETCH_MODES)[number];

export const ROAD_TEMPLATES = ["straight", "crossing", "t-junction", "roundabout", "parking"] as const;
export type RoadTemplate = (typeof ROAD_TEMPLATES)[number];

export const ROAD_LABELS: Record<RoadTemplate, string> = {
  straight: "Drum drept",
  crossing: "Intersecție în cruce",
  "t-junction": "Intersecție în T",
  roundabout: "Sens giratoriu",
  parking: "Parcare",
};

export const SIGN_KINDS = ["stop", "yield", "priority", "lights", "no-entry"] as const;
export type SignKind = (typeof SIGN_KINDS)[number];

export const SIGN_LABELS: Record<SignKind, string> = {
  stop: "Stop",
  yield: "Cedează trecerea",
  priority: "Drum cu prioritate",
  lights: "Semafor",
  "no-entry": "Accesul interzis",
};

const x = z.number().min(0).max(SKETCH_W);
const y = z.number().min(0).max(SKETCH_H);
const point = z.object({ x, y });
export type SketchPoint = z.infer<typeof point>;

const vehicle = z.object({
  /** Centrul vehiculului. */
  x,
  y,
  /** Grade, 0 = cu botul în sus, în sens orar. */
  angle: z.number().min(-360).max(360),
  /** Traseul parcurs până la impact; ultima săgeată arată direcția de mers. */
  path: z.array(point).max(6),
});
export type SketchVehicle = z.infer<typeof vehicle>;

const templateSketch = z.object({
  mode: z.literal("template"),
  road: z.enum(ROAD_TEMPLATES),
  streetNames: z.array(z.string().max(40)).max(4),
  vehicles: z.object({ A: vehicle, B: vehicle }),
  signs: z.array(z.object({ kind: z.enum(SIGN_KINDS), x, y })).max(8),
});
export type TemplateSketch = z.infer<typeof templateSketch>;

/** O linie trasă cu degetul: perechi [x, y] întregi. */
const stroke = z.array(z.tuple([z.number().int().min(0).max(SKETCH_W), z.number().int().min(0).max(SKETCH_H)])).min(1).max(600);
export type SketchStroke = z.infer<typeof stroke>;

const drawingSketch = z.object({
  mode: z.literal("drawing"),
  strokes: z.array(stroke).max(300),
  /** Mașinile A și B puse pe desen; `angle`: grade, 0 = cu botul în sus, în sens orar. */
  marks: z.array(z.object({ who: z.enum(["A", "B"]), x, y, angle: z.number().min(-180).max(180).default(0) })).max(2),
});
export type DrawingSketch = z.infer<typeof drawingSketch>;

/** Limita pentru poza schiței (șir data URL, după comprimare pe client). */
export const MAX_PHOTO_CHARS = 600_000;
const photoSketch = z.object({
  mode: z.literal("photo"),
  image: z.string().startsWith("data:image/").max(MAX_PHOTO_CHARS),
});
export type PhotoSketch = z.infer<typeof photoSketch>;

export const sketchSchema = z.discriminatedUnion("mode", [templateSketch, drawingSketch, photoSketch]);
export type Sketch = z.infer<typeof sketchSchema>;

/** Șirul `d` al unui traseu SVG: linie frântă, sau curbă când sunt exact 3 puncte. */
export function pathData(points: SketchPoint[]): string {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  if (points.length === 3) return `M${first.x} ${first.y} Q${rest[0].x} ${rest[0].y} ${rest[1].x} ${rest[1].y}`;
  return `M${first.x} ${first.y} ` + rest.map((p) => `L${p.x} ${p.y}`).join(" ");
}

/** Direcția ultimului segment, în grade SVG (pentru vârful săgeții). Null dacă traseul are sub 2 puncte. */
export function endAngle(points: SketchPoint[]): number | null {
  if (points.length < 2) return null;
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

// ---------------------------------------------------------------- editare

export function clampPoint(p: { x: number; y: number }): SketchPoint {
  return { x: Math.min(SKETCH_W, Math.max(0, p.x)), y: Math.min(SKETCH_H, Math.max(0, p.y)) };
}

/** Jumătatea lungimii unui vehicul în schiță. */
const HALF_LENGTH = 22;
const TRAIL_LENGTH = 70;

/** Urma unui vehicul: o linie dreaptă în spatele lui, pe direcția de mers, care se termină la bot-ul din spate. */
export function trailFor(v: { x: number; y: number; angle: number }): SketchPoint[] {
  const rad = (v.angle * Math.PI) / 180;
  const fx = Math.sin(rad); // direcția de mers (0° = în sus)
  const fy = -Math.cos(rad);
  const end = clampPoint({ x: v.x - fx * (HALF_LENGTH + 4), y: v.y - fy * (HALF_LENGTH + 4) });
  const start = clampPoint({ x: v.x - fx * (HALF_LENGTH + 4 + TRAIL_LENGTH), y: v.y - fy * (HALF_LENGTH + 4 + TRAIL_LENGTH) });
  return [start, end];
}

export function moveVehicle(v: SketchVehicle, to: { x: number; y: number }): SketchVehicle {
  const c = clampPoint(to);
  const moved = { ...v, x: Math.round(c.x), y: Math.round(c.y) };
  return { ...moved, path: trailFor(moved) };
}

export function rotateVehicle(v: SketchVehicle, delta: number): SketchVehicle {
  const angle = ((((v.angle + delta + 180) % 360) + 360) % 360) - 180;
  const turned = { ...v, angle };
  return { ...turned, path: trailFor(turned) };
}

/** Unghiul (0 = în sus, sens orar, rotunjit la 5°) la care o mașină din `from` privește spre `to`. Null dacă punctele sunt prea apropiate. */
export function angleToward(from: { x: number; y: number }, to: { x: number; y: number }): number | null {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 4) return null;
  const deg = (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
  return Math.round(deg / 5) * 5;
}

export function setVehicleAngle(v: SketchVehicle, angle: number): SketchVehicle {
  const turned = { ...v, angle };
  return { ...turned, path: trailFor(turned) };
}

export function setMarkAngle(marks: DrawingSketch["marks"], who: "A" | "B", angle: number): DrawingSketch["marks"] {
  return marks.map((m) => (m.who === who ? { ...m, angle } : m));
}

/** Schița de la care pornește șoferul: o intersecție, cu A venind de jos și B din dreapta. */
export function defaultTemplateSketch(): TemplateSketch {
  const a = { x: 238, y: 168, angle: 0, path: [] as SketchPoint[] };
  const b = { x: 300, y: 95, angle: -90, path: [] as SketchPoint[] };
  return {
    mode: "template",
    road: "crossing",
    streetNames: ["", ""],
    vehicles: { A: { ...a, path: trailFor(a) }, B: { ...b, path: trailFor(b) } },
    signs: [],
  };
}

/** Adaugă un punct la linie doar dacă s-a mișcat suficient (păstrează dimensiunea ciornei mică). */
export function extendStroke(stroke: SketchStroke, p: { x: number; y: number }, minDistance = 2): SketchStroke {
  const q: [number, number] = [Math.round(clampPoint(p).x), Math.round(clampPoint(p).y)];
  const last = stroke[stroke.length - 1];
  if (last && Math.hypot(last[0] - q[0], last[1] - q[1]) < minDistance) return stroke;
  return stroke.length >= 600 ? stroke : [...stroke, q];
}

/** Pune (sau mută) mașina A ori B pe desen; fiecare apare o singură dată și își păstrează orientarea când o muți. */
export function placeMark(marks: DrawingSketch["marks"], who: "A" | "B", p: { x: number; y: number }): DrawingSketch["marks"] {
  const c = clampPoint(p);
  const angle = marks.find((m) => m.who === who)?.angle ?? 0;
  return [...marks.filter((m) => m.who !== who), { who, x: Math.round(c.x), y: Math.round(c.y), angle }];
}

/** Rotește mașina A ori B de pe desen; unghiul rămâne în intervalul -180..180. */
export function rotateMark(marks: DrawingSketch["marks"], who: "A" | "B", delta: number): DrawingSketch["marks"] {
  return marks.map((m) => (m.who === who ? { ...m, angle: ((((m.angle + delta + 180) % 360) + 360) % 360) - 180 } : m));
}

export function isSketchEmpty(sketch: Sketch | null): boolean {
  if (!sketch) return true;
  if (sketch.mode === "drawing") return sketch.strokes.length === 0 && sketch.marks.length === 0;
  return false;
}

/** Mărimea țintă a pozei schiței, după comprimare: latura mare în px și calitatea JPEG. */
export const PHOTO_MAX_SIDE = 1000;
export const PHOTO_QUALITY = 0.8;

/** Dimensiunile după micșorare, cu păstrarea proporțiilor; nu mărește niciodată poza. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
