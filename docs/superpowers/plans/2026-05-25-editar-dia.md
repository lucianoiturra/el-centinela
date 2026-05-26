# Editar día pasado (DayDetail) — Implementation Plan (Plan 5 de 5)

> **For agentic workers:** subagent-driven-development o executing-plans. Pasos con checkbox.

**Goal:** Tocar un día (pasado o hoy) en la cadena del mes abre un overlay editable con los rituales de esa fecha (checks), la TAA, "TAA cumplida" y la línea espiritual; todo persiste con las actions existentes (que ya aceptan fecha) y muestra confirmación visual. Cierra el pedido "poder editar el día anterior".

**Architecture:** Nuevo componente `DayDetail` (overlay estilo `.gate`). `Sentinel` mantiene `detailDate`; `Chain` recibe `onPick(date)` y hace clickeables los días no futuros. Al cerrar, `Sentinel` refresca el estado del día/cadena. Días pasados muestran rutina + finanzas (sin Calendar), usando la configuración de rutina vigente.

**Tech Stack:** Next.js 16 client, TS. Reusa `getDayState/getDayChecks/setTaskCheck/saveTaa/markTaaDone/saveLineaEspiritual` (`day.ts`), `getRoutineRituals` (`rituals.ts`), `getFinanceRituals` (`finance.ts`).

---

### Task 1: Componente DayDetail

**Files:** Create `src/components/DayDetail.tsx`; Modify `src/app/globals.css`

- [ ] **Step 1: Crear `src/components/DayDetail.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import type { RoutineRitual } from "@/lib/types";
import { getRoutineRituals } from "@/lib/rituals";
import { getFinanceRituals } from "@/lib/finance";
import {
  getDayState, getDayChecks, setTaskCheck, saveTaa, markTaaDone, saveLineaEspiritual,
} from "@/app/actions/day";

const DFULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const PHASE_RANK: Record<string, number> = { manana: 0, tarde: 1, noche: 2 };

export default function DayDetail({ date, routine, onClose }: { date: Date; routine: RoutineRitual[]; onClose: () => void }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [taa, setTaa] = useState("");
  const [taaDone, setTaaDone] = useState(false);
  const [linea, setLinea] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const showFlash = () => { setFlash("✓ guardado"); setTimeout(() => setFlash(null), 1600); };

  const rituals = useMemo(
    () => [...getRoutineRituals(date, routine), ...getFinanceRituals(date)]
      .sort((a, b) => (PHASE_RANK[a.phase] - PHASE_RANK[b.phase]) || ((a.startMin ?? 0) - (b.startMin ?? 0))),
    [date, routine]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDayState(date), getDayChecks(date)])
      .then(([s, c]) => {
        if (cancelled) return;
        setTaa(s.taa ?? ""); setTaaDone(s.taa_done); setLinea(s.linea ?? ""); setChecks(c); setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [date]);

  const toggle = (id: string) => {
    const next = !checks[id];
    setChecks((c) => ({ ...c, [id]: next }));
    setTaskCheck(date, id, next).then(showFlash).catch(console.error);
  };
  const toggleDone = () => {
    const next = !taaDone;
    setTaaDone(next);
    markTaaDone(date, next).then(showFlash).catch(console.error);
  };
  const saveTaaText = () => { saveTaa(date, taa.trim()).then(showFlash).catch(console.error); };
  const saveLineaText = () => { saveLineaEspiritual(date, linea.trim()).then(showFlash).catch(console.error); };

  return (
    <div className="gate" onClick={onClose}>
      <div className="gate-card daydetail" onClick={(e) => e.stopPropagation()}>
        <div className="dd-head">
          <div className="dd-title">{DFULL[date.getDay()]} {date.getDate()} {MONTHS[date.getMonth()]}</div>
          <button className="dd-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {flash && <div className="rutina-flash">{flash}</div>}
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

            <label className="dd-label">Línea espiritual</label>
            <textarea className="dd-input" rows={2} value={linea} placeholder="Tu línea de ese día…"
              onChange={(e) => setLinea(e.target.value)} onBlur={saveLineaText} />
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: CSS (append a globals.css)**

```css
.daydetail{ text-align:left; max-width:440px; width:100%; max-height:85vh; overflow-y:auto; }
.dd-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.dd-title{ font-family:Georgia,serif; font-size:1.2rem; color:var(--ink); text-transform:capitalize; }
.dd-close{ background:none; border:none; color:var(--ink-dim); font-size:1.1rem; cursor:pointer; }
.dd-label{ display:block; font-size:.66rem; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-dim); margin:14px 0 5px; }
.dd-input{ width:100%; background:rgba(255,255,255,.05); border:1px solid var(--panel-bd); color:var(--ink); border-radius:10px; padding:8px 10px; font-size:.9rem; font-family:inherit; resize:vertical; }
.dd-done{ margin-top:10px; display:inline-flex; align-items:center; gap:8px; border:1px solid var(--panel-bd); background:rgba(255,255,255,.04); color:var(--ink); border-radius:10px; padding:8px 14px; cursor:pointer; font-size:.85rem; }
.dd-done.on{ border-color:var(--gold); background:rgba(245,185,66,.14); color:var(--gold); }
.dd-rituals{ display:flex; flex-direction:column; gap:2px; }
.dd-node{ display:flex; align-items:center; gap:10px; padding:7px 4px; cursor:pointer; border-radius:8px; font-size:.9rem; }
.dd-node:hover{ background:rgba(255,255,255,.03); }
.dd-node.done{ color:var(--ink-dim); text-decoration:line-through; }
.dd-box{ width:18px; height:18px; flex-shrink:0; border-radius:5px; border:2px solid var(--ink-dim); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; }
.dd-node.done .dd-box{ background:var(--salud); border-color:var(--salud); color:#03241f; }
```

---

### Task 2: Hacer clickeable la cadena y montar el overlay (Sentinel)

**Files:** Modify `src/components/Sentinel.tsx`

- [ ] **Step 1: Importar DayDetail** — `import DayDetail from "@/components/DayDetail";`

- [ ] **Step 2: Estado** — añadir:
```ts
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
```

- [ ] **Step 3: Refrescar al cerrar** — añadir `reloadKey` a las deps del efecto "Cargar estado del día desde DB" (cambiar `}, [mounted, ds]);` por `}, [mounted, ds, reloadKey]);`).

- [ ] **Step 4: Pasar onPick a Chain** — cambiar `<Chain today={today} chainData={chainData} cycleInfo={cycleInfo} />` por:
```tsx
      <Chain today={today} chainData={chainData} cycleInfo={cycleInfo} onPick={setDetailDate} />
