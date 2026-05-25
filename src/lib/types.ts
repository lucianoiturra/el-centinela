// Tipos compartidos de El Centinela

export type Pillar =
  | "comunion"
  | "salud"
  | "finanzas"
  | "sistema"
  | "basalto"
  | "cab"
  | "pareja"
  | "hogar";

export type Phase = "madrugada" | "manana" | "tarde" | "noche";
export type RitualPhase = Exclude<Phase, "madrugada">;

export interface Ritual {
  id: string;
  label: string;
  icon: string;
  pillar: Pillar;
  phase: RitualPhase;
  /** Ancla dura: tiene hora real y habilita cuenta regresiva en el héroe. */
  hard?: boolean;
  startMin?: number; // minutos desde medianoche
  endMin?: number;
  time?: string; // etiqueta visible (ej. "14:00–16:00")
  optional?: boolean;
  highlight?: boolean;
  /** True si es la TAA (compuerta diaria). */
  isTaa?: boolean;
  /** Origen: ritual fijo o evento de Google Calendar. */
  source?: "routine" | "calendar" | "finance";
}

export interface CalendarEvent {
  id: string;
  summary: string;
  startISO: string;
  endISO: string;
  allDay: boolean;
}

export interface CyclePhaseInfo {
  id: "menstruacion" | "folicular" | "ovulacion" | "lutea";
  name: string;
  icon: string;
  color: string;
  desc: string;
  dayInCycle: number;
}

export const PILLAR_COLORS: Record<Pillar, string> = {
  comunion: "#a78bfa",
  salud: "#2dd4bf",
  finanzas: "#4ade80",
  sistema: "#94a3b8",
  basalto: "#fb923c",
  cab: "#93c5fd",
  pareja: "#f9a8d4",
  hogar: "#7dd3fc",
};
