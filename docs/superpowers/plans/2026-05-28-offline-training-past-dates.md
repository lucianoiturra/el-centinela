# Offline Training & Past Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar pesos offline con cola en localStorage y sincronizar al reconectarse; registrar pesos de días pasados desde el modal DayDetail.

**Architecture:** `offline-queue.ts` es un módulo TypeScript puro (sin React, sin server actions) con helpers de cola y caché — completamente testeable con Vitest usando rutas relativas. El hook `useOfflineQueue` vive inline en `TrainingCard.tsx` (único consumidor del hook), donde ya están importados los server actions. `DayDetail.tsx` incorpora `TrainingCard` para días pasados.

**Tech Stack:** Next.js 14 (App Router), React hooks, localStorage, Vitest, TypeScript

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/offline-queue.ts` | Crear | Tipos, helpers puros de cola, helpers de caché — sin React, sin server actions |
| `src/lib/offline-queue.test.ts` | Crear | Tests unitarios con rutas relativas (Vitest) |
| `src/components/TrainingCard.tsx` | Modificar | Hook `useOfflineQueue` inline, caché de template, indicador offline |
| `src/app/globals.css` | Modificar | Clases CSS para el banner offline |
| `src/components/DayDetail.tsx` | Modificar | Agregar TrainingCard para días pasados |

---

## Task 1: Tests para los helpers puros de la cola

**Files:**
- Create: `src/lib/offline-queue.test.ts`

- [ ] **Step 1: Crear el archivo de tests**

```typescript
// src/lib/offline-queue.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getQueue, enqueue, flushQueue } from "./offline-queue";

// Mock de localStorage
let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { store = {}; },
  length: 0,
  key: () => null,
});

describe("getQueue", () => {
  beforeEach(() => { store = {}; });

  it("devuelve [] cuando no hay nada guardado", () => {
    expect(getQueue()).toEqual([]);
  });

  it("devuelve [] si el JSON está corrupto", () => {
    store["sentinel_offline_sets"] = "no-es-json{{{";
    expect(getQueue()).toEqual([]);
  });
});

describe("enqueue", () => {
  beforeEach(() => { store = {}; });

  it("agrega un setLog a la cola vacía", () => {
    const op = {
      type: "setLog" as const,
      date: "2026-05-28",
      exerciseId: 1,
      setNumber: 1,
      weightKg: 60,
      repsCompleted: 10,
      durationSeconds: null,
    };
    enqueue(op);
    expect(getQueue()).toEqual([op]);
  });

  it("agrega múltiples items en orden", () => {
    const op1 = { type: "setLog" as const, date: "2026-05-28", exerciseId: 1, setNumber: 1, weightKg: 60, repsCompleted: 10, durationSeconds: null };
    const op2 = { type: "setLog" as const, date: "2026-05-28", exerciseId: 1, setNumber: 2, weightKg: 62.5, repsCompleted: 8, durationSeconds: null };
    enqueue(op1);
    enqueue(op2);
    expect(getQueue()).toEqual([op1, op2]);
  });

  it("agrega un sessionDone a la cola", () => {
    const op = { type: "sessionDone" as const, date: "2026-05-28", sessionTemplateId: 5, done: true };
    enqueue(op);
    expect(getQueue()).toEqual([op]);
  });
});

