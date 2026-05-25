import { Ritual } from "./types";

/**
 * Plantilla de rutina semanal POR DEFECTO (sembrada).
 * Clave = día de la semana JS (0=Dom … 6=Sáb).
 * En la app real esto se sobreescribe con la config editable del usuario
 * (tabla routine_config), pero esta es la semilla inicial.
 */
export const DEFAULT_ROUTINE: Record<number, Ritual[]> = {
  // Lunes
  1: [
    { id: "higiene", label: "Higiene personal", icon: "🧼", pillar: "hogar", phase: "manana" },
    { id: "definir", label: "Definir el día — TAA + 3 acciones", icon: "🌅", pillar: "sistema", phase: "manana", isTaa: true },
    { id: "bici", label: "Bici — L'Étape training (30–45 min)", icon: "🚴", pillar: "salud", phase: "manana" },
    { id: "planning", label: "Planning Sprint (30 min) — 3 compromisos en orden", icon: "📋", pillar: "sistema", phase: "manana" },
    { id: "lavar", label: "Lavar ropa", icon: "👕", pillar: "hogar", phase: "noche" },
    { id: "cierre", label: "Cierre nocturno + 1 línea espiritual", icon: "🌙", pillar: "comunion", phase: "noche", hard: true, startMin: 1320, endMin: 1380, time: "22:00" },
  ],
  // Martes
  2: [
    { id: "higiene", label: "Higiene personal", icon: "🧼", pillar: "hogar", phase: "manana" },
    { id: "definir", label: "Definir el día — TAA + 3 acciones", icon: "🌅", pillar: "sistema", phase: "manana", isTaa: true },
    { id: "gym", label: "Gym — fuerza (complemento L'Étape)", icon: "🏋️", pillar: "salud", phase: "manana" },
    { id: "basalto", label: "Bloque Basalto — no mover", icon: "🏗️", pillar: "basalto", phase: "tarde", hard: true, startMin: 840, endMin: 960, time: "14:00–16:00", highlight: true },
    { id: "cierre", label: "Cierre nocturno + 1 línea espiritual", icon: "🌙", pillar: "comunion", phase: "noche", hard: true, startMin: 1320, endMin: 1380, time: "22:00" },
  ],
  // Miércoles
  3: [
    { id: "higiene", label: "Higiene personal", icon: "🧼", pillar: "hogar", phase: "manana" },
    { id: "definir", label: "Definir el día — TAA + 3 acciones", icon: "🌅", pillar: "sistema", phase: "manana", isTaa: true },
    { id: "bici", label: "Bici — L'Étape training (30–45 min)", icon: "🚴", pillar: "salud", phase: "manana" },
    { id: "bas-cont", label: "Continuación Basalto / buffer", icon: "🏗️", pillar: "basalto", phase: "tarde" },
    { id: "cierre", label: "Cierre nocturno + 1 línea espiritual", icon: "🌙", pillar: "comunion", phase: "noche", hard: true, startMin: 1320, endMin: 1380, time: "22:00" },
  ],
  // Jueves
  4: [
    { id: "higiene", label: "Higiene personal", icon: "🧼", pillar: "hogar", phase: "manana" },
    { id: "definir", label: "Definir el día — TAA + 3 acciones", icon: "🌅", pillar: "sistema", phase: "manana", isTaa: true },
    { id: "gym", label: "Gym — fuerza (complemento L'Étape)", icon: "🏋️", pillar: "salud", phase: "manana" },
    { id: "cierre", label: "Cierre nocturno + 1 línea espiritual", icon: "🌙", pillar: "comunion", phase: "noche", hard: true, startMin: 1320, endMin: 1380, time: "22:00" },
  ],
  // Viernes — día de preparación pre-Sábado
  5: [
    { id: "higiene", label: "Higiene personal", icon: "🧼", pillar: "hogar", phase: "manana" },
    { id: "definir", label: "Definir el día — TAA + 3 acciones", icon: "🌅", pillar: "sistema", phase: "manana", isTaa: true },
    { id: "bici", label: "Bici — L'Étape training (30–45 min)", icon: "🚴", pillar: "salud", phase: "manana" },
    { id: "limpieza", label: "Limpieza del hogar (preparación pre-Sábado)", icon: "🧹", pillar: "hogar", phase: "tarde" },
    { id: "briefing", label: "Briefing semanal CON Michelle — NO NEGOCIABLE", icon: "📊", pillar: "sistema", phase: "tarde", hard: true, startMin: 1050, endMin: 1080, time: "17:30", highlight: true },
    { id: "cierre", label: "Cierre nocturno + 1 línea espiritual", icon: "🌙", pillar: "comunion", phase: "noche", hard: true, startMin: 1320, endMin: 1380, time: "22:00" },
  ],
  // Sábado — Sábado Santo (IASD): sin trabajo, sin ejercicio
  6: [
    { id: "culto", label: "Culto IASD — adoración y comunión", icon: "🕍", pillar: "comunion", phase: "manana" },
    { id: "lectura", label: "Lectura bíblica / estudio de la Palabra", icon: "📖", pillar: "comunion", phase: "tarde" },
    { id: "descanso", label: "Descanso sagrado — restaura cuerpo y alma", icon: "💤", pillar: "comunion", phase: "noche" },
    { id: "cierre", label: "Cierre nocturno + 1 línea espiritual", icon: "🌙", pillar: "comunion", phase: "noche", hard: true, startMin: 1320, endMin: 1380, time: "22:00" },
  ],
  // Domingo
  0: [
    { id: "higiene", label: "Higiene personal", icon: "🧼", pillar: "hogar", phase: "manana" },
    { id: "definir", label: "Definir el día — TAA + 3 acciones", icon: "🌅", pillar: "sistema", phase: "manana", isTaa: true },
    { id: "comunion", label: "Comunión / descanso", icon: "🙏", pillar: "comunion", phase: "manana" },
    { id: "super", label: "Supermercado semanal", icon: "🛒", pillar: "hogar", phase: "tarde" },
    { id: "cierre", label: "Cierre nocturno + 1 línea espiritual", icon: "🌙", pillar: "comunion", phase: "noche", hard: true, startMin: 1320, endMin: 1380, time: "22:00" },
  ],
};

export function isSabbath(date: Date): boolean {
  return date.getDay() === 6;
}

/** Rituales fijos de una fecha, desde la plantilla (o una custom). */
export function getRoutineRituals(
  date: Date,
  routine: Record<number, Ritual[]> = DEFAULT_ROUTINE
): Ritual[] {
  return (routine[date.getDay()] ?? []).map((r) => ({ ...r, source: "routine" as const }));
}
