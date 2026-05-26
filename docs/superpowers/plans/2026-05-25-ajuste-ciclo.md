# Ajuste del ciclo de Michelle — Implementation Plan (Plan 3 de 5)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Pasos con checkbox.

**Goal:** Cablear el ciclo real (desde `cycle_log`) en el hero/`Sentinel` y añadir la pestaña "Ciclo" en `/configuracion` para corregir el inicio del período + duración (con botón "empezó hoy") y ver la fase recalculada, con confirmación visual al guardar.

**Architecture:** Las server actions `getLatestCycleStart()` y `saveCycleStart(date, length)` ya existen en `src/app/actions/day.ts`. La función pura `getCyclePhase(date, lastPeriodStart, length)` ya acepta parámetros. Este plan: (1) `Sentinel` carga el último inicio de ciclo y lo pasa a `getCyclePhase`; (2) nuevo componente `CicloConfig` para editar y previsualizar.

**Tech Stack:** Next.js 16 client components, TS. Reusa actions de `day.ts` y `getCyclePhase` (`src/lib/cycle.ts`).

---

### Task 1: Cablear el ciclo real en Sentinel

**Files:** Modify `src/components/Sentinel.tsx`

Contexto: hoy `const cycle = useMemo(() => getCyclePhase(today), [today]);` usa la fecha hardcodeada por defecto (`DEFAULT_LAST_PERIOD`). Hay que usar el último registro de `cycle_log`.

- [ ] **Step 1: Importar la action**

Añadir `getLatestCycleStart` al import existente desde `@/app/actions/day`:
```ts
import {
  getDayState,
  getDayChecks,
  getMonthChain,
  getLatestCycleStart,
  saveTaa as saveTaaAction,
  markTaaDone as markTaaDoneAction,
  setTaskCheck as setTaskCheckAction,
} from "@/app/actions/day";
```

- [ ] **Step 2: Estado para el ciclo**

Junto a los otros `useState` (cerca de `routine`):
```ts
  const [cycleInfo, setCycleInfo] = useState<{ date: string; length: number } | null>(null);
```

- [ ] **Step 3: Cargar el último inicio de ciclo (efecto)**

Añadir tras el efecto de "Rutina del usuario":
```ts
  // ── Ciclo de Michelle (DB) ──
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    getLatestCycleStart()
      .then((info) => { if (!cancelled) setCycleInfo(info); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mounted]);
```

- [ ] **Step 4: Usar el ciclo real en el cálculo de la fase**

Reemplazar `const cycle = useMemo(() => getCyclePhase(today), [today]);` por:
```ts
  const cycle = useMemo(
    () =>
      cycleInfo
        ? getCyclePhase(today, new Date(cycleInfo.date + "T00:00:00"), cycleInfo.length)
        : getCyclePhase(today),
    [today, cycleInfo]
  );
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build && npx vitest run`
Expected: tsc 0; build OK; tests 9/9.

- [ ] **Step 6: Commit**
```bash
git add src/components/Sentinel.tsx
git commit -m "feat: Sentinel usa el inicio de ciclo real (cycle_log) para calcular la fase"
```

---

### Task 2: Pestaña "Ciclo" en configuración

**Files:** Create `src/components/config/CicloConfig.tsx`; Modify `src/components/config/ConfigShell.tsx`, `src/app/globals.css`

- [ ] **Step 1: Crear `src/components/config/CicloConfig.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { getLatestCycleStart, saveCycleStart } from "@/app/actions/day";
import { getCyclePhase } from "@/lib/cycle";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function CicloConfig() {
  const [startISO, setStartISO] = useState("");
  const [length, setLength] = useState(28);
  const [loaded, setLoaded] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLatestCycleStart()
      .then((info) => {
        if (cancelled) return;
        if (info) { setStartISO(info.date); setLength(info.length); }
        else { setStartISO(todayISO()); }
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) { setStartISO(todayISO()); setLoaded(true); } });
    return () => { cancelled = true; };
  }, []);

  const phase = useMemo(
    () => (startISO ? getCyclePhase(new Date(), new Date(startISO + "T00:00:00"), length) : null),
    [startISO, length]
  );

  const save = async () => {
    if (!startISO) return;
    await saveCycleStart(new Date(startISO + "T00:00:00"), length);
    setFlash("✓ Guardado");
    setTimeout(() => setFlash(null), 2200);
  };

  if (!loaded) return <div className="config-soon">Cargando…</div>;

  return (
    <div className="ciclo">
      {flash && <div className="rutina-flash">{flash}</div>}
      <div className="ciclo-field">
        <label>Inicio del último período</label>
        <div className="ciclo-row">
          <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
          <button className="ciclo-today" onClick={() => setStartISO(todayISO())}>empezó hoy</button>
        </div>
      </div>
      <div className="ciclo-field">
        <label>Duración del ciclo (días)</label>
        <input type="number" min={20} max={45} value={length}
          onChange={(e) => setLength(Math.min(45, Math.max(20, parseInt(e.target.value || "28", 10))))} />
      </div>
      {phase && (
        <div className="ciclo-preview" style={{ borderColor: phase.color }}>
          <span className="ciclo-ph" style={{ color: phase.color }}>{phase.icon} {phase.name}</span>
          <span className="ciclo-day">día {phase.dayInCycle} del ciclo</span>
          <p className="ciclo-desc">{phase.desc}</p>
        </div>
      )}
      <button className="rit-save" onClick={save}>Guardar</button>
    </div>
  );
}
```

