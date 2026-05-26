# El Centinela — Configuración editable y edición de días — Diseño

> Spec de diseño. Fecha: 2026-05-25. Estado: en revisión.
> Continuación del diseño base (`2026-05-24-el-centinela-design.md`), que ya preveía
> "Mi rutina" editable, `MonthChain` con detalle de día, y recálculo del ciclo.

## Contexto

La app ya está desplegada y funcionando (login Google + Calendar tejido en la espina). Luciano
necesita ahora cerrar la promesa del diseño original: que el sistema sea **configurable y
corregible sin tocar código**. Cuatro necesidades concretas:

1. **Editar un día pasado** — si se quedó dormido y no marcó sus checks/TAA, poder corregirlo.
2. **Configurar la periodicidad de los rituales** — hoy la rutina está hardcodeada en
   `DEFAULT_ROUTINE` por día de semana. Ejemplo: "lavar ropa" aparece los lunes y la quiere los
   domingos. Incluye **borrar** rituales que ya no sirven y una **vista mensual panorámica**.
3. **Ajustar el ciclo de Michelle** — por si las fases se corren respecto a la realidad.
4. **Anotar la "1 línea espiritual"** del cierre nocturno directo en la app, y poder releerla.

## Decisiones tomadas (brainstorming 2026-05-25)

- **Periodicidad:** por **día de semana + "cada N semanas"** (con fecha de anclaje). No se
  necesitan recurrencias arbitrarias tipo RRULE (YAGNI).
- **Editar día pasado:** tocando el día en la **cadena del mes** que ya existe → abre detalle
  editable. Sirve para ayer y cualquier día.
- **Apartado de configuración:** **ruta separada `/configuracion`**, accesible por un engranaje
  **sutil** en la topbar. No compite con la vista diaria.
- **Vista mensual:** **grilla del mes (solo lectura)** con los rituales que caen cada día.
- **Línea espiritual:** **campo por día** (en el nodo del cierre) **+ vista "Diario"** para releer
  todas las líneas por fecha.
- **Ciclo:** **corregir inicio del período + duración** (con botón "empezó hoy"); recalcula fases.
- **Modelo de datos de la rutina:** **tabla por ritual** (`routine_ritual`), no JSONB.

## No-objetivos

- No recurrencias arbitrarias (cada X días, fechas puntuales, RRULE).
- No ajustar los rangos internos de cada fase del ciclo (corregir el inicio basta).
- No traer Calendar de días pasados (solo hoy, en vivo, como ahora).
- No multiusuario (sigue siendo solo Luciano).

## Modelo de datos (Postgres / Neon)

### Nueva tabla `routine_ritual` (reemplaza `routine_config`, hoy sin datos ni uso)
```sql
CREATE TABLE IF NOT EXISTS routine_ritual (
  user_id        TEXT       NOT NULL,
  id             TEXT       NOT NULL,          -- estable; ids semilla (higiene, bici…) o cust-<rand>
  label          TEXT       NOT NULL,
  icon           TEXT       NOT NULL,
  pillar         TEXT       NOT NULL,          -- Pillar de types.ts
  phase          TEXT       NOT NULL,          -- 'manana' | 'tarde' | 'noche'
  start_min      SMALLINT,                     -- minutos desde medianoche (opcional)
  end_min        SMALLINT,
  time           TEXT,                         -- etiqueta visible (ej. "22:00")
  hard           BOOLEAN    NOT NULL DEFAULT FALSE,
  optional       BOOLEAN    NOT NULL DEFAULT FALSE,
  is_taa         BOOLEAN    NOT NULL DEFAULT FALSE,
  days           SMALLINT[] NOT NULL,          -- {0=Dom .. 6=Sáb}
  interval_weeks SMALLINT   NOT NULL DEFAULT 1,-- "cada N semanas"
  anchor_date    DATE       NOT NULL DEFAULT CURRENT_DATE,
  sort_order     SMALLINT   NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
-- routine_config queda obsoleta; se puede DROP TABLE IF EXISTS routine_config;
```

### `day_state` — nueva columna
```sql
ALTER TABLE day_state ADD COLUMN IF NOT EXISTS linea_espiritual TEXT;
```

### `cycle_log` — sin cambios (ya existe). Solo se cablea su lectura.

## Reglas (funciones puras, `lib/rituals.ts`)

**`ritualAppliesOn(ritual, date): boolean`**
```
días:   ritual.days.includes(date.getDay())
semana: (weekIndex(date) - weekIndex(ritual.anchor_date)) % ritual.interval_weeks === 0
aplica = días && semana
```
- `weekIndex(d)` = número de semanas (lunes como inicio) desde una época fija:
  `floor((startOfWeekMon(d) - EPOCH) / (7*86400000))`. Robusto sin importar el día de semana.
- `interval_weeks === 1` ⇒ la condición de semana siempre es verdadera (rutina semanal normal).

**`getRoutineRituals(date, rituals)`** pasa a recibir la lista de rituales del usuario (ya cargada)
y devuelve los que cumplen `ritualAppliesOn`. `DEFAULT_ROUTINE` deja de consumirse en runtime y
queda **solo como semilla**.

**Semilla (`seedRoutineFromDefault`)**: al primer `getRoutine()` sin filas, invierte el mapa
`DEFAULT_ROUTINE` (por día de semana) a filas por ritual: agrupa por `id`, `days` = días en que
aparece, `interval_weeks = 1`, `anchor_date = hoy`, conservando label/icon/pillar/phase/start_min/
end_min/time/hard/optional/is_taa y un `sort_order` incremental. Idempotente (solo si vacío).

## Server actions

