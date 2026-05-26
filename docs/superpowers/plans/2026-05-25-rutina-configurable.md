# Rutina configurable + "Mi rutina" — Implementation Plan (Plan 1 de 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la rutina hardcodeada por una rutina editable por el usuario (días de semana + "cada N semanas"), persistida en Postgres, con una pantalla `/configuracion` → "Mi rutina" para crear, editar la periodicidad y borrar rituales; reflejada en la espina diaria.

**Architecture:** Tabla `routine_ritual` (una fila por ritual con `days[]`, `interval_weeks`, `anchor_date`). Lógica de periodicidad en funciones puras testeadas (`routine-rules.ts`). Server actions cargan/guardan la rutina; `Sentinel` la carga async y computa la espina por fecha. `DEFAULT_ROUTINE` queda solo como semilla.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, `postgres` (Neon), vitest (tests de funciones puras).

**Roadmap de planes (este es el 1):**
1. **Rutina configurable + Mi rutina** ← este plan
2. Vista mensual (grilla solo-lectura)
3. Ajuste del ciclo de Michelle (tab Ciclo + cableado real)
4. Línea espiritual + Diario
5. Editar día pasado (DayDetail desde la cadena)

---

### Task 1: Setup de vitest para funciones puras

**Files:**
- Modify: `package.json` (scripts + devDependency)

- [ ] **Step 1: Instalar vitest**

Run: `npm install -D vitest`
Expected: vitest añadido a devDependencies, sin errores.

- [ ] **Step 2: Añadir script de test en package.json**

En `package.json`, dentro de `"scripts"`, añadir:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Verificar que vitest corre (sin tests aún)**

Run: `npx vitest run`
Expected: "No test files found" (exit 0) o similar. Confirma que vitest está instalado.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: añadir vitest para tests de lógica pura"
```

---

### Task 2: Tipo `RoutineRitual` + reglas puras de periodicidad (TDD)

**Files:**
- Modify: `src/lib/types.ts` (añadir `RoutineRitual`)
- Create: `src/lib/routine-rules.ts`
- Test: `src/lib/routine-rules.test.ts`

- [ ] **Step 1: Añadir el tipo `RoutineRitual` en `src/lib/types.ts`**

Después de la interface `CalendarEvent`, añadir:

```ts
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
```

- [ ] **Step 2: Escribir el test que falla en `src/lib/routine-rules.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { weekIndex, ritualAppliesOn } from "./routine-rules";
import type { RoutineRitual } from "./types";

const base: RoutineRitual = {
  id: "x", label: "X", icon: "•", pillar: "hogar", phase: "noche",
  hard: false, optional: false, isTaa: false,
  days: [0], intervalWeeks: 1, anchorISO: "2026-05-24", sortOrder: 0,
};

describe("weekIndex", () => {
  it("misma semana (lun-dom) da el mismo índice", () => {
    expect(weekIndex(new Date(2026, 4, 18))).toBe(weekIndex(new Date(2026, 4, 24))); // lun 18 .. dom 24
  });
  it("semana siguiente difiere en 1", () => {
    expect(weekIndex(new Date(2026, 4, 25)) - weekIndex(new Date(2026, 4, 18))).toBe(1);
  });
});

describe("ritualAppliesOn", () => {
  it("solo aplica en los días configurados", () => {
    expect(ritualAppliesOn(base, new Date(2026, 4, 24))).toBe(true);  // domingo
    expect(ritualAppliesOn(base, new Date(2026, 4, 25))).toBe(false); // lunes
  });
  it("intervalWeeks=1 aplica todas las semanas", () => {
    const r = { ...base, days: [0] };
    expect(ritualAppliesOn(r, new Date(2026, 4, 24))).toBe(true);
    expect(ritualAppliesOn(r, new Date(2026, 4, 31))).toBe(true);
  });
  it("intervalWeeks=2 aplica semana por medio desde el ancla", () => {
    const r = { ...base, days: [0], intervalWeeks: 2, anchorISO: "2026-05-24" };
    expect(ritualAppliesOn(r, new Date(2026, 4, 24))).toBe(true);   // ancla
    expect(ritualAppliesOn(r, new Date(2026, 4, 31))).toBe(false);  // +1 semana
    expect(ritualAppliesOn(r, new Date(2026, 5, 7))).toBe(true);    // +2 semanas
  });
});
```

- [ ] **Step 3: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/lib/routine-rules.test.ts`
Expected: FAIL ("Failed to resolve import ./routine-rules" o "weekIndex is not a function").