- [ ] **Step 2: Renderizar la pestaña en `ConfigShell.tsx`**

Importar: `import CicloConfig from "./CicloConfig";`
Actualizar el body:
```tsx
      <div className="config-body">
        {tab === "rutina" && <MiRutina />}
        {tab === "mensual" && <VistaMensual />}
        {tab === "ciclo" && <CicloConfig />}
        {tab === "diario" && <div className="config-soon">Próximamente.</div>}
      </div>
```

- [ ] **Step 3: Estilos en globals.css (append)**

```css
.ciclo{ display:flex; flex-direction:column; gap:16px; max-width:360px; }
.ciclo-field{ display:flex; flex-direction:column; gap:6px; }
.ciclo-field label{ font-size:.72rem; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-dim); }
.ciclo-field input{ background:rgba(255,255,255,.05); border:1px solid var(--panel-bd); color:var(--ink); border-radius:8px; padding:8px 10px; font-size:.9rem; }
.ciclo-row{ display:flex; gap:8px; align-items:center; }
.ciclo-row input{ flex:1; }
.ciclo-today{ background:rgba(147,197,253,.12); color:var(--cab); border:1px solid rgba(147,197,253,.3); border-radius:8px; padding:8px 12px; cursor:pointer; font-size:.78rem; white-space:nowrap; }
.ciclo-preview{ border:1px solid var(--panel-bd); border-left-width:3px; background:var(--panel); border-radius:10px; padding:12px 14px; }
.ciclo-ph{ font-weight:700; font-size:.95rem; }
.ciclo-day{ display:block; font-size:.78rem; color:var(--ink-dim); margin-top:2px; }
.ciclo-desc{ font-size:.82rem; color:var(--ink-dim); margin-top:8px; line-height:1.45; }
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build && npx vitest run`
Expected: tsc 0; build OK; tests 9/9.
Manual: `/configuracion` → "Ciclo": muestra inicio y duración actuales (o hoy si no hay registro); cambiar la fecha o "empezó hoy" actualiza la previsualización de fase; Guardar muestra "✓ Guardado"; al volver a `/`, el chip de ciclo del hero refleja el nuevo cálculo.

- [ ] **Step 5: Commit**
```bash
git add src/components/config/CicloConfig.tsx src/components/config/ConfigShell.tsx src/app/globals.css
git commit -m "feat: pestaña Ciclo — corregir inicio del período + duración con previsualización"
```

---

## Self-Review
- **Cobertura del spec:** "Ciclo = corregir inicio del período + duración; recalcula fases; botón 'empezó hoy'; el chip de ciclo del hero usa el valor real" → Task 1 (cableado en hero) + Task 2 (UI). Confirmación visual aplicada (memoria de feedback).
- **Sin placeholders:** código completo inline.
- **Consistencia:** `getLatestCycleStart()` retorna `{date,length}|null`; `getCyclePhase(date, Date, length)` firma existente; `saveCycleStart(Date, number)` existente; vars CSS existentes (`--ink`, `--ink-dim`, `--cab`, `--panel`, `--panel-bd`) + `.rutina-flash` (del Plan 2).

## Notas
- Rama `feat/ajuste-ciclo` (no `main`).
- Sin lógica pura nueva (getCyclePhase ya existe); verificación de la UI es manual en navegador.
- Fechas: se construye `new Date(iso + "T00:00:00")` (medianoche local); en zona horaria de Chile/Argentina (UTC-3/-4) `fmtDate` mantiene el mismo día.
