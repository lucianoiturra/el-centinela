# Spec: Módulo de Entrenamiento Ciclismo

**Fecha:** 2026-05-26  
**Estado:** Aprobado  
**Plan de entrenamiento fuente:** `docs/plan-ciclismo.md`

---

## Contexto

Luciano Iturra sigue un plan de entrenamiento de 6 meses para una carrera de ciclismo de 30 km en octubre 2026. El plan incluye sesiones de bicicleta (Technogym) y pesas, distribuidas en 4 fases progresivas. El objetivo es integrar este plan en El Centinela para saber qué entrenamiento hacer cada día, registrar pesos/series usados, y redefinir "Día Ganado" como TAA + entrenamiento completado.

**Inicio entrenamiento:** 4 de marzo 2026  
**Carrera objetivo:** octubre 2026  
> ⚠️ La fecha exacta de la carrera en octubre debe confirmarse antes de correr el seed. El taper de Fase 4 se calcula hacia atrás desde `race_date`. Si no se sabe aún, usar `2026-10-04` como estimado.

---

## Horario semanal ajustado

El plan original tiene la rodada larga el sábado, pero en el Centinela el sábado es Sábado Santo (sin ejercicio). Ajuste acordado:

| Día | Actividad |
|-----|-----------|
| Lunes | Bici |
| Martes | Pesas — Rutina A |
| Miércoles | Bici |
| Jueves | Pesas — Rutina B |
| Viernes | Bici continua moderada |
| Sábado | Sábado Santo — sin entrenamiento |
| Domingo | Rodada larga |

---

## Base de Datos — 6 tablas nuevas

### `training_plan`
```sql
id            SERIAL PRIMARY KEY
user_id       TEXT NOT NULL
name          TEXT NOT NULL
start_date    DATE NOT NULL        -- 2026-03-04
race_date     DATE NOT NULL        -- 2026-10-XX (a confirmar)
created_at    TIMESTAMPTZ DEFAULT NOW()
UNIQUE (user_id)
```

### `training_phase`
```sql
id                     SERIAL PRIMARY KEY
plan_id                INT REFERENCES training_plan(id)
phase_number           INT NOT NULL          -- 1, 2, 3, 4
name                   TEXT NOT NULL
description            TEXT
start_month            INT NOT NULL          -- 1-based, relativo al start_date
end_month              INT NOT NULL
bike_km_week_min       INT
bike_km_week_max       INT
weights_days_per_week  INT
```

### `training_session_template`
```sql
id             SERIAL PRIMARY KEY
phase_id       INT REFERENCES training_phase(id)
day_of_week    INT NOT NULL          -- 1=Lun, 2=Mar, ... 7=Dom
activity_type  TEXT NOT NULL         -- 'bike' | 'weights' | 'rest'
title          TEXT NOT NULL
description    TEXT
duration_min   INT
intensity      TEXT                  -- 'low' | 'moderate' | 'high' | 'very_high' | 'rest'
-- Solo para bici:
level_min      INT
level_max      INT
rpm_min        INT
rpm_max        INT
watts_ref      TEXT                  -- ej. "~90W" o "120-150W"
-- Solo para pesas:
routine_label  TEXT                  -- 'A' | 'B' | 'A_reducida' | 'B_reducida' | null
```

### `training_exercise`
```sql
id                   SERIAL PRIMARY KEY
session_template_id  INT REFERENCES training_session_template(id)
sort_order           INT NOT NULL
name                 TEXT NOT NULL
sets                 INT NOT NULL
reps_label           TEXT NOT NULL    -- ej. "12-15" | "15" | "12 c/lado" | "40-60 seg"
rest_seconds         INT
muscle_group         TEXT
notes                TEXT
```

### `training_session_log`
```sql
id                   SERIAL PRIMARY KEY
user_id              TEXT NOT NULL
date                 DATE NOT NULL
session_template_id  INT REFERENCES training_session_template(id)
done                 BOOLEAN NOT NULL DEFAULT FALSE
completed_at         TIMESTAMPTZ
updated_at           TIMESTAMPTZ DEFAULT NOW()
UNIQUE (user_id, date)
```

### `training_set_log`
```sql
id                SERIAL PRIMARY KEY
user_id           TEXT NOT NULL
date              DATE NOT NULL
exercise_id       INT REFERENCES training_exercise(id)
set_number        INT NOT NULL          -- 1, 2, 3...
weight_kg         NUMERIC(5,2)
reps_completed    INT
duration_seconds  INT                   -- para planchas/isométricos
notes             TEXT
updated_at        TIMESTAMPTZ DEFAULT NOW()
UNIQUE (user_id, date, exercise_id, set_number)
```

### Seeding

Las tablas `training_plan`, `training_phase`, `training_session_template` y `training_exercise` se poblan con un script de seed (`scripts/seed-training.ts`) que corre una sola vez. Los datos provienen de `docs/plan-ciclismo.md`.

---

## Lógica de negocio — `src/lib/training.ts`

### `getCurrentPhase(startDate: Date, today: Date): Phase`
- Calcula el mes relativo desde `startDate`
- Mes 1–2 → Fase 1, Mes 3–4 → Fase 2, Mes 5–6 → Fase 3
- Últimas 3 semanas antes de `race_date` → Fase 4 Taper
- Retorna el objeto `training_phase`

### `getSessionForDay(phaseId: number, dayOfWeek: number): SessionTemplate | null`
- Busca el template de la fase actual para el día de la semana
- Retorna `null` si es sábado o si el template es `rest`

