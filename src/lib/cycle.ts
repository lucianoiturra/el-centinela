import { CyclePhaseInfo } from "./types";

/** Inicio de ciclo conocido por defecto (ciclo Metcalfe de Michelle). */
export const DEFAULT_LAST_PERIOD = new Date(2026, 3, 17); // 2026-04-17
export const DEFAULT_CYCLE_LENGTH = 28;

const PHASES: Omit<CyclePhaseInfo, "dayInCycle">[] = [
  { id: "menstruacion", name: "Menstruación", icon: "🔴", color: "#f43f5e", desc: "Energía baja, sensibilidad alta, posible dolor. Acompáñala suave." },
  { id: "folicular", name: "Folicular", icon: "🌸", color: "#818cf8", desc: "Energía creciente, buen humor, claridad. Ventana fértil comienza." },
  { id: "ovulacion", name: "Ovulación", icon: "☀️", color: "#fbbf24", desc: "Máxima energía y sociabilidad. Pico de fertilidad." },
  { id: "lutea", name: "Lútea", icon: "🍂", color: "#60a5fa", desc: "Energía decreciente, introspectiva, sensible. Posible SPM al final." },
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Fase del ciclo para una fecha, proyectando ciclos de `length` días. */
export function getCyclePhase(
  date: Date,
  lastPeriodStart: Date = DEFAULT_LAST_PERIOD,
  length: number = DEFAULT_CYCLE_LENGTH
): CyclePhaseInfo | null {
  const diff = Math.floor(
    (startOfDay(date).getTime() - startOfDay(lastPeriodStart).getTime()) / 86400000
  );
  if (diff < 0) return null;
  const dayInCycle = (diff % length) + 1; // 1..length
  let base: Omit<CyclePhaseInfo, "dayInCycle">;
  if (dayInCycle <= 5) base = PHASES[0];
  else if (dayInCycle <= 13) base = PHASES[1];
  else if (dayInCycle <= 16) base = PHASES[2];
  else base = PHASES[3];
  return { ...base, dayInCycle };
}
