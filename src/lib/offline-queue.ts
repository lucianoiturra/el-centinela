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

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Cola ─────────────────────────────────────────────────────────────────────

const QUEUE_KEY = "sentinel_offline_sets";

export function getQueue(): PendingOp[] {
  try {
    // In SSR, window is undefined but localStorage might still be stubbed for tests
    if (typeof localStorage === "undefined") return [];
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
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
  date: Date,
  exerciseId: number,
  setNumber: number,
  data: { weightKg?: number | null; repsCompleted?: number | null; durationSeconds?: number | null }
) => Promise<void>;

type MarkSessionDoneFn = (
  date: Date,
  sessionTemplateId: number,
  done: boolean
) => Promise<void>;

export async function flushQueue(
  doSaveSetLog: SaveSetLogFn,
  doMarkSessionDone: MarkSessionDoneFn
): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  const remaining: PendingOp[] = [];
  for (const op of queue) {
    try {
      const date = new Date(op.date + "T00:00:00");
      if (op.type === "setLog") {
        await doSaveSetLog(date, op.exerciseId, op.setNumber, {
          weightKg: op.weightKg,
          repsCompleted: op.repsCompleted,
          durationSeconds: op.durationSeconds,
        });
      } else {
        await doMarkSessionDone(date, op.sessionTemplateId, op.done);
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
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + dateKey, JSON.stringify(data));
  } catch {}
}

export function loadCache<T>(dateKey: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + dateKey);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
