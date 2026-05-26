# Vista mensual + confirmación de guardado — Implementation Plan (Plan 2 de 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans. Pasos con checkbox (`- [ ]`).

**Goal:** Añadir la pestaña "Vista mensual" en `/configuracion` (grilla del mes, solo lectura, con los rituales que caen cada día según rutina + periodicidad) y agregar confirmación visual de guardado/borrado en "Mi rutina".

**Architecture:** Componente cliente `VistaMensual` que carga la rutina con `getRoutine()` y computa, por cada día del mes, los rituales aplicables con la función pura ya testeada `ritualAppliesOn`. Solo lectura, con navegación de mes. Polish en `MiRutina`: flash "Guardado ✓" tras mutaciones.

**Tech Stack:** Next.js 16 client components, TypeScript, CSS propio. Reusa `ritualAppliesOn` (`src/lib/routine-rules.ts`) y `getRoutine` (`src/app/actions/routine.ts`).

---

### Task 1: Confirmación visual de guardado/borrado en Mi rutina

**Files:**
- Modify: `src/components/config/MiRutina.tsx`
- Modify: `src/app/globals.css`

Contexto: hoy `MiRutina` guarda con `upsertRitual`/`deleteRitual` y recarga, pero no hay señal de éxito (feedback del usuario). Añadir un flash temporal "✓ Guardado" / "✓ Borrado".

- [ ] **Step 1: Añadir estado de flash y mostrarlo tras mutar**

En `MiRutina` (el componente contenedor, NO `RitualEditor`), añadir:
```tsx
  const [flash, setFlash] = useState<string | null>(null);
  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2200);
  };
```
En `save`, tras `await upsertRitual(r); setDraft(null); await reload();` añadir `showFlash("✓ Guardado");`.
En `remove`, tras `await deleteRitual(id); await reload();` añadir `showFlash("✓ Borrado");`.
Renderizar el flash arriba del listado (dentro del return de `MiRutina`, antes de `{rituals.map(...)}`):
```tsx
      {flash && <div className="rutina-flash">{flash}</div>}
```

- [ ] **Step 2: Estilo del flash en globals.css (append)**