```

- [ ] **Step 5: Render del overlay** — antes del cierre del `<div className="wrap">` (junto al `{gateOpen && ...}`), añadir:
```tsx
      {detailDate && (
        <DayDetail
          date={detailDate}
          routine={routine ?? []}
          onClose={() => { setDetailDate(null); setReloadKey((k) => k + 1); }}
        />
      )}
```

- [ ] **Step 6: Chain acepta onPick y hace clickeables los días no futuros** — en la firma de `Chain` añadir `onPick: (date: Date) => void`. En el `.cdot`, para celdas con `status !== "future"`, añadir `onClick` que construya la fecha y llame `onPick`. Cambiar el render de cada celda:
```tsx
        {cells.map((c) => (
          <div
            className={`cdot ${c.status}${c.status !== "future" ? " editable" : ""}`}
            key={c.d}
            title={`${c.d} ${MONTHS[month]}`}
            onClick={c.status !== "future" ? () => onPick(new Date(year, month, c.d)) : undefined}
          >
            <span className="num">{c.d}</span>
            {label(c.status)}
            {c.cyc && <span className="cycle-strip" style={{ background: c.cyc }} />}
          </div>
        ))}
```

- [ ] **Step 7: CSS** (append) — cursor para celdas editables:
```css
.cdot.editable{ cursor:pointer; }
.cdot.editable:hover{ outline:1px solid var(--panel-bd); }
```

- [ ] **Step 8: Verificar** — `npx tsc --noEmit && npm run build && npx vitest run` → 0 / OK / 9/9.

- [ ] **Step 9: Commit**
```bash
git add src/components/DayDetail.tsx src/components/Sentinel.tsx src/app/globals.css
git commit -m "feat: editar cualquier día desde la cadena (checks + TAA + línea espiritual)"
```

---

## Verificación (manual)
1. En `/`, tocar un día pasado en la cadena → abre el overlay con la fecha, los rituales de ese día, TAA y línea.
2. Marcar un ritual → "✓ guardado"; editar TAA / "TAA cumplida" / línea → "✓ guardado".
3. Cerrar (✕ o fuera) → la cadena/estado de hoy se refrescan (si editaste "TAA cumplida" de un día, su punto de la cadena cambia a ganado/perdido).
4. Reabrir el mismo día → los cambios persisten.
5. Los días futuros no son clickeables.

## Notas
- Rama `feat/editar-dia`. No `main`.
- Días pasados usan la rutina/finanzas vigentes (no se versiona la rutina) y no traen Calendar (igual que el spine de hoy salvo Calendar) — simplificación aceptada en el spec.