- [ ] **Step 4: Implementar `src/lib/routine-rules.ts`**

```ts
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
```

- [ ] **Step 5: Ejecutar el test para verificar que pasa**

Run: `npx vitest run src/lib/routine-rules.test.ts`
Expected: PASS (3 tests de ritualAppliesOn + 2 de weekIndex).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/routine-rules.ts src/lib/routine-rules.test.ts
git commit -m "feat: tipo RoutineRitual + reglas puras de periodicidad (días + cada N semanas)"
```

---

### Task 3: Migración SQL (`routine_ritual` + `day_state.linea_espiritual`)

**Files:**
- Create: `src/lib/db/migrations/2026-05-25-routine-ritual.sql`
- Modify: `src/lib/db/schema.sql`

> NOTA: la DB (Neon) se migra corriendo el SQL una vez. El paso de aplicación toca la base compartida (aditivo e idempotente). Confirmar con el usuario antes de ejecutarlo contra Neon.

- [ ] **Step 1: Crear el archivo de migración `src/lib/db/migrations/2026-05-25-routine-ritual.sql`**

```sql
-- Rutina editable por ritual (reemplaza routine_config)
CREATE TABLE IF NOT EXISTS routine_ritual (
  user_id        TEXT        NOT NULL,
  id             TEXT        NOT NULL,
  label          TEXT        NOT NULL,
  icon           TEXT        NOT NULL,
  pillar         TEXT        NOT NULL,
  phase          TEXT        NOT NULL,
  start_min      SMALLINT,
  end_min        SMALLINT,
  time           TEXT,
  hard           BOOLEAN     NOT NULL DEFAULT FALSE,
  optional       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_taa         BOOLEAN     NOT NULL DEFAULT FALSE,
  days           SMALLINT[]  NOT NULL,
  interval_weeks SMALLINT    NOT NULL DEFAULT 1,
  anchor_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  sort_order     SMALLINT    NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE day_state ADD COLUMN IF NOT EXISTS linea_espiritual TEXT;

DROP TABLE IF EXISTS routine_config;
```

- [ ] **Step 2: Reflejar los cambios en `src/lib/db/schema.sql`**

Reemplazar el bloque `CREATE TABLE IF NOT EXISTS routine_config (...)` por el `CREATE TABLE IF NOT EXISTS routine_ritual (...)` de arriba, y añadir bajo la definición de `day_state` un comentario:
`-- + columna linea_espiritual TEXT (línea espiritual del cierre, por fecha)` y la columna `linea_espiritual TEXT` dentro del CREATE de `day_state`.

- [ ] **Step 3: Aplicar la migración en Neon**

Opción A (recomendada, una sola vez): pegar el SQL del Step 1 en la consola SQL de Neon (Neon Console → SQL Editor) y ejecutar.
Opción B (desde el repo): crear y correr un script único:

Run:
```bash
node -e "const p=require('postgres');const fs=require('fs');require('dotenv').config({path:'.env.local'});const sql=p(process.env.DATABASE_URL,{ssl:'require'});sql.file('src/lib/db/migrations/2026-05-25-routine-ritual.sql').then(()=>{console.log('OK');return sql.end()}).catch(e=>{console.error(e);process.exit(1)})"
```
Expected: imprime `OK`. (Si `dotenv` no está, exportar `DATABASE_URL` manualmente o usar Opción A.)

- [ ] **Step 4: Verificar la tabla**

Run:
```bash
node -e "const p=require('postgres');require('dotenv').config({path:'.env.local'});const sql=p(process.env.DATABASE_URL,{ssl:'require'});sql\`SELECT column_name FROM information_schema.columns WHERE table_name='routine_ritual' ORDER BY ordinal_position\`.then(r=>{console.log(r.map(x=>x.column_name).join(','));return sql.end()})"
```
Expected: lista de columnas incluyendo `user_id,id,label,...,days,interval_weeks,anchor_date,sort_order,updated_at`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/migrations/2026-05-25-routine-ritual.sql src/lib/db/schema.sql
git commit -m "feat(db): tabla routine_ritual + columna day_state.linea_espiritual"
```

---

### Task 4: Semilla + refactor de `getRoutineRituals` (TDD)

**Files:**
- Modify: `src/lib/rituals.ts`
- Test: `src/lib/rituals.test.ts`

- [ ] **Step 1: Escribir el test que falla en `src/lib/rituals.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { seedRowsFromDefault, getRoutineRituals } from "./rituals";

describe("seedRowsFromDefault", () => {
  const seed = seedRowsFromDefault("2026-05-25");
  it("crea una fila por id único", () => {
    const ids = seed.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("'cierre' aparece todos los días (0..6)", () => {
    const cierre = seed.find((r) => r.id === "cierre")!;
    expect([...cierre.days].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("'lavar' (semilla) está solo en lunes (1)", () => {
    const lavar = seed.find((r) => r.id === "lavar")!;
    expect(lavar.days).toEqual([1]);
  });
});

describe("getRoutineRituals", () => {
  it("devuelve los rituales que aplican ese día con source=routine", () => {
    const seed = seedRowsFromDefault("2026-05-25");
    const lunes = new Date(2026, 4, 25); // lunes
    const out = getRoutineRituals(lunes, seed);
    expect(out.every((r) => r.source === "routine")).toBe(true);
    expect(out.some((r) => r.id === "lavar")).toBe(true);
    const domingo = new Date(2026, 4, 24);
    expect(getRoutineRituals(domingo, seed).some((r) => r.id === "lavar")).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npx vitest run src/lib/rituals.test.ts`
Expected: FAIL ("seedRowsFromDefault is not exported" / firma vieja de getRoutineRituals).

- [ ] **Step 3: Refactorizar `src/lib/rituals.ts`**

Mantener `DEFAULT_ROUTINE` y `isSabbath` como están. Añadir import y reemplazar `getRoutineRituals`:

```ts
import { Ritual, RoutineRitual } from "./types";
import { ritualAppliesOn } from "./routine-rules";
```

```ts
/** Invierte DEFAULT_ROUTINE (por día) a filas por ritual (semilla inicial). */
export function seedRowsFromDefault(todayISO: string): RoutineRitual[] {
  const map = new Map<string, RoutineRitual>();
  let order = 0;
  for (let dow = 0; dow < 7; dow++) {
    for (const r of DEFAULT_ROUTINE[dow] ?? []) {
      const existing = map.get(r.id);
      if (existing) {
        if (!existing.days.includes(dow)) existing.days.push(dow);
        continue;
      }
      map.set(r.id, {
        id: r.id, label: r.label, icon: r.icon, pillar: r.pillar, phase: r.phase,
        startMin: r.startMin, endMin: r.endMin, time: r.time,
        hard: !!r.hard, optional: !!r.optional, isTaa: !!r.isTaa,
        days: [dow], intervalWeeks: 1, anchorISO: todayISO, sortOrder: order++,
      });
    }
  }
  return [...map.values()];
}

/** Rituales que aplican en `date` desde la rutina del usuario. */
export function getRoutineRituals(date: Date, rituals: RoutineRitual[]): Ritual[] {
  return rituals
    .filter((r) => ritualAppliesOn(r, date))
    .map((r) => ({ ...r, source: "routine" as const }));
}
```

> NOTA: cambia la firma de `getRoutineRituals` (antes `(date, routine=DEFAULT_ROUTINE)`). Sus llamadores (Sentinel) se actualizan en la Task 6.

- [ ] **Step 4: Ejecutar para verificar que pasa**

Run: `npx vitest run src/lib/rituals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rituals.ts src/lib/rituals.test.ts
git commit -m "feat: semilla routine_ritual desde DEFAULT_ROUTINE + getRoutineRituals por lista"
```

---

### Task 5: Extraer helpers de servidor (`getUserId`, `fmtDate`)

**Files:**
- Create: `src/lib/server-user.ts`
- Modify: `src/app/actions/day.ts`

- [ ] **Step 1: Crear `src/lib/server-user.ts`**

```ts
import "server-only";
import { auth } from "@/auth";

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getUserId(): Promise<string> {
  const session = await auth();
  if (session?.user?.email) return session.user.email;
  if (process.env.NODE_ENV === "development") return "luciano.iturra.c@gmail.com";
  throw new Error("No autenticado");
}
```

- [ ] **Step 2: Instalar `server-only`**

Run: `npm install server-only`
Expected: añadido sin errores.

- [ ] **Step 3: Refactorizar `src/app/actions/day.ts` para usar los helpers**

Eliminar las funciones locales `fmtDate` y `getUserId` (líneas 6-19) y reemplazar por:

```ts
import { getUserId, fmtDate } from "@/lib/server-user";
```

(El resto de day.ts queda igual.)

- [ ] **Step 4: Verificar build de tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server-user.ts src/app/actions/day.ts package.json package-lock.json
git commit -m "refactor: extraer getUserId/fmtDate a server-user"
```

---

### Task 6: Server actions de rutina (`getRoutine`, `upsertRitual`, `deleteRitual`)

**Files:**
- Create: `src/app/actions/routine.ts`

- [ ] **Step 1: Crear `src/app/actions/routine.ts`**

```ts
"use server";
import { sql } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { getUserId, fmtDate } from "@/lib/server-user";
import { seedRowsFromDefault } from "@/lib/rituals";
import type { RoutineRitual } from "@/lib/types";

type Row = {
  id: string; label: string; icon: string; pillar: string; phase: string;
  start_min: number | null; end_min: number | null; time: string | null;
  hard: boolean; optional: boolean; is_taa: boolean;
  days: number[]; interval_weeks: number; anchor_iso: string; sort_order: number;
};

function rowToRitual(r: Row): RoutineRitual {
  return {
    id: r.id, label: r.label, icon: r.icon,
    pillar: r.pillar as RoutineRitual["pillar"],
    phase: r.phase as RoutineRitual["phase"],
    startMin: r.start_min ?? undefined, endMin: r.end_min ?? undefined,
    time: r.time ?? undefined,
    hard: r.hard, optional: r.optional, isTaa: r.is_taa,
    days: r.days, intervalWeeks: r.interval_weeks, anchorISO: r.anchor_iso,
    sortOrder: r.sort_order,
  };
}

async function insertRitual(userId: string, r: RoutineRitual) {
  await sql`
    INSERT INTO routine_ritual
      (user_id, id, label, icon, pillar, phase, start_min, end_min, time,
       hard, optional, is_taa, days, interval_weeks, anchor_date, sort_order, updated_at)
    VALUES
      (${userId}, ${r.id}, ${r.label}, ${r.icon}, ${r.pillar}, ${r.phase},
       ${r.startMin ?? null}, ${r.endMin ?? null}, ${r.time ?? null},
       ${r.hard}, ${r.optional}, ${r.isTaa}, ${r.days},
       ${Math.max(1, r.intervalWeeks)}, ${r.anchorISO}, ${r.sortOrder}, NOW())
    ON CONFLICT (user_id, id) DO UPDATE SET
      label=EXCLUDED.label, icon=EXCLUDED.icon, pillar=EXCLUDED.pillar, phase=EXCLUDED.phase,
      start_min=EXCLUDED.start_min, end_min=EXCLUDED.end_min, time=EXCLUDED.time,
      hard=EXCLUDED.hard, optional=EXCLUDED.optional, is_taa=EXCLUDED.is_taa,
      days=EXCLUDED.days, interval_weeks=EXCLUDED.interval_weeks,
      anchor_date=EXCLUDED.anchor_date, sort_order=EXCLUDED.sort_order, updated_at=NOW()
  `;
}

const SELECT_COLS = sql`
  id, label, icon, pillar, phase, start_min, end_min, time, hard, optional, is_taa,
  days, interval_weeks, anchor_date::text AS anchor_iso, sort_order
`;

export async function getRoutine(): Promise<RoutineRitual[]> {
  const userId = await getUserId();
  let rows = (await sql`SELECT ${SELECT_COLS} FROM routine_ritual WHERE user_id=${userId} ORDER BY sort_order`) as unknown as Row[];
  if (rows.length === 0) {
    const seed = seedRowsFromDefault(fmtDate(new Date()));
    for (const r of seed) await insertRitual(userId, r);
    rows = (await sql`SELECT ${SELECT_COLS} FROM routine_ritual WHERE user_id=${userId} ORDER BY sort_order`) as unknown as Row[];
  }
  return rows.map(rowToRitual);
}

export async function upsertRitual(r: RoutineRitual) {
  const userId = await getUserId();
  const id = r.id && r.id.trim() ? r.id : "cust-" + Math.random().toString(36).slice(2, 9);
  await insertRitual(userId, { ...r, id, intervalWeeks: Math.max(1, r.intervalWeeks) });
  revalidatePath("/");
  revalidatePath("/configuracion");
}

export async function deleteRitual(id: string) {
  const userId = await getUserId();
  await sql`DELETE FROM routine_ritual WHERE user_id=${userId} AND id=${id}`;
  revalidatePath("/");
  revalidatePath("/configuracion");
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Verificar getRoutine contra la DB (siembra)**

Con el dev server corriendo, abrir `http://localhost:3000` logueado (o en dev sin login usa el fallback). Luego:

Run:
```bash
node -e "const p=require('postgres');require('dotenv').config({path:'.env.local'});const sql=p(process.env.DATABASE_URL,{ssl:'require'});sql\`SELECT count(*) FROM routine_ritual\`.then(r=>{console.log('filas:',r[0].count);return sql.end()})"
```
Expected: tras la primera carga de la app (Task 6 cableada en Task 7/8 dispara la siembra) habrá filas. Si aún 0, se sembrará al integrar en Sentinel (Task 6 siguiente). Aceptable que sea 0 aquí.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/routine.ts
git commit -m "feat: server actions de rutina (getRoutine con semilla, upsert, delete)"
```

---

### Task 7: `Sentinel` carga la rutina async desde DB

**Files:**
- Modify: `src/components/Sentinel.tsx`

- [ ] **Step 1: Importar la action y el tipo**

Añadir junto a los imports de actions (cerca de la línea 10-17):

```ts
import { getRoutine } from "@/app/actions/routine";
import { CalendarEvent, PILLAR_COLORS, Ritual, RitualPhase, RoutineRitual } from "@/lib/types";
```
(Asegurar que `RoutineRitual` quede importado de `@/lib/types`.)

También quitar `DEFAULT_ROUTINE` del import de `@/lib/rituals` (queda sin uso tras el Step 4):
`import { getRoutineRituals, isSabbath } from "@/lib/rituals";`

- [ ] **Step 2: Añadir estado para la rutina del usuario**

Junto a los demás `useState` (cerca de la línea 43-47):

```ts
  const [routine, setRoutine] = useState<RoutineRitual[] | null>(null);
```

- [ ] **Step 3: Cargar la rutina una vez tras montar**

Añadir un `useEffect` después del efecto de "Eventos de Google Calendar":

```ts
  // ── Rutina del usuario (DB) ──
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    getRoutine()
      .then((r) => { if (!cancelled) setRoutine(r); })
      .catch((e) => { if (!cancelled) { console.error("Error cargando rutina:", e); setRoutine([]); } });
    return () => { cancelled = true; };
  }, [mounted]);
