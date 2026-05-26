# Línea espiritual + Diario — Implementation Plan (Plan 4 de 5)

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development o executing-plans. Pasos con checkbox.

**Goal:** Poder anotar la "1 línea espiritual" del cierre directamente en la app (campo en el nodo del cierre de hoy, con confirmación visual) y releer todas las líneas por fecha en una pestaña "Diario" en `/configuracion`.

**Architecture:** La columna `day_state.linea_espiritual` ya existe. Nuevas server actions en `day.ts` (`saveLineaEspiritual`, `getDiario`, y `linea` en `getDayState`). `Sentinel` carga la línea del día y renderiza un campo (`CierreLinea`) tras el nodo `cierre`. Componente `Diario` lista las entradas.

**Tech Stack:** Next.js 16 client/server, TS, `postgres`.

---

### Task 1: Server actions (línea espiritual + diario)

**Files:** Modify `src/app/actions/day.ts`

- `getDayState`: añadir `linea_espiritual` al SELECT y devolver `linea`.
- `saveLineaEspiritual(date, text)`: upsert en `day_state.linea_espiritual` (ON CONFLICT user_id,date).
- `getDiario()`: SELECT de fechas con línea no vacía, DESC.

Código (ver Step):

- [ ] **Step 1: Editar getDayState para incluir la línea**

Reemplazar el cuerpo de `getDayState`:
```ts
export async function getDayState(date: Date) {
  const userId = await getUserId();
  const d = fmtDate(date);
  const rows = await sql`
    SELECT taa, taa_done, linea_espiritual FROM day_state
    WHERE user_id = ${userId} AND date = ${d}
    LIMIT 1
  `;
  const row = rows[0];
  return {
    taa: (row?.taa as string | undefined) ?? null,
    taa_done: (row?.taa_done as boolean | undefined) ?? false,
    linea: (row?.linea_espiritual as string | undefined) ?? "",
  };
}
```