describe("flushQueue", () => {
  beforeEach(() => { store = {}; });

  it("no llama a nada y devuelve 0 con cola vacía", async () => {
    const doSave = vi.fn();
    const doDone = vi.fn();
    expect(await flushQueue(doSave, doDone)).toBe(0);
    expect(doSave).not.toHaveBeenCalled();
    expect(doDone).not.toHaveBeenCalled();
  });

  it("procesa un setLog y lo elimina de la cola", async () => {
    const doSave = vi.fn().mockResolvedValue(undefined);
    const doDone = vi.fn();
    enqueue({ type: "setLog", date: "2026-05-28", exerciseId: 1, setNumber: 1, weightKg: 60, repsCompleted: 10, durationSeconds: null });

    const remaining = await flushQueue(doSave, doDone);

    expect(doSave).toHaveBeenCalledWith(
      new Date("2026-05-28T00:00:00"), 1, 1,
      { weightKg: 60, repsCompleted: 10, durationSeconds: null }
    );
    expect(remaining).toBe(0);
    expect(getQueue()).toHaveLength(0);
  });

  it("procesa un sessionDone y lo elimina de la cola", async () => {
    const doSave = vi.fn();
    const doDone = vi.fn().mockResolvedValue(undefined);
    enqueue({ type: "sessionDone", date: "2026-05-28", sessionTemplateId: 5, done: true });

    const remaining = await flushQueue(doSave, doDone);

    expect(doDone).toHaveBeenCalledWith(new Date("2026-05-28T00:00:00"), 5, true);
    expect(remaining).toBe(0);
    expect(getQueue()).toHaveLength(0);
  });

  it("mantiene en cola los ops que fallan", async () => {
    const doSave = vi.fn().mockRejectedValue(new Error("Network"));
    const doDone = vi.fn();
    const op = { type: "setLog" as const, date: "2026-05-28", exerciseId: 1, setNumber: 1, weightKg: 60, repsCompleted: 10, durationSeconds: null };
    enqueue(op);

    const remaining = await flushQueue(doSave, doDone);

    expect(remaining).toBe(1);
    expect(getQueue()).toEqual([op]);
  });

  it("procesa exitosos y conserva fallidos", async () => {
    const doSave = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Network"));
    const doDone = vi.fn();
    const op1 = { type: "setLog" as const, date: "2026-05-28", exerciseId: 1, setNumber: 1, weightKg: 60, repsCompleted: 10, durationSeconds: null };
    const op2 = { type: "setLog" as const, date: "2026-05-28", exerciseId: 1, setNumber: 2, weightKg: 62.5, repsCompleted: 8, durationSeconds: null };
    enqueue(op1);
    enqueue(op2);

    const remaining = await flushQueue(doSave, doDone);

    expect(remaining).toBe(1);
    expect(getQueue()).toEqual([op2]);
  });
});
```

- [ ] **Step 2: Verificar que los tests fallan (el módulo no existe aún)**

```
npm test
```

Expected: FAIL — `Cannot find module './offline-queue'`

---

## Task 2: Implementar offline-queue.ts

**Files:**
- Create: `src/lib/offline-queue.ts`

Este módulo es TypeScript puro: sin React, sin imports de server actions (`@/`). Eso lo hace testeable directamente con Vitest.

- [ ] **Step 1: Crear el módulo**

```typescript
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
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function setQueue(ops: PendingOp[]): void {
  if (typeof window === "undefined") return;
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
```

- [ ] **Step 2: Correr los tests**

```
npm test
```

Expected: todos los tests de `offline-queue.test.ts` en PASS. Los tests existentes no deben romperse.

- [ ] **Step 3: Commit**

```
git add src/lib/offline-queue.ts src/lib/offline-queue.test.ts
git commit -m "feat: offline-queue — cola localStorage testeable, caché de template"
```

---

## Task 3: CSS para el banner offline

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Agregar las clases después de `.training-done-btn.on`**

En `globals.css` (aprox. línea 232), localizar `.training-done-btn.on{ ... }` y agregar inmediatamente después:

```css
.training-offline-banner{ margin-top:12px; text-align:center; font-size:.76rem; padding:6px 12px; border-radius:8px; background:rgba(251,146,60,.08); border:1px solid rgba(251,146,60,.22); color:#fb923c; }
.training-offline-banner.synced{ background:rgba(45,212,191,.08); border-color:rgba(45,212,191,.25); color:var(--salud); }
```

- [ ] **Step 2: Commit**

```
git add src/app/globals.css
git commit -m "style: banner offline en TrainingCard"
```

---

## Task 4: Modificar TrainingCard — hook inline, caché y banner

**Files:**
- Modify: `src/components/TrainingCard.tsx`

El hook `useOfflineQueue` vive dentro de este archivo porque es el único que necesita los server actions ya importados (`saveSetLog`, `markSessionDone`).

- [ ] **Step 1: Agregar imports de offline-queue**

Al inicio de `TrainingCard.tsx`, después del import existente de `@/lib/types`, agregar:

```typescript
import { getQueue, enqueue, flushQueue, fmtDate, saveCache, loadCache, type PendingOp } from "@/lib/offline-queue";
```

- [ ] **Step 2: Agregar el hook `useOfflineQueue` como función local del archivo**

Antes de la función `intensityLabel` (al final del archivo), agregar:

```typescript
function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [synced, setSynced] = useState(false);

  const flush = useCallback(async () => {
    const before = getQueue().length;
    if (before === 0) return;
    const remaining = await flushQueue(saveSetLog, markSessionDone);
    setPendingCount(remaining);
    if (remaining < before) setSynced(true);
  }, []);

  useEffect(() => {
    setPendingCount(getQueue().length);
    flush();
  }, [flush]);

  useEffect(() => {
    if (!synced) return;
    const t = setTimeout(() => setSynced(false), 2000);
    return () => clearTimeout(t);
  }, [synced]);

  useEffect(() => {
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  const queueSetLog = useCallback(
    async (
      date: Date,
      exerciseId: number,
      setNumber: number,
      data: { weightKg?: number | null; repsCompleted?: number | null; durationSeconds?: number | null }
    ) => {
      try {
        await saveSetLog(date, exerciseId, setNumber, data);
      } catch {
        enqueue({
          type: "setLog",
          date: fmtDate(date),
          exerciseId,
          setNumber,
          weightKg: data.weightKg ?? null,
          repsCompleted: data.repsCompleted ?? null,
          durationSeconds: data.durationSeconds ?? null,
        });
        setPendingCount((n) => n + 1);
      }
    },
    []
  );

  const queueSessionDone = useCallback(
    async (date: Date, sessionTemplateId: number, done: boolean) => {
      try {
        await markSessionDone(date, sessionTemplateId, done);
      } catch {
        enqueue({
          type: "sessionDone",
          date: fmtDate(date),
          sessionTemplateId,
          done,
        });
        setPendingCount((n) => n + 1);
      }
    },
    []
  );

  return { queueSetLog, queueSessionDone, pendingCount, synced };
}
```

- [ ] **Step 3: Inicializar el hook en el componente `TrainingCard`**

Dentro de `TrainingCard`, después de los `useState` existentes, agregar:

```typescript
const { queueSetLog, queueSessionDone, pendingCount, synced } = useOfflineQueue();
```

- [ ] **Step 4: Reemplazar el `useEffect` de carga por la versión con caché**

Reemplazar el `useEffect` que llama a `getTrainingCardData` por:

```typescript
useEffect(() => {
  let cancelled = false;
  setLoading(true);
  const dateKey = fmtDate(date);

  function hydrate(d: TrainingCardData) {
    if (cancelled) return;
    setData(d);
    onSessionLoaded(d.session !== null);
    onSessionDone(d.done);
    const inputs: typeof setInputs = {};
    for (const [eid, sets] of Object.entries(d.todaySets)) {
      inputs[Number(eid)] = {};
      for (const s of sets) {
        inputs[Number(eid)][s.setNumber] = {
          w: s.weightKg != null ? String(s.weightKg) : "",
          r: s.repsCompleted != null ? String(s.repsCompleted) : "",
          d: s.durationSeconds != null ? String(s.durationSeconds) : "",
        };
      }
    }
    setSetInputs(inputs);
  }

  getTrainingCardData(date)
    .then((d) => {
      saveCache(dateKey, d);
      hydrate(d);
    })
    .catch(() => {
      const cached = loadCache<TrainingCardData>(dateKey);
      if (cached) hydrate(cached);
    })
    .finally(() => { if (!cancelled) setLoading(false); });

  return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [date]);
```

- [ ] **Step 5: Reemplazar `toggleDone` para usar el hook**

```typescript
const toggleDone = useCallback(async () => {
  if (!data?.session) return;
  const next = !data.done;
  setData((d) => d ? { ...d, done: next } : d);
  onSessionDone(next);
  await queueSessionDone(date, data.session.id, next);
}, [data, date, onSessionDone, queueSessionDone]);
```

- [ ] **Step 6: Reemplazar `handleSetBlur` para usar el hook**

```typescript
const handleSetBlur = useCallback(
  async (
    exId: number,
    setNumber: number,
    field: "w" | "r" | "d",
    value: string
  ) => {
    const num = value.trim() === "" ? null : Number(value);
    await queueSetLog(date, exId, setNumber, {
      weightKg: field === "w" ? num : undefined,
      repsCompleted: field === "r" ? num : undefined,
      durationSeconds: field === "d" ? num : undefined,
    });
  },
  [date, queueSetLog]
);
```

- [ ] **Step 7: Agregar el banner offline al JSX**

En el `return` principal de `TrainingCard` (el div raíz con clase `training-card`), agregar el banner como últimos hijos antes del cierre del div:

```tsx
{pendingCount > 0 && (
  <div className="training-offline-banner">
    {pendingCount} cambio{pendingCount > 1 ? "s" : ""} pendiente{pendingCount > 1 ? "s" : ""} · sin conexión
  </div>
)}
{synced && (
  <div className="training-offline-banner synced">✓ Sincronizado</div>
)}
```

- [ ] **Step 8: Verificar que compila**

```
npx tsc --noEmit
```

Expected: sin errores de TypeScript.

- [ ] **Step 9: Correr todos los tests**

```
npm test
```

Expected: PASS.

- [ ] **Step 10: Commit**

```
git add src/components/TrainingCard.tsx
git commit -m "feat: TrainingCard con cola offline, caché de template y banner de estado"
```

---

## Task 5: Agregar TrainingCard a DayDetail

**Files:**
- Modify: `src/components/DayDetail.tsx`

- [ ] **Step 1: Agregar el import de TrainingCard**

Después de los imports existentes en `DayDetail.tsx`, agregar:

```typescript
import TrainingCard from "@/components/TrainingCard";
```

- [ ] **Step 2: Agregar estado interno para los callbacks requeridos**

Dentro del componente `DayDetail`, después de los `useState` existentes, agregar:

```typescript
const [, setTrDone] = useState(false);
const [, setTrReq] = useState(false);
```

DayDetail no necesita leer estos valores — la lógica de "Día Ganado" vive en Sentinel y se recalcula cuando el modal cierra (via `reloadKey`).

- [ ] **Step 3: Renderizar TrainingCard en el modal**

En el bloque JSX del modal (dentro del `!loaded ? ... : (...)`), agregar `<TrainingCard>` entre el bloque de "Rituales" y el bloque de "Línea espiritual":

```tsx
{!loaded ? (
  <div className="config-soon">Cargando…</div>
) : (
  <>
    <label className="dd-label">TAA del día</label>
    <input className="dd-input" value={taa} placeholder="Tu TAA de ese día…"
      onChange={(e) => setTaa(e.target.value)} onBlur={saveTaaText} />
    <button className={`dd-done${taaDone ? " on" : ""}`} onClick={toggleDone}>
      <span className="dd-box">{taaDone ? "✓" : ""}</span>{taaDone ? "TAA cumplida" : "Marcar TAA cumplida"}
    </button>

    <label className="dd-label">Rituales</label>
    <div className="dd-rituals">
      {rituals.length === 0 ? (
        <div className="config-soon">Sin rituales ese día.</div>
      ) : rituals.map((r) => (
        <div key={r.id} className={`dd-node${checks[r.id] ? " done" : ""}`} onClick={() => toggle(r.id)}>
          <span className="dd-box">{checks[r.id] ? "✓" : ""}</span>
          <span>{r.icon} {r.label}{r.time ? ` · ${r.time}` : ""}</span>
        </div>
      ))}
    </div>

    <TrainingCard
      date={date}
      onSessionDone={setTrDone}
      onSessionLoaded={setTrReq}
    />

    <label className="dd-label">Línea espiritual</label>
    <textarea className="dd-input" rows={2} value={linea} placeholder="Tu línea de ese día…"
      onChange={(e) => setLinea(e.target.value)} onBlur={saveLineaText} />
  </>
)}
```

- [ ] **Step 4: Verificar que compila**

```
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 5: Correr todos los tests**

```
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```
git add src/components/DayDetail.tsx
git commit -m "feat: DayDetail muestra TrainingCard para registrar sesiones pasadas"
```

---

## Prueba manual (golden path)

1. Abrir la app con internet → confirmar que TrainingCard carga normalmente.
2. Desconectar internet (devtools → Network → Offline o modo avión).
3. Escribir un peso en un ejercicio y salir del campo (blur) → confirmar banner **"1 cambio pendiente · sin conexión"**.
4. Marcar sesión como hecha → confirmar banner **"2 cambios pendientes · sin conexión"**.
5. Reconectar internet → confirmar que el banner cambia a **"✓ Sincronizado"** y desaparece.
6. Recargar la página → confirmar que los pesos y el estado "hecha" persisten (vienen de la DB).
7. Clic en un día pasado de La Cadena → confirmar que `DayDetail` muestra la TrainingCard con los ejercicios de ese día.
8. Registrar un peso en ese día pasado → confirmar que se guarda (o queda en cola si estás offline).
9. Cerrar el modal → confirmar que la cadena refleja el nuevo estado (si marcaste la sesión hecha, el día aparece como ganado).
