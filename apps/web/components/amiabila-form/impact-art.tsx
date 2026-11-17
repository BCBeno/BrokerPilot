import type { ImpactZone } from "@/lib/amiabila/content";

type Arrows = Record<ImpactZone, { from: [number, number]; to: [number, number] }>;

/** Capetele săgeții (de la coadă la vârf) pentru fiecare zonă, pe o mașină văzută de sus, cu botul în sus (viewBox 100 × 150). */
const ARROWS: Arrows = {
  front: { from: [50, 3], to: [50, 22] },
  "front-left": { from: [12, 6], to: [31, 28] },
  "front-right": { from: [88, 6], to: [69, 28] },
  left: { from: [4, 75], to: [27, 75] },
  right: { from: [96, 75], to: [73, 75] },
  rear: { from: [50, 147], to: [50, 128] },
  "rear-left": { from: [12, 144], to: [31, 122] },
  "rear-right": { from: [88, 144], to: [69, 122] },
};

/** Aceleași zone pe motocicletă (viewBox -8 -12 76 174, are loc de săgeată în jur). */
const BIKE_ARROWS: Arrows = {
  front: { from: [30, -10], to: [30, 8] },
  "front-left": { from: [0, -8], to: [17, 12] },
  "front-right": { from: [60, -8], to: [43, 12] },
  left: { from: [-6, 75], to: [17, 75] },
  right: { from: [66, 75], to: [43, 75] },
  rear: { from: [30, 160], to: [30, 142] },
  "rear-left": { from: [0, 158], to: [21, 138] },
  "rear-right": { from: [60, 158], to: [39, 138] },
};

/** Aceleași zone pe autoutilitară (viewBox -8 -12 76 176). */
const VAN_ARROWS: Arrows = {
  front: { from: [30, -10], to: [30, 8] },
  "front-left": { from: [-4, -8], to: [13, 12] },
  "front-right": { from: [64, -8], to: [47, 12] },
  left: { from: [-7, 80], to: [8, 80] },
  right: { from: [67, 80], to: [52, 80] },
  rear: { from: [30, 162], to: [30, 144] },
  "rear-left": { from: [-4, 162], to: [11, 143] },
  "rear-right": { from: [64, 162], to: [49, 143] },
};

function Arrow({ zone, arrows = ARROWS }: { zone: ImpactZone; arrows?: Arrows }) {
  const { from, to } = arrows[zone];
  const angle = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
  return (
    <g stroke="#b91c1c" fill="#b91c1c">
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} strokeWidth={3} strokeLinecap="round" />
      <polygon points="0,0 -11,-6 -11,6" transform={`translate(${to[0]} ${to[1]}) rotate(${angle})`} stroke="none" />
    </g>
  );
}

/** Mașina văzută de sus, cu săgeata punctului de impact (caseta 10). */
export function CarImpact({ zone }: { zone: ImpactZone | null }) {
  return (
    <svg viewBox="0 0 100 150" className="af-car" role="img" aria-label="Mașină văzută de sus">
      <rect x={28} y={20} width={44} height={110} rx={12} fill="#fff" stroke="#111" strokeWidth={2} />
      <path d="M33 46 Q50 38 67 46 L65 62 L35 62 Z" fill="#e5e7eb" stroke="#111" strokeWidth={1.3} />
      <path d="M35 102 L65 102 L67 112 Q50 118 33 112 Z" fill="#e5e7eb" stroke="#111" strokeWidth={1.3} />
      <rect x={32} y={66} width={36} height={32} rx={3} fill="none" stroke="#111" strokeWidth={1.3} />
      <rect x={22} y={32} width={7} height={16} rx={2} fill="#111" />
      <rect x={71} y={32} width={7} height={16} rx={2} fill="#111" />
      <rect x={22} y={102} width={7} height={16} rx={2} fill="#111" />
      <rect x={71} y={102} width={7} height={16} rx={2} fill="#111" />
      {zone && <Arrow zone={zone} />}
    </svg>
  );
}

/** Vehiculul mare (autoutilitară) văzut de sus; formularul oficial îl tipărește lângă mașină, ca a treia siluetă. */
export function TruckArt({ zone = null }: { zone?: ImpactZone | null }) {
  return (
    <svg viewBox="-8 -12 76 176" className="af-truck" role="img" aria-label="Autoutilitară văzută de sus">
      <rect x={14} y={10} width={32} height={30} rx={6} fill="#fff" stroke="#111" strokeWidth={2} />
      <path d="M18 18 Q30 13 42 18 L41 28 L19 28 Z" fill="#e5e7eb" stroke="#111" strokeWidth={1.2} />
      <rect x={10} y={42} width={40} height={100} rx={3} fill="#fff" stroke="#111" strokeWidth={2} />
      <rect x={8} y={18} width={6} height={12} rx={2} fill="#111" />
      <rect x={46} y={18} width={6} height={12} rx={2} fill="#111" />
      <rect x={6} y={106} width={6} height={22} rx={2} fill="#111" />
      <rect x={48} y={106} width={6} height={22} rx={2} fill="#111" />
      {zone && <Arrow zone={zone} arrows={VAN_ARROWS} />}
    </svg>
  );
}

/** Motocicleta văzută de sus; formularul oficial o tipărește lângă mașină. */
export function BikeArt({ zone = null }: { zone?: ImpactZone | null }) {
  return (
    <svg viewBox="-8 -12 76 174" className="af-bike" role="img" aria-label="Motocicletă văzută de sus">
      <rect x={25} y={10} width={10} height={32} rx={5} fill="#111" />
      <rect x={25} y={108} width={10} height={32} rx={5} fill="#111" />
      <line x1={12} y1={46} x2={48} y2={46} stroke="#111" strokeWidth={3.5} strokeLinecap="round" />
      <ellipse cx={30} cy={72} rx={11} ry={20} fill="#fff" stroke="#111" strokeWidth={2} />
      <rect x={24} y={86} width={12} height={22} rx={5} fill="#fff" stroke="#111" strokeWidth={2} />
      <line x1={30} y1={42} x2={30} y2={52} stroke="#111" strokeWidth={2} />
      {zone && <Arrow zone={zone} arrows={BIKE_ARROWS} />}
    </svg>
  );
}