- [ ] **Step 2: Añadir saveLineaEspiritual y getDiario** (al final de la sección de day_state, antes de TASK CHECKS o donde calce):
```ts
export async function saveLineaEspiritual(date: Date, text: string) {
  const userId = await getUserId();
  const d = fmtDate(date);
  await sql`
    INSERT INTO day_state (user_id, date, linea_espiritual, updated_at)
    VALUES (${userId}, ${d}, ${text}, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET linea_espiritual = EXCLUDED.linea_espiritual, updated_at = NOW()
  `;
  revalidatePath("/");
}

export async function getDiario() {
  const userId = await getUserId();
  const rows = await sql`
    SELECT date::text as date, linea_espiritual FROM day_state
    WHERE user_id = ${userId} AND linea_espiritual IS NOT NULL AND linea_espiritual <> ''
    ORDER BY date DESC
  `;
  return rows.map((r) => ({ date: r.date as string, linea: r.linea_espiritual as string }));
}
```

- [ ] **Step 3:** `npx tsc --noEmit` → 0. Commit: `feat: actions de línea espiritual (guardar, getDayState, diario)`.

---

### Task 2: Campo de línea espiritual en el cierre (Sentinel)

**Files:** Modify `src/components/Sentinel.tsx`, `src/app/globals.css`

- [ ] **Step 1: Importar la action** — añadir `saveLineaEspiritual as saveLineaAction` al import de `@/app/actions/day`.

- [ ] **Step 2: Estado + carga** — añadir `const [linea, setLinea] = useState("");`. En el efecto de "Cargar estado del día desde DB", en el `.then`, añadir `setLinea(dayState.linea ?? "");` (y en el fallback del catch, dejar "" o lsGet si aplica — usar `setLinea("")`).

- [ ] **Step 3: Callback de guardado**:
```ts
  const saveLinea = useCallback((text: string) => {
    setLinea(text);
    saveLineaAction(today, text).catch(console.error);
  }, [today]);
```

- [ ] **Step 4: Pasar a Spine** — añadir props `lineaValue={linea}` y `onLineaSave={saveLinea}` al `<Spine .../>` (en la rama `routine !== null`).

- [ ] **Step 5: Spine acepta y renderiza** — ampliar la firma de `Spine` con `lineaValue: string; onLineaSave: (t: string) => void;`. En el `.map` de items, tras renderizar el nodo, si `r.id === "cierre"` renderizar `<CierreLinea value={lineaValue} onSave={onLineaSave} />` (dentro del mismo bloque del nodo). Añadir el subcomponente:
```tsx
function CierreLinea({ value, onSave }: { value: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setText(value); }, [value]);
  const save = () => {
    if (text.trim() === value.trim()) return;
    onSave(text.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div className="linea" onClick={(e) => e.stopPropagation()}>
      <textarea className="linea-input" rows={2} placeholder="Tu línea espiritual de hoy…"
        value={text} onChange={(e) => setText(e.target.value)} onBlur={save} />
      {saved && <span className="linea-saved">✓ guardado</span>}
    </div>
  );
}
```
(Importar `useEffect` ya está; `useState` ya está.)

- [ ] **Step 6: CSS** (append a globals.css):
```css
.linea{ margin:6px 0 4px 0; display:flex; flex-direction:column; gap:4px; }
.linea-input{ width:100%; background:rgba(255,255,255,.05); border:1px solid var(--panel-bd); color:var(--ink); border-radius:10px; padding:8px 10px; font-size:.88rem; font-family:Georgia,serif; resize:vertical; }
.linea-input::placeholder{ color:var(--ink-faint); font-style:italic; }
.linea-saved{ font-size:.7rem; color:var(--salud); font-weight:700; }
```

- [ ] **Step 7:** `npx tsc --noEmit && npm run build` → OK. Commit: `feat: campo de línea espiritual en el cierre (hoy) con confirmación`.

---

### Task 3: Pestaña "Diario"

**Files:** Create `src/components/config/Diario.tsx`; Modify `src/components/config/ConfigShell.tsx`, `src/app/globals.css`

- [ ] **Step 1: Crear `src/components/config/Diario.tsx`**:
```tsx
"use client";
import { useEffect, useState } from "react";
import { getDiario } from "@/app/actions/day";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmt(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export default function Diario() {
  const [entries, setEntries] = useState<{ date: string; linea: string }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDiario().then((e) => { if (!cancelled) setEntries(e); }).catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, []);
  if (entries === null) return <div className="config-soon">Cargando…</div>;
  if (entries.length === 0) return <div className="config-soon">Aún no has escrito líneas espirituales.</div>;
  return (
    <div className="diario">
      {entries.map((e) => (
        <div className="diario-entry" key={e.date}>
          <div className="diario-date">{fmt(e.date)}</div>
          <div className="diario-linea">{e.linea}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: ConfigShell** — `import Diario from "./Diario";` y reemplazar `{tab === "diario" && <div className="config-soon">Próximamente.</div>}` por `{tab === "diario" && <Diario />}`.

- [ ] **Step 3: CSS** (append):
```css
.diario{ display:flex; flex-direction:column; gap:14px; }
.diario-entry{ border-left:2px solid var(--panel-bd); padding-left:12px; }
.diario-date{ font-size:.68rem; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-faint); }
.diario-linea{ font-family:Georgia,serif; font-size:1.02rem; color:var(--ink); line-height:1.4; margin-top:3px; }
```

- [ ] **Step 4:** `npx tsc --noEmit && npm run build && npx vitest run` → OK / 9/9. Commit: `feat: pestaña Diario para releer las líneas espirituales`.

---

## Verificación (manual)
1. En `/` (de noche o en cualquier momento), bajo el nodo "Cierre nocturno" hay un campo; escribir una línea y salir del campo → "✓ guardado".
2. Recargar `/` → la línea persiste.
3. `/configuracion` → Diario → aparece la línea con su fecha; escribir otra otro día y ver el orden DESC.

## Notas
- Rama `feat/linea-espiritual`. No `main`.
- El campo se ancla al nodo con `id === "cierre"` (el ritual semilla). Si el usuario borró ese ritual, el campo no aparece (caso borde aceptable; el Diario y la action siguen disponibles).
- DayDetail (línea en días pasados) es el Plan 5.
