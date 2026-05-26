import type { RoutineRitual } from "./types";

function startOfWeekMon(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dowMon = (x.getDay() + 6) % 7; // 0=Lun .. 6=Dom
  x.setDate(x.getDate() - dowMon);
  return x;
}

// Lunes 2024-01-01 como época fija para indexar semanas.
const WEEK_EPOCH = startOfWeekMon(new Date(2024, 0, 1)).getTime();
const WEEK_MS = 7 * 86_400_000;

/** Índice de semana (lunes como inicio) desde una época fija. */
export function weekIndex(d: Date): number {
  return Math.round((startOfWeekMon(d).getTime() - WEEK_EPOCH) / WEEK_MS);
}

/** ¿El ritual aplica en esta fecha? (día de semana + cada N semanas) */
export function ritualAppliesOn(r: RoutineRitual, date: Date): boolean {
  if (!r.days.includes(date.getDay())) return false;
  const n = Math.max(1, r.intervalWeeks | 0);
  if (n === 1) return true;
  const anchor = new Date(r.anchorISO + "T00:00:00");
  const diff = weekIndex(date) - weekIndex(anchor);
  return (((diff % n) + n) % n) === 0;
}