```css
.rutina-flash{ position:sticky; top:8px; align-self:center; z-index:5; background:rgba(45,212,191,.15); color:var(--salud); border:1px solid rgba(45,212,191,.4); border-radius:999px; padding:5px 14px; font-size:.78rem; font-weight:700; margin-bottom:4px; text-align:center; animation:flashIn .18s ease; }
@keyframes flashIn{ from{ opacity:0; transform:translateY(-4px); } to{ opacity:1; transform:none; } }
```
(`--salud` = #2dd4bf ya existe.)

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: exit 0; build OK.
Manual: en `/configuracion` → Mi rutina, guardar un ritual → aparece "✓ Guardado" ~2s; borrar → "✓ Borrado".

- [ ] **Step 4: Commit**

```bash
git add src/components/config/MiRutina.tsx src/app/globals.css
git commit -m "feat: confirmación visual de guardado/borrado en Mi rutina"
```

---

### Task 2: Componente "Vista mensual" (grilla del mes, solo lectura)

**Files:**
- Create: `src/components/config/VistaMensual.tsx`
- Modify: `src/components/config/ConfigShell.tsx` (renderizar la pestaña)
- Modify: `src/app/globals.css` (estilos `.mensual-*`)

- [ ] **Step 1: Crear `src/components/config/VistaMensual.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import type { RoutineRitual } from "@/lib/types";
import { getRoutine } from "@/app/actions/routine";
import { ritualAppliesOn } from "@/lib/routine-rules";

const DSHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const PHASE_RANK: Record<string, number> = { manana: 0, tarde: 1, noche: 2 };

const todayKey = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
})();

export default function VistaMensual() {
  const [routine, setRoutine] = useState<RoutineRitual[] | null>(null);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  useEffect(() => {
    let cancelled = false;
    getRoutine().then((r) => { if (!cancelled) setRoutine(r); }).catch(() => { if (!cancelled) setRoutine([]); });
    return () => { cancelled = true; };
  }, []);

  const days = useMemo(() => {
    if (!routine) return [];
    const count = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: { date: Date; items: RoutineRitual[] }[] = [];
    for (let d = 1; d <= count; d++) {
      const date = new Date(cursor.y, cursor.m, d);
      const items = routine
        .filter((r) => ritualAppliesOn(r, date))
        .sort((a, b) => (PHASE_RANK[a.phase] - PHASE_RANK[b.phase]) || ((a.startMin ?? 0) - (b.startMin ?? 0)));
      out.push({ date, items });
    }
    return out;
  }, [routine, cursor]);

  const prev = () => setCursor((c) => { const m = c.m - 1; return m < 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m }; });
  const next = () => setCursor((c) => { const m = c.m + 1; return m > 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m }; });

  if (routine === null) return <div className="config-soon">Cargando…</div>;

  return (
    <div className="mensual">
      <div className="mensual-nav">
        <button onClick={prev} aria-label="Mes anterior">‹</button>
        <div className="mensual-title">{MONTHS[cursor.m]} {cursor.y}</div>
        <button onClick={next} aria-label="Mes siguiente">›</button>
      </div>
      <div className="mensual-list">
        {days.map(({ date, items }) => {
          const isToday = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` === todayKey;
          return (
            <div className={`mensual-day${isToday ? " today" : ""}`} key={date.getDate()}>
              <div className="mensual-date">
                <span className="dow">{DSHORT[date.getDay()]}</span>
                <span className="num">{date.getDate()}</span>
              </div>
              <div className="mensual-items">
                {items.length === 0 ? (
                  <span className="mensual-empty">—</span>
                ) : (
                  items.map((r) => (
                    <span className="mensual-chip" key={r.id} title={r.label}>
                      {r.icon} {r.label}{r.time ? ` · ${r.time}` : ""}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Renderizar la pestaña en `ConfigShell.tsx`**

Importar arriba: `import VistaMensual from "./VistaMensual";`
Reemplazar el bloque del body para que la pestaña "mensual" renderice el componente:
```tsx
      <div className="config-body">
        {tab === "rutina" && <MiRutina />}
        {tab === "mensual" && <VistaMensual />}
        {(tab === "ciclo" || tab === "diario") && <div className="config-soon">Próximamente.</div>}
      </div>
```

- [ ] **Step 3: Estilos en globals.css (append)**

```css
.mensual-nav{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
.mensual-nav button{ background:var(--panel); border:1px solid var(--panel-bd); color:var(--ink-dim); border-radius:8px; width:34px; height:30px; cursor:pointer; font-size:1rem; }
.mensual-title{ font-size:.9rem; letter-spacing:.04em; color:var(--ink); text-transform:capitalize; }
.mensual-list{ display:flex; flex-direction:column; }
.mensual-day{ display:flex; gap:12px; padding:8px 0; border-top:1px solid var(--line); align-items:flex-start; }
.mensual-day.today{ background:rgba(245,185,66,.06); border-radius:8px; padding:8px; margin:0 -8px; }
.mensual-date{ width:46px; flex-shrink:0; text-align:center; }
.mensual-date .dow{ display:block; font-size:.62rem; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-faint); }
.mensual-date .num{ font-family:ui-monospace,Menlo,monospace; font-size:1.05rem; color:var(--ink-dim); }
.mensual-day.today .num{ color:var(--gold); }
.mensual-items{ display:flex; flex-wrap:wrap; gap:6px; padding-top:2px; }
.mensual-chip{ font-size:.72rem; color:var(--ink-dim); background:rgba(255,255,255,.04); border:1px solid var(--panel-bd); border-radius:8px; padding:2px 8px; white-space:nowrap; }
.mensual-empty{ color:var(--ink-faint); font-size:.8rem; }
```
(`--ink-faint` = #5b6a9a ya existe.)

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build && npx vitest run`
Expected: tsc 0; build OK; tests 9/9.
Manual: `/configuracion` → "Vista mensual": lista del mes; cada día muestra sus rituales (chips con icono+nombre+hora); hoy resaltado; ‹ › cambian de mes; los rituales "cada N semanas" aparecen solo en las semanas correctas.

- [ ] **Step 5: Commit**

```bash
git add src/components/config/VistaMensual.tsx src/components/config/ConfigShell.tsx src/app/globals.css
git commit -m "feat: vista mensual (solo lectura) con los rituales de cada día"
```

---

## Self-Review
- **Cobertura del spec:** "Vista mensual — grilla del mes (solo lectura) con los rituales que caen cada día" (Task 2). Confirmación visual de guardado = feedback del usuario aplicado (Task 1). Reusa `ritualAppliesOn` (ya testeada) y `getRoutine`.
- **Sin placeholders:** código completo inline.
- **Consistencia:** usa `RoutineRitual`, `ritualAppliesOn`, `getRoutine` con las firmas actuales; variables CSS existentes (`--ink`, `--ink-dim`, `--ink-faint`, `--gold`, `--salud`, `--panel`, `--panel-bd`, `--line`).

## Notas
- Trabajar en rama `feat/vista-mensual` (no `main`, que auto-deploya).
- No hay lógica pura nueva (la regla de periodicidad ya está testeada), así que la verificación de Vista mensual es manual en navegador.