### `isTrainingRequired(today: Date): boolean`
- Retorna `false` si hoy es sábado (Sabbath)
- Retorna `false` si el template del día es `activity_type: 'rest'`
- Retorna `true` en todos los demás casos

---

## Lógica de Día Ganado — nueva regla

| Día | Condición para ganar |
|-----|---------------------|
| Lun / Mar / Mié / Jue / Vie / Dom | `taa_done = true` **AND** `training_session_log.done = true` |
| Sábado | Sin condición — excluido del Día Ganado (Sabbath) |
| Días sin entrenamiento | Solo `taa_done = true` |

**Cambio en `day_state`:** Se agrega columna `training_done BOOLEAN DEFAULT FALSE`.  
Esta columna es una copia denormalizada del estado de `training_session_log.done` — permite que `getMonthChain` calcule el Día Ganado con una sola query sin hacer JOIN adicionales.  
La función `markTrainingDone` escribe en **ambos lugares**: `training_session_log` y `day_state.training_done`.  
La función `markTaaDone` y la nueva `markTrainingDone` ambas disparan una re-evaluación del Día Ganado:

```
dayWon = taa_done AND (training_done OR NOT isTrainingRequired(today))
```

La cadena del mes y el banner "🏆 Día Ganado" reflejan este nuevo cálculo.

---

## Server Actions — `src/app/actions/training.ts`

| Función | Descripción |
|---------|-------------|
| `getTrainingPlan()` | Retorna el plan activo del usuario con start_date y race_date |
| `getTodaySession(date)` | Retorna el template de sesión para hoy (fase calculada on-the-fly) |
| `markSessionDone(date, sessionTemplateId, done)` | Guarda en `training_session_log` y recalcula Día Ganado |
| `saveSetLog(date, exerciseId, setNumber, data)` | Upsert en `training_set_log` |
| `getLastSetLog(exerciseId)` | Retorna el registro más reciente del ejercicio (para mostrar "última vez: X kg") |
| `getSessionLog(date)` | Retorna si la sesión del día fue completada |

---

## UI — `TrainingCard` (`src/components/TrainingCard.tsx`)

### Props
```ts
interface TrainingCardProps {
  date: Date
  onSessionDone: (done: boolean) => void  // para actualizar Día Ganado en Sentinel
}
```

### Estados del componente

1. **Cargando** — skeleton mientras resuelven las server actions
2. **Sin entrenamiento (sábado)** — no renderiza nada
3. **Descanso activo** — card sin botón de "marcar hecha"
4. **Bici** — muestra nivel/RPM/vatios/duración + botón "Marcar hecha"
5. **Pesas (colapsado)** — título + duración + botón "▶ Ver ejercicios" + "Marcar hecha"
6. **Pesas (expandido)** — lista de ejercicios, cada uno con:
   - Checkbox de completado
   - Inputs: peso (kg) + reps realizadas (o segundos para isométricos)
   - Referencia "última vez: X kg × Y reps"
7. **Sesión completada** — card verde con "✅ completado · ▶ ver detalle"

### Comportamiento de los inputs de pesos
- Guardan al perder el foco (`onBlur`) o al presionar Enter
- No bloquean la UX — el guardado es optimista
- La sesión se puede marcar hecha sin llenar todos los campos

---

## Modificaciones a archivos existentes

### `src/components/Sentinel.tsx`
- Importar y renderizar `<TrainingCard date={today} onSessionDone={handleTrainingDone} />`
- Ubicación: entre `<Hero>` y `<Spine>`
- Nuevo estado: `trainingDone: boolean`
- Refactorizar `toggleWon` para usar nueva lógica: `won = taaDone && (trainingDone || !trainingRequired)`

### `src/app/actions/day.ts`
- Agregar columna `training_done` a `day_state` (migración)
- `getDayState` retorna también `training_done`
- Nueva función `markTrainingDone(date, done)` con recálculo de `won`
- `getMonthChain` considera la nueva lógica de Día Ganado

### `src/lib/types.ts`
- Agregar tipos: `TrainingPhase`, `TrainingSessionTemplate`, `TrainingExercise`, `TrainingSetLog`

---

## Archivos nuevos

| Archivo | Propósito |
|---------|-----------|
| `src/lib/training.ts` | Lógica pura: cálculo de fase, sesión del día, `isTrainingRequired` |
| `src/lib/training.test.ts` | Tests de `getCurrentPhase` y `isTrainingRequired` |
| `src/components/TrainingCard.tsx` | Tarjeta visual completa |
| `src/app/actions/training.ts` | Server actions de entrenamiento |
| `scripts/seed-training.ts` | Seed de las 4 fases + ejercicios en BD |
| `migrations/YYYYMMDD_training_tables.sql` | Migración SQL de las 6 tablas |

---

## Secuencia de build

1. Migración SQL (6 tablas + columna `training_done` en `day_state`)
2. `scripts/seed-training.ts` — poblar plan + fases + ejercicios
3. `src/lib/training.ts` + tests
4. `src/app/actions/training.ts`
5. `src/components/TrainingCard.tsx`
6. Modificar `Sentinel.tsx` (insertar `TrainingCard`, nueva lógica Día Ganado)
7. Modificar `day.ts` (nueva columna + lógica)
8. Modificar `types.ts` (nuevos tipos)

---

## Fuera de scope (YAGNI)

- UI de edición del plan desde la app
- Historial de progresión de pesos con gráficos
- Notificaciones push de entrenamiento
- Múltiples planes o usuarios con planes distintos
- Exportación a Strava / integración directa
