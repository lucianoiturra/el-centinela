import { Phase, Ritual } from "./types";

export const PHASE_META: Record<Phase, { name: string; icon: string }> = {
  madrugada: { name: "Madrugada", icon: "🌑" },
  manana: { name: "Mañana", icon: "☀️" },
  tarde: { name: "Tarde", icon: "🌤️" },
  noche: { name: "Noche", icon: "🌙" },
};

export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function phaseOf(min: number): Phase {
  if (min < 360) return "madrugada";
  if (min < 780) return "manana";
  if (min < 1080) return "tarde";
  return "noche";
}

export type Focus =
  | { mode: "sabbath" }
  | { mode: "madrugada" }
  | { mode: "inblock"; ritual: Ritual; remaining: number }
  | { mode: "upcoming"; ritual: Ritual; until: number }
  | { mode: "norte" };

/** Decide qué muestra el héroe según la hora y las anclas duras del día. */
export function getFocus(rituals: Ritual[], min: number, sabbath: boolean): Focus {
  if (sabbath) return { mode: "sabbath" };
  if (min < 360) return { mode: "madrugada" };
  const hards = rituals
    .filter((r) => r.hard && r.startMin != null && r.endMin != null)
    .sort((a, b) => (a.startMin! - b.startMin!));
  for (const h of hards) {
    if (min >= h.startMin! && min < h.endMin!) return { mode: "inblock", ritual: h, remaining: h.endMin! - min };
  }
  for (const h of hards) {
    if (h.startMin! > min && h.startMin! - min <= 120) return { mode: "upcoming", ritual: h, until: h.startMin! - min };
  }
  return { mode: "norte" };
}

export function fmtRem(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// ── Fondo dinámico por hora (interpolación HSL) ──
type Stop = { m: number; a: [number, number, number]; b: [number, number, number] };
const BG: Stop[] = [
  { m: 0, a: [232, 42, 7], b: [236, 46, 12] },
  { m: 330, a: [232, 42, 7], b: [236, 46, 12] },
  { m: 390, a: [18, 42, 11], b: [285, 28, 15] },
  { m: 480, a: [28, 50, 15], b: [265, 30, 18] },
  { m: 660, a: [214, 38, 16], b: [222, 40, 22] },
  { m: 840, a: [214, 32, 18], b: [222, 36, 24] },
  { m: 1020, a: [210, 34, 17], b: [230, 36, 21] },
  { m: 1080, a: [20, 46, 14], b: [300, 30, 16] },
  { m: 1200, a: [268, 34, 11], b: [230, 42, 13] },
  { m: 1440, a: [236, 46, 7], b: [240, 46, 11] },
];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hsl = (x: [number, number, number]) => `hsl(${x[0].toFixed(0)},${x[1].toFixed(0)}%,${x[2].toFixed(0)}%)`;

/** Devuelve [colorArriba, colorAbajo] del gradiente para el minuto del día. */
export function bgGradient(min: number, sabbath: boolean): [string, string] {
  if (sabbath) return ["hsl(155,24%,9%)", "hsl(162,28%,15%)"];
  for (let i = 0; i < BG.length - 1; i++) {
    if (min >= BG[i].m && min <= BG[i + 1].m) {
      const t = (min - BG[i].m) / (BG[i + 1].m - BG[i].m);
      const a: [number, number, number] = [
        lerp(BG[i].a[0], BG[i + 1].a[0], t),
        lerp(BG[i].a[1], BG[i + 1].a[1], t),
        lerp(BG[i].a[2], BG[i + 1].a[2], t),
      ];
      const b: [number, number, number] = [
        lerp(BG[i].b[0], BG[i + 1].b[0], t),
        lerp(BG[i].b[1], BG[i + 1].b[1], t),
        lerp(BG[i].b[2], BG[i + 1].b[2], t),
      ];
      return [hsl(a), hsl(b)];
    }
  }
  return ["hsl(236,46%,7%)", "hsl(240,46%,11%)"];
}
