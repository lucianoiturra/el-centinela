// src/lib/training.ts
// Lógica pura — sin dependencias de DB ni de servidor.

/**
 * Calcula el número de fase (1–4) según las fechas.
 * Fase 4 = últimas 3 semanas antes de race_date.
 * Fase 3 = meses 5–6 desde start_date.
 * Fase 2 = meses 3–4. Fase 1 = meses 1–2.
 */
export function calculatePhaseNumber(
  startDate: Date,
  today: Date,
  raceDate: Date
): 1 | 2 | 3 | 4 {
  // Taper: últimas 3 semanas antes de la carrera
  const taperStart = new Date(raceDate);
  taperStart.setUTCDate(taperStart.getUTCDate() - 21);
  if (today >= taperStart) return 4;

  // Mes relativo al inicio (0-based), usando UTC para evitar problemas de timezone
  const yearDiff = today.getUTCFullYear() - startDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - startDate.getUTCMonth();
  const relativeMonth = yearDiff * 12 + monthDiff;

  if (relativeMonth < 2) return 1;
  if (relativeMonth < 4) return 2;
  return 3;
}

/**
 * Convierte el valor de Date.getDay() (0=Dom) al day_of_week del plan (1=Lun…7=Dom).
 */
export function jsDayToPlanDay(jsDay: number): number {
  if (jsDay === 0) return 7; // Domingo → 7
  return jsDay;              // Lun=1 … Sáb=6
}

/**
 * Sábado = Sábado Santo — nunca hay entrenamiento.
 */
export function isSabbathDay(today: Date): boolean {
  return today.getDay() === 5;
}