```

- [ ] **Step 4: Reemplazar el cálculo de `rituals` para usar la rutina cargada**

Reemplazar el `useMemo` de `rituals` (líneas ~50-53) por:

```ts
  const rituals: Ritual[] = useMemo(
    () => [
      ...(routine ? getRoutineRituals(today, routine) : []),
      ...getFinanceRituals(today),
    ],
    [today, routine]
  );
```

- [ ] **Step 5: Mostrar carga suave de la espina mientras `routine === null`**

En el render, donde se usa `<Spine .../>`, envolver para que si `routine === null` muestre un placeholder sutil. Cambiar la línea del `<Spine>` por:

```tsx
      {routine === null ? (
        <div className="spine"><div className="spine-title">La espina de hoy</div><div className="node" style={{ opacity: .4 }}>Cargando rutina…</div></div>
      ) : (
        <Spine
          rituals={[...rituals, ...eventsToRituals(events)]}
          checks={checks}
          min={min}
          onToggle={toggleCheck}
          showConnect={status !== "authenticated" || calReauth}
          connectLabel={calReauth ? "Reconectar calendario" : "Conectar calendario"}
          onConnect={() => signIn("google", { callbackUrl: "/" })}
        />
      )}
```

- [ ] **Step 6: Verificar tipos y build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: exit 0; build OK.

- [ ] **Step 7: Verificar en navegador (manual)**

Con `npm run dev` y logueado, abrir `/`. La espina debe mostrar los mismos rituales que antes (ahora desde DB, sembrados). Confirmar en DB que `routine_ritual` tiene filas (query del Task 6 Step 3).

- [ ] **Step 8: Commit**

```bash
git add src/components/Sentinel.tsx
git commit -m "feat: Sentinel carga la rutina del usuario desde DB (async) con semilla"
```

---

### Task 8: Ruta `/configuracion` + engranaje en topbar (shell)

**Files:**
- Create: `src/app/configuracion/page.tsx`
- Create: `src/components/config/ConfigShell.tsx`
- Modify: `src/components/Sentinel.tsx` (engranaje en topbar)
- Modify: `src/app/globals.css` (estilos `.gear`, `.config-*`)

- [ ] **Step 1: Crear `src/app/configuracion/page.tsx`**

```tsx
import ConfigShell from "@/components/config/ConfigShell";

