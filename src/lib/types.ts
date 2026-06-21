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

export const PILLARS: Pillar[] = [
  "comunion",
  "salud",
  "finanzas",
  "sistema",
  "basalto",
  "cab",
  "pareja",
  "hogar",
];

export const PILLAR_LABELS: Record<Pillar, string> = {
  comunion: "Comunion",
  salud: "Salud",
  finanzas: "Finanzas",
  sistema: "Sistema",
  basalto: "Basalto",
  cab: "CAB",
  pareja: "Pareja",
  hogar: "Hogar",
};

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

/** Ritual configurable por el usuario (persistido en routine_ritual). */
export interface RoutineRitual {
  id: string;
  label: string;
  icon: string;
  pillar: Pillar;
  phase: RitualPhase;
  startMin?: number;
  endMin?: number;
  time?: string;
  hard: boolean;
  optional: boolean;
  isTaa: boolean;
  days: number[];        // 0=Dom .. 6=Sáb
  intervalWeeks: number; // >= 1 ("cada N semanas")
  anchorISO: string;     // YYYY-MM-DD, semana de referencia
  sortOrder: number;
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

// ─── Entrenamiento Ciclismo ───────────────────────────────────────────────────

export interface TrainingPhase {
  id: number;
  planId: number;
  phaseNumber: 1 | 2 | 3 | 4;
  name: string;
  description: string | null;
  startMonth: number;
  endMonth: number;
  bikeKmWeekMin: number | null;
  bikeKmWeekMax: number | null;
  weightsDaysPerWeek: number | null;
}

export interface TrainingSessionTemplate {
  id: number;
  phaseId: number;
  dayOfWeek: number; // 1=Lun … 7=Dom (6=Sáb nunca tiene sesión)
  activityType: "bike" | "weights" | "rest";
  title: string;
  description: string | null;
  durationMin: number | null;
  intensity: "low" | "moderate" | "high" | "very_high" | "rest" | null;
  levelMin: number | null;
  levelMax: number | null;
  rpmMin: number | null;
  rpmMax: number | null;
  wattsRef: string | null;
  routineLabel: "A" | "B" | "A_reducida" | "B_reducida" | null;
}

export interface TrainingExercise {
  id: number;
  sessionTemplateId: number;
  sortOrder: number;
  name: string;
  sets: number;
  repsLabel: string;
  restSeconds: number | null;
  muscleGroup: string | null;
  notes: string | null;
}

export interface TrainingSetLog {
  id: number;
  userId: string;
  date: string; // YYYY-MM-DD
  exerciseId: number;
  setNumber: number;
  weightKg: number | null;
  repsCompleted: number | null;
  durationSeconds: number | null;
  notes: string | null;
}
