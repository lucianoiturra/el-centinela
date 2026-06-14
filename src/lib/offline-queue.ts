// src/lib/offline-queue.ts
// Módulo puro: sin React, sin server actions. Solo helpers de cola y caché.

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type SetLogOp = {
  type: "setLog";
  date: string; // YYYY-MM-DD
  exerciseId: number;
  setNumber: number;
  weightKg: number | null;
  repsCompleted: number | null;
  durationSeconds: number | null;
};

export type SessionDoneOp = {
  type: "sessionDone";
  date: string; // YYYY-MM-DD
  sessionTemplateId: number;
  done: boolean;
};

export type PendingOp = SetLogOp | SessionDoneOp;

// ─── Fecha ────────────────────────────────────────────────────────────────────

// Uses LOCAL date (not UTC) — training dates are user-local.
export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Cola ─────────────────────────────────────────────────────────────────────

const QUEUE_KEY = "sentinel_offline_sets";

export function getQueue(): PendingOp[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setQueue(ops: PendingOp[]): void {
  // In SSR, window is undefined but localStorage might still be stubbed for tests
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
}

export function enqueue(op: PendingOp): void {
  setQueue([...getQueue(), op]);
}

// ─── Flush ────────────────────────────────────────────────────────────────────

type SaveSetLogFn = (
  dateISO: string,
  exerciseId: number,
  setNumber: number,
  data: { weightKg?: number | null; repsCompleted?: number | null; durationSeconds?: number | null }
) => Promise<void>;

type MarkSessionDoneFn = (
  dateISO: string,
  sessionTemplateId: number,
  done: boolean
) => Promise<void>;

/** Returns the number of operations that failed and remain in the queue. */
export async function flushQueue(
  doSaveSetLog: SaveSetLogFn,
  doMarkSessionDone: MarkSessionDoneFn
): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  const remaining: PendingOp[] = [];
  for (const op of queue) {
    try {
      // op.date ya es el string YYYY-MM-DD local que espera el server action.
      if (op.type === "setLog") {
        await doSaveSetLog(op.date, op.exerciseId, op.setNumber, {
          weightKg: op.weightKg,
          repsCompleted: op.repsCompleted,
          durationSeconds: op.durationSeconds,
        });
      } else {
        await doMarkSessionDone(op.date, op.sessionTemplateId, op.done);
      }
    } catch {
      remaining.push(op);
    }
  }
  setQueue(remaining);
  return remaining.length;
}

// ─── Caché del template ───────────────────────────────────────────────────────

const CACHE_PREFIX = "sentinel_tc_";

export function saveCache(dateKey: string, data: unknown): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + dateKey, JSON.stringify(data));
  } catch { console.warn("[offline-queue] saveCache failed:", dateKey); }
}

export function loadCache<T>(dateKey: string): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + dateKey);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// ─── Poda de claves viejas ──────────────────────────────────────────────────

// Prefijos de claves con una fecha YYYY-MM-DD embebida al final.
const DATED_PREFIXES = [
  CACHE_PREFIX,          // sentinel_tc_
  "cent_taaskip_",
  "cent_task_",
  "cent_taa_",
  "cent_won_",
];

/**
 * Borra del localStorage las entradas con fecha embebida de más de `maxAgeDays`.
 * Claves sin prefijo conocido o sin fecha parseable: no se tocan.
 */
export function pruneOldKeys(todayISO: string, maxAgeDays = 30): void {
  if (typeof localStorage === "undefined") return;
  const today = new Date(todayISO + "T00:00:00Z").getTime();
  if (Number.isNaN(today)) return;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const prefix = DATED_PREFIXES.find((p) => key.startsWith(p));
    if (!prefix) continue;
    const datePart = key.slice(prefix.length);
    // La fecha es lo primero tras el prefijo; algunas claves (cent_task_) llevan
    // sufijo extra (`YYYY-MM-DD_ritualId`), así que no anclamos el final.
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(datePart);
    if (!m) continue;
    const t = new Date(m[1] + "T00:00:00Z").getTime();
    if (Number.isNaN(t)) continue;
    if (today - t > maxAgeMs) toDelete.push(key);
  }
  for (const key of toDelete) localStorage.removeItem(key);
}