export default function ConfiguracionPage() {
  return <ConfigShell />;
}
```

- [ ] **Step 2: Crear `src/components/config/ConfigShell.tsx` (tabs; solo "Mi rutina" activa en este plan)**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import MiRutina from "./MiRutina";

type Tab = "rutina" | "ciclo" | "mensual" | "diario";

export default function ConfigShell() {
  const [tab, setTab] = useState<Tab>("rutina");
  return (
    <div className="wrap">
      <div className="topbar">
        <Link href="/" className="back">‹ volver</Link>
        <div className="brand">Configuración</div>
      </div>
      <div className="config-tabs">
        <button className={tab === "rutina" ? "on" : ""} onClick={() => setTab("rutina")}>Mi rutina</button>
        <button className={tab === "ciclo" ? "on" : ""} onClick={() => setTab("ciclo")}>Ciclo</button>
        <button className={tab === "mensual" ? "on" : ""} onClick={() => setTab("mensual")}>Vista mensual</button>
        <button className={tab === "diario" ? "on" : ""} onClick={() => setTab("diario")}>Diario</button>
      </div>
      <div className="config-body">
        {tab === "rutina" && <MiRutina />}
        {tab !== "rutina" && <div className="config-soon">Próximamente.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Añadir el engranaje en la topbar de `Sentinel.tsx`**

Añadir `import Link from "next/link";` arriba. En el `.topbar` (línea ~165-171), después del `.clock`, añadir:

```tsx
        <Link href="/configuracion" className="gear" aria-label="Configuración">⚙</Link>
