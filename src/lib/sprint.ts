/** Número de semana ISO + año ISO para una fecha. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // lunes=1 … domingo=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // jueves de esta semana
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** Etiqueta del sprint de la semana (auto-calculada por semana ISO). */
export function sprintLabel(date: Date): string {
  const { week } = isoWeek(date);
  return `Sprint W${week}`;
}

/** Rango lunes–domingo de la semana ISO de la fecha. */
export function weekRange(date: Date): { start: Date; end: Date } {
  const dow = date.getDay(); // 0=Dom
  const back = dow === 0 ? 6 : dow - 1;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - back);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start, end };
}