### `app/actions/routine.ts` (nuevo)
- `getRoutine(): RoutineRitual[]` — lee filas del usuario; si no hay, siembra desde `DEFAULT_ROUTINE`
  y devuelve. (No filtra por fecha; el filtrado por periodicidad es puro en cliente.)
- `upsertRitual(ritual: RoutineRitual)` — INSERT … ON CONFLICT (user_id,id) DO UPDATE. Genera `id`
  para nuevos (`cust-<rand>`). `revalidatePath('/')` y `/configuracion`.
- `deleteRitual(id: string)` — DELETE. No toca `task_check` histórico.

### `app/actions/day.ts` (añadir)
- `saveLineaEspiritual(date, text)` — upsert en `day_state.linea_espiritual`.
- `getDayState` — incluir `linea_espiritual` en el retorno.
- `getDiario()` — `SELECT date, linea_espiritual FROM day_state WHERE linea_espiritual IS NOT NULL AND linea_espiritual <> '' ORDER BY date DESC`.

### `app/actions/cycle.ts` (nuevo o extiende day.ts)
- `getCycleInfo(): { startISO, length } | null` — envuelve `getLatestCycleStart()`.
- `saveCycleStart(date, length)` — ya existe en day.ts; reusar.

## UI / componentes

- **Topbar (`Sentinel`)**: añadir engranaje ⚙ discreto que enlaza a `/configuracion`.
- **`app/configuracion/page.tsx`**: layout con pestañas: **Mi rutina | Ciclo | Vista mensual | Diario**
  y "‹ volver". Componentes:
  - **`MiRutina`** — lista de rituales; edición en sitio (label, icono, pilar, fase, hora/start_min,
    toggles L–D, `interval_weeks`, `anchor_date`); borrar (con confirmación); "+ nuevo ritual".
  - **`CicloConfig`** — input fecha inicio del período + duración + botón "empezó hoy"; muestra la
    fase calculada de hoy.
  - **`VistaMensual`** — grilla del mes (con ‹ › para cambiar de mes); cada celda lista íconos+labels
    de los rituales que aplican ese día (vía `ritualAppliesOn`). Solo lectura, estética sobria.
  - **`Diario`** — lista de líneas espirituales por fecha (desc), desde `getDiario()`.
- **`DayDetail`** (overlay en la home): se abre al tocar un día en `Chain`. Muestra los rituales de
  **esa fecha** (rutina + periodicidad), con checks editables, TAA y línea espiritual. Reusa las
  actions con la fecha elegida. Días pasados = solo rutina (sin Calendar).
- **Nodo "Cierre nocturno"** (espina de hoy): campo de texto inline para la línea espiritual.

## Refactor de cableado (clave)

- `Sentinel` carga la rutina del usuario (DB) **una vez** y computa la espina por fecha aplicando la
  regla de periodicidad. La carga de la espina se vuelve **asíncrona** → se añade un estado de carga
  suave (hoy es síncrona con el hardcode).
- `Sentinel` carga `getCycleInfo()` y lo pasa a `getCyclePhase(date, startISO, length)` (fallback al
  default si no hay registro). El chip de ciclo del hero usa el valor real.

## Riesgos / notas

- **IDs estables**: `task_check.task_id` referencia el id del ritual. Semilla conserva ids; nuevos
  reciben `cust-<rand>`. Borrar un ritual deja checks históricos inertes (inofensivos).
- **Días pasados usan la rutina actual**: `DayDetail` computa los rituales de un día pasado con la
  configuración de rutina **vigente** (no se versiona la rutina). Simplificación aceptada; los checks
  ya guardados por `task_id` persisten igual aunque el ritual haya cambiado de día/periodicidad.
- **Carga async de la espina**: cuidar que la "compuerta TAA" y el fondo dinámico no parpadeen
  durante la carga (gate solo tras cargar estado del día, como hoy).
- **`next@16`** (ver `AGENTS.md`): es client estándar + server actions; sin APIs sensibles a versión.
  Ante dudas, consultar `node_modules/next/dist/docs/`.

## Orden de construcción

1. **Migración SQL** (`routine_ritual`, `day_state.linea_espiritual`) — correr en Neon (consola SQL).
   Actualizar también `src/lib/db/schema.sql`.
2. **Capa rutina**: tipos `RoutineRitual`, semilla, actions, `ritualAppliesOn`; refactor
   `getRoutineRituals` y carga async en `Sentinel`.
3. **Cablear ciclo real** en `Sentinel` (`getCycleInfo` → `getCyclePhase`).
4. **`/configuracion`** + engranaje + pestaña **Mi rutina** (CRUD + periodicidad + borrar).
5. **Vista mensual**.
6. **Ciclo** (tab).
7. **Línea espiritual** (campo en cierre + `DayDetail`) + **Diario**.
8. **DayDetail** (editar día desde la cadena).
9. **Verificación**.

## Verificación (end-to-end)

1. `npm run build` (tipos) + `npm run dev`.
2. **Periodicidad**: mover "lavar ropa" a domingos → cae solo domingos; poner `interval_weeks=2` →
   cae domingos por medio (coherente con el ancla). Verla reflejada en la espina y en Vista mensual.
3. **Borrar** un ritual → desaparece de la espina y de la vista mensual.
4. **Editar día pasado**: tocar ayer en la cadena, marcar checks/TAA/línea → persiste (recargar).
5. **Ciclo**: corregir inicio del período → la fase de hoy en el hero se recalcula.
6. **Línea espiritual**: escribir en el cierre → aparece en el Diario por fecha.
7. **Vista mensual** coherente con la rutina configurada.
8. Validar local y luego en `el-centinela-seven.vercel.app` (login real).