```

- [ ] **Step 4: Añadir estilos en `src/app/globals.css`**

Al final del archivo:

```css
.back{ color:var(--ink-dim); text-decoration:none; font-size:.85rem; }
.gear{ margin-left:auto; color:var(--ink-dim); text-decoration:none; font-size:1.1rem; opacity:.55; transition:opacity .15s; }
.gear:hover{ opacity:1; }
.config-tabs{ display:flex; gap:6px; flex-wrap:wrap; margin:18px 0; }
.config-tabs button{ font-size:.72rem; letter-spacing:.06em; padding:6px 12px; border-radius:999px; cursor:pointer; background:var(--panel); border:1px solid var(--panel-bd); color:var(--ink-dim); }
.config-tabs button.on{ color:var(--gold); border-color:var(--gold); }
.config-body{ margin-bottom:40px; }
.config-soon{ opacity:.4; font-size:.85rem; padding:20px 0; }
```

> NOTA: el `.gear` usa `margin-left:auto`; verificar que `.topbar` sea flex (lo es en el prototipo). Si la marca/clock ya ocupan el ancho, ajustar el contenedor para que el engranaje quede a la derecha sin romper el reloj.

- [ ] **Step 5: Verificar build + navegación (manual)**

Run: `npm run build`
Expected: exit 0; ruta `○ /configuracion` listada.
Manual: en dev, click en ⚙ → llega a `/configuracion`; tabs cambian; "‹ volver" regresa a `/`.

- [ ] **Step 6: Commit**

```bash
git add src/app/configuracion/page.tsx src/components/config/ConfigShell.tsx src/components/Sentinel.tsx src/app/globals.css
git commit -m "feat: ruta /configuracion con tabs + engranaje en topbar"
```

---

### Task 9: Componente "Mi rutina" (CRUD + periodicidad + borrar)

**Files:**
- Create: `src/components/config/MiRutina.tsx`
- Modify: `src/app/globals.css` (estilos del editor)

- [ ] **Step 1: Crear `src/components/config/MiRutina.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import type { RoutineRitual, RitualPhase, Pillar } from "@/lib/types";
import { getRoutine, upsertRitual, deleteRitual } from "@/app/actions/routine";

const DOW = ["D", "L", "M", "X", "J", "V", "S"]; // índice = getDay() (0=Dom)
const PHASES: { id: RitualPhase; label: string }[] = [
  { id: "manana", label: "Mañana" }, { id: "tarde", label: "Tarde" }, { id: "noche", label: "Noche" },
];
const PILLARS: Pillar[] = ["comunion", "salud", "finanzas", "sistema", "basalto", "cab", "pareja", "hogar"];

function emptyRitual(sortOrder: number): RoutineRitual {
  return {
    id: "", label: "", icon: "•", pillar: "sistema", phase: "manana",
    hard: false, optional: false, isTaa: false,
    days: [], intervalWeeks: 1, anchorISO: new Date().toISOString().slice(0, 10), sortOrder,
  };
}

export default function MiRutina() {
  const [rituals, setRituals] = useState<RoutineRitual[] | null>(null);
  const [draft, setDraft] = useState<RoutineRitual | null>(null);

  const reload = () => getRoutine().then(setRituals).catch((e) => { console.error(e); setRituals([]); });
  useEffect(() => { reload(); }, []);

  const save = async (r: RoutineRitual) => {
    await upsertRitual(r);
    setDraft(null);
    await reload();
  };
  const remove = async (id: string) => {
    if (!confirm("¿Borrar este ritual?")) return;
    await deleteRitual(id);
    await reload();
  };

  if (rituals === null) return <div className="config-soon">Cargando…</div>;

  return (
    <div className="rutina">
      {rituals.map((r) => (
        <RitualEditor key={r.id} value={r} onSave={save} onDelete={() => remove(r.id)} />
      ))}
      {draft ? (
        <RitualEditor value={draft} onSave={save} onDelete={() => setDraft(null)} isNew />
      ) : (
        <button className="rutina-add" onClick={() => setDraft(emptyRitual(rituals.length))}>+ nuevo ritual</button>
      )}
    </div>
  );
}

function RitualEditor({
  value, onSave, onDelete, isNew,
}: { value: RoutineRitual; onSave: (r: RoutineRitual) => void; onDelete: () => void; isNew?: boolean }) {
  const [r, setR] = useState<RoutineRitual>(value);
  const toggleDay = (d: number) =>
    setR((x) => ({ ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d].sort() }));

  return (
    <div className="rit-card">
      <div className="rit-row">
        <input className="rit-icon" value={r.icon} onChange={(e) => setR({ ...r, icon: e.target.value })} maxLength={2} />
        <input className="rit-label" placeholder="Nombre del ritual" value={r.label} onChange={(e) => setR({ ...r, label: e.target.value })} />
      </div>
      <div className="rit-row">
        <select value={r.phase} onChange={(e) => setR({ ...r, phase: e.target.value as RitualPhase })}>
          {PHASES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={r.pillar} onChange={(e) => setR({ ...r, pillar: e.target.value as Pillar })}>
          {PILLARS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className="rit-time" placeholder="hora (ej 22:00)" value={r.time ?? ""}
          onChange={(e) => setR({ ...r, time: e.target.value || undefined })} />
      </div>
      <div className="rit-days">
        {DOW.map((d, i) => (
          <button key={i} className={r.days.includes(i) ? "on" : ""} onClick={() => toggleDay(i)} type="button">{d}</button>
        ))}
      </div>
      <div className="rit-row">
        <label className="rit-interval">cada
          <input type="number" min={1} value={r.intervalWeeks}
            onChange={(e) => setR({ ...r, intervalWeeks: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
          semana(s)
        </label>
        {r.intervalWeeks > 1 && (
          <label className="rit-anchor">desde
            <input type="date" value={r.anchorISO} onChange={(e) => setR({ ...r, anchorISO: e.target.value })} />
          </label>
        )}
      </div>
      <div className="rit-actions">
        <button className="rit-save" disabled={!r.label.trim() || r.days.length === 0} onClick={() => onSave(r)}>Guardar</button>
        <button className="rit-del" onClick={onDelete}>{isNew ? "Cancelar" : "Borrar"}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Añadir estilos del editor en `src/app/globals.css`**

```css
.rutina{ display:flex; flex-direction:column; gap:12px; }
.rit-card{ border:1px solid var(--panel-bd); background:var(--panel); border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:10px; }
.rit-row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.rit-card input, .rit-card select{ background:rgba(255,255,255,.05); border:1px solid var(--panel-bd); color:var(--ink); border-radius:8px; padding:6px 8px; font-size:.85rem; }
.rit-icon{ width:42px; text-align:center; }
.rit-label{ flex:1; min-width:140px; }
.rit-time{ width:120px; }
.rit-days{ display:flex; gap:5px; }
.rit-days button{ width:30px; height:30px; border-radius:8px; border:1px solid var(--panel-bd); background:rgba(255,255,255,.04); color:var(--ink-dim); cursor:pointer; font-size:.72rem; font-weight:700; }
.rit-days button.on{ background:rgba(147,197,253,.18); color:var(--cab); border-color:rgba(147,197,253,.4); }
.rit-interval, .rit-anchor{ display:inline-flex; align-items:center; gap:6px; font-size:.78rem; color:var(--ink-dim); }
.rit-interval input{ width:54px; }
.rit-actions{ display:flex; gap:8px; justify-content:flex-end; }
.rit-save{ background:rgba(245,185,66,.15); color:var(--gold); border:1px solid rgba(245,185,66,.4); border-radius:8px; padding:6px 14px; cursor:pointer; font-weight:700; font-size:.8rem; }
.rit-save:disabled{ opacity:.4; cursor:not-allowed; }
.rit-del{ background:transparent; color:#f87171; border:1px solid rgba(248,113,113,.3); border-radius:8px; padding:6px 14px; cursor:pointer; font-size:.8rem; }
.rutina-add{ align-self:flex-start; background:transparent; color:var(--ink-dim); border:1px dashed var(--panel-bd); border-radius:10px; padding:8px 14px; cursor:pointer; font-size:.85rem; }
```

> NOTA: usa variables `--ink`, `--ink-dim`, `--panel`, `--panel-bd`, `--gold`, `--cab` ya definidas. Si `--ink` no existe, usar el color de texto base del proyecto.

- [ ] **Step 3: Verificar build + tipos**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: exit 0.

- [ ] **Step 4: Verificar end-to-end (manual, navegador)**

Con `npm run dev`, logueado:
1. Ir a ⚙ → Mi rutina: se ven los rituales sembrados.
2. En "Lavar ropa": desmarcar **L**, marcar **D** (domingo), Guardar.
3. Volver a `/`: si hoy es lunes, "Lavar ropa" ya NO aparece; si es domingo, aparece.
4. Crear un ritual nuevo (+ nuevo ritual), días = [S], guardar → aparece el sábado.
5. Borrar un ritual → desaparece de la lista y de la espina.
6. Poner "cada 2 semanas" en uno y verificar (con la fecha de hoy como ancla) que aplica esta semana y no la próxima.

- [ ] **Step 5: Commit**

```bash
git add src/components/config/MiRutina.tsx src/app/globals.css
git commit -m "feat: Mi rutina — editar periodicidad (días + cada N semanas), crear y borrar rituales"
```

---

## Self-Review (cubierto en este plan)

- **Cobertura del spec (Plan 1):** modelo `routine_ritual` (Task 3), regla días+N-semanas (Task 2), semilla (Task 4), CRUD + borrar (Task 6, 9), `/configuracion` sutil con engranaje (Task 8), refactor a rutina async (Task 7). Vista mensual, ciclo, línea espiritual/diario y DayDetail quedan para los Planes 2-5 (roadmap arriba).
- **Sin placeholders:** todo el código está completo e inline.
- **Consistencia de tipos:** `RoutineRitual` (Task 2) se usa idéntico en rules (Task 2), rituals (Task 4), actions (Task 6) y UI (Task 9). `getRoutineRituals(date, rituals)` nueva firma usada en Sentinel (Task 7).

## Notas de ejecución
- La Task 3 Step 3 toca la DB Neon (aditivo/idempotente): confirmar antes de correr.
- Los cambios previos sin commitear (conexión Calendar + orden cronológico) conviene commitearlos antes de empezar, para no mezclarlos.
