# Entrenamiento Ciclismo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar el plan de entrenamiento de ciclismo de 6 meses en El Centinela — mostrando el workout del día, permitiendo registrar pesos/series, y redefiniendo "Día Ganado" como TAA + entrenamiento completado.

**Architecture:** Plan completo en BD (6 tablas nuevas). Lógica de fase se calcula dinámicamente desde `start_date`. `TrainingCard` se inserta entre Hero y Spine en `Sentinel.tsx`. Auto-seed en la primera llamada a `getTrainingPlan()`, mismo patrón que rituales.

**Tech Stack:** Next.js 16 (App Router), `postgres` tagged template, Vitest, CSS global en `globals.css`.

---

## Mapa de archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|----------------|
| Crear | `src/lib/db/migrations/2026-05-26-training-tables.sql` | 6 tablas nuevas + columna `training_done` en `day_state` |
| Modificar | `src/lib/types.ts` | Agregar 4 tipos de entrenamiento |
| Crear | `src/lib/training-data.ts` | Constantes con datos del plan (fases, sesiones, ejercicios) |
| Crear | `src/lib/training.ts` | Lógica pura: cálculo de fase, día del plan, sábado |
| Crear | `src/lib/training.test.ts` | Tests de la lógica pura |
| Crear | `src/app/actions/training.ts` | Server actions: plan, sesión del día, logs de sets, auto-seed |
| Modificar | `src/app/actions/day.ts` | `getDayState` devuelve `training_done`; `getMonthChain` usa nueva lógica |
| Modificar | `src/app/globals.css` | Clases CSS para `.training-*` |
| Crear | `src/components/TrainingCard.tsx` | Tarjeta completa del entrenamiento del día |
| Modificar | `src/components/Sentinel.tsx` | Insertar `<TrainingCard>`, nueva lógica Día Ganado en Hero |

---

## Task 1: Migración SQL

**Files:**
- Create: `src/lib/db/migrations/2026-05-26-training-tables.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Migración 2026-05-26: módulo de entrenamiento ciclismo.
-- Aditiva e idempotente. Correr una vez en Neon (SQL Editor).

-- ─── 1. training_plan ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_plan (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  start_date   DATE        NOT NULL,
  race_date    DATE        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ─── 2. training_phase ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_phase (
  id                    SERIAL PRIMARY KEY,
  plan_id               INT         NOT NULL REFERENCES training_plan(id) ON DELETE CASCADE,
  phase_number          SMALLINT    NOT NULL CHECK (phase_number BETWEEN 1 AND 4),
  name                  TEXT        NOT NULL,
  description           TEXT,
  start_month           SMALLINT    NOT NULL,
  end_month             SMALLINT    NOT NULL,
  bike_km_week_min      SMALLINT,
  bike_km_week_max      SMALLINT,
  weights_days_per_week SMALLINT
);

-- ─── 3. training_session_template ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_session_template (
  id            SERIAL PRIMARY KEY,
  phase_id      INT     NOT NULL REFERENCES training_phase(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  activity_type TEXT    NOT NULL CHECK (activity_type IN ('bike','weights','rest')),
  title         TEXT    NOT NULL,
  description   TEXT,
  duration_min  SMALLINT,
  intensity     TEXT    CHECK (intensity IN ('low','moderate','high','very_high','rest')),
  -- Solo bici:
  level_min     SMALLINT,
  level_max     SMALLINT,
  rpm_min       SMALLINT,
  rpm_max       SMALLINT,
  watts_ref     TEXT,
  -- Solo pesas:
  routine_label TEXT    CHECK (routine_label IN ('A','B','A_reducida','B_reducida'))
);

-- ─── 4. training_exercise ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_exercise (
  id                   SERIAL PRIMARY KEY,
  session_template_id  INT      NOT NULL REFERENCES training_session_template(id) ON DELETE CASCADE,
  sort_order           SMALLINT NOT NULL,
  name                 TEXT     NOT NULL,
  sets                 SMALLINT NOT NULL,
  reps_label           TEXT     NOT NULL,
  rest_seconds         SMALLINT,
  muscle_group         TEXT,
  notes                TEXT
);

-- ─── 5. training_session_log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_session_log (
  id                   SERIAL PRIMARY KEY,
  user_id              TEXT        NOT NULL,
  date                 DATE        NOT NULL,
  session_template_id  INT         NOT NULL REFERENCES training_session_template(id),
  done                 BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at         TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

-- ─── 6. training_set_log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_set_log (
  id               SERIAL PRIMARY KEY,
  user_id          TEXT        NOT NULL,
  date             DATE        NOT NULL,
  exercise_id      INT         NOT NULL REFERENCES training_exercise(id),
  set_number       SMALLINT    NOT NULL,
  weight_kg        NUMERIC(5,2),
  reps_completed   SMALLINT,
  duration_seconds SMALLINT,
  notes            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date, exercise_id, set_number)
);

-- ─── Columna training_done en day_state ──────────────────────────────────────
-- NULL = día sin tracking de entrenamiento (días anteriores a la feature).
-- TRUE = entrenamiento completado. FALSE = entrenamiento no hecho ese día.
ALTER TABLE day_state ADD COLUMN IF NOT EXISTS training_done BOOLEAN;
```

- [ ] **Step 2: Aplicar la migración en Neon**

Ir a la consola de Neon → SQL Editor → pegar y ejecutar el contenido completo del archivo. Verificar que no hay errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/migrations/2026-05-26-training-tables.sql
git commit -m "db: migración tablas entrenamiento ciclismo"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Agregar los 4 tipos nuevos al final de `types.ts`**

Abrir `src/lib/types.ts` y agregar al final:

```typescript
// ─── Entrenamiento Ciclismo ───────────────────────────────────────────────────

export interface TrainingPhase {
  id: number;
  planId: number;
  phaseNumber: 1 | 2 | 3 | 4;
  name: string;
  description: string | null;
  startMonth: number;
  endMonth: number;
  bikeKmWeekMin: number | null;
  bikeKmWeekMax: number | null;
  weightsDaysPerWeek: number | null;
}

export interface TrainingSessionTemplate {
  id: number;
  phaseId: number;
  dayOfWeek: number; // 1=Lun … 7=Dom (6=Sáb nunca tiene sesión)
  activityType: "bike" | "weights" | "rest";
  title: string;
  description: string | null;
  durationMin: number | null;
  intensity: "low" | "moderate" | "high" | "very_high" | "rest" | null;
  levelMin: number | null;
  levelMax: number | null;
  rpmMin: number | null;
  rpmMax: number | null;
  wattsRef: string | null;
  routineLabel: "A" | "B" | "A_reducida" | "B_reducida" | null;
}

export interface TrainingExercise {
  id: number;
  sessionTemplateId: number;
  sortOrder: number;
  name: string;
  sets: number;
  repsLabel: string;
  restSeconds: number | null;
  muscleGroup: string | null;
  notes: string | null;
}

export interface TrainingSetLog {
  id: number;
  userId: string;
  date: string; // YYYY-MM-DD
  exerciseId: number;
  setNumber: number;
  weightKg: number | null;
  repsCompleted: number | null;
  durationSeconds: number | null;
  notes: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "types: agregar tipos de entrenamiento ciclismo"
```

---

## Task 3: Datos del plan (`training-data.ts`)

**Files:**
- Create: `src/lib/training-data.ts`

- [ ] **Step 1: Crear el archivo con los tipos de seed y los ejercicios base**

```typescript
// src/lib/training-data.ts
// Datos estáticos del plan de entrenamiento. Solo se usa en el servidor para el auto-seed.

export type ExerciseSeed = {
  name: string;
  sets: number;
  reps_label: string;
  rest_seconds: number;
  muscle_group: string;
  notes: string;
};

export type SessionSeed = {
  day_of_week: number; // 1=Lun … 7=Dom (sin sábado)
  activity_type: "bike" | "weights" | "rest";
  title: string;
  description: string | null;
  duration_min: number;
  intensity: "low" | "moderate" | "high" | "very_high" | "rest";
  level_min: number | null;
  level_max: number | null;
  rpm_min: number | null;
  rpm_max: number | null;
  watts_ref: string | null;
  routine_label: "A" | "B" | "A_reducida" | "B_reducida" | null;
  exercises: ExerciseSeed[];
};

export type PhaseSeed = {
  phase_number: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  start_month: number;
  end_month: number;
  bike_km_week_min: number | null;
  bike_km_week_max: number | null;
  weights_days_per_week: number;
  sessions: SessionSeed[];
};

// ─── Ejercicios ───────────────────────────────────────────────────────────────

const RUTINA_A: ExerciseSeed[] = [
  { name: "Sentadilla en máquina o libre", sets: 3, reps_label: "12-15", rest_seconds: 90, muscle_group: "Cuádriceps / Glúteos", notes: "Rodilla sobre pie, espalda recta" },
  { name: "Prensa de piernas (Leg Press)", sets: 3, reps_label: "15", rest_seconds: 75, muscle_group: "Cuádriceps / Isquios", notes: "El ejercicio más específico para bici" },
  { name: "Zancadas con mancuerna", sets: 3, reps_label: "12 c/lado", rest_seconds: 75, muscle_group: "Glúteos / Estabiliz.", notes: "Simula el pedaleo unilateral" },
  { name: "Curl de isquiotibiales (máquina)", sets: 3, reps_label: "15", rest_seconds: 60, muscle_group: "Isquiotibiales", notes: "Equilibrio con cuádriceps" },
  { name: "Elevación de pantorrillas de pie", sets: 3, reps_label: "20", rest_seconds: 45, muscle_group: "Gemelos / Sóleo", notes: "Clave para pedaleo eficiente" },
  { name: "Plancha frontal", sets: 3, reps_label: "40-60 seg", rest_seconds: 60, muscle_group: "Core / Transverso", notes: "Espalda recta, sin hundir caderas" },
  { name: "Crunch en máquina", sets: 3, reps_label: "15", rest_seconds: 60, muscle_group: "Recto abdominal", notes: "Lento y controlado" },
  { name: "Plancha lateral", sets: 2, reps_label: "30 seg c/lado", rest_seconds: 45, muscle_group: "Oblicuos", notes: "Estabilidad lateral en la bici" },
];

const RUTINA_B: ExerciseSeed[] = [
  { name: "Jalón al pecho (polea alta)", sets: 3, reps_label: "12-15", rest_seconds: 90, muscle_group: "Dorsal / Bíceps", notes: "Pecho adelante, espalda recta" },
  { name: "Remo en máquina sentado", sets: 3, reps_label: "12-15", rest_seconds: 75, muscle_group: "Romboides / Trapecio", notes: "Fundamental para postura en bici" },
  { name: "Press de hombros con mancuernas", sets: 3, reps_label: "12", rest_seconds: 75, muscle_group: "Deltoides", notes: "Peso moderado, sin arquear lumbar" },
  { name: "Elevaciones laterales", sets: 3, reps_label: "15", rest_seconds: 60, muscle_group: "Hombro lateral", notes: "Codos ligeramente flexionados" },
  { name: "Press de pecho en máquina", sets: 3, reps_label: "12-15", rest_seconds: 90, muscle_group: "Pectoral / Tríceps", notes: "Complementario" },
  { name: "Curl de bíceps con barra", sets: 3, reps_label: "12", rest_seconds: 60, muscle_group: "Bíceps", notes: "Control en la bajada" },
  { name: "Extensión tríceps en polea", sets: 3, reps_label: "15", rest_seconds: 60, muscle_group: "Tríceps", notes: "Codos pegados al cuerpo" },
  { name: "Superman en suelo o banco", sets: 3, reps_label: "15", rest_seconds: 60, muscle_group: "Lumbar / Glúteos", notes: "Protege la espalda baja en bici" },
  { name: "Plancha con rotación (Spider)", sets: 3, reps_label: "10 c/lado", rest_seconds: 60, muscle_group: "Core dinámico", notes: "Control de cadera" },
];

const RUTINA_A_REDUCIDA: ExerciseSeed[] = [
  { name: "Prensa de piernas (Leg Press)", sets: 3, reps_label: "15", rest_seconds: 75, muscle_group: "Cuádriceps / Isquios", notes: "Principal estímulo para bici" },
  { name: "Plancha frontal", sets: 3, reps_label: "40-60 seg", rest_seconds: 60, muscle_group: "Core / Transverso", notes: "Espalda recta" },
  { name: "Plancha lateral", sets: 2, reps_label: "30 seg c/lado", rest_seconds: 45, muscle_group: "Oblicuos", notes: "Estabilidad lateral" },
];

const RUTINA_B_REDUCIDA: ExerciseSeed[] = [
  { name: "Jalón al pecho (polea alta)", sets: 3, reps_label: "12-15", rest_seconds: 90, muscle_group: "Dorsal / Bíceps", notes: "Pecho adelante, espalda recta" },
  { name: "Remo en máquina sentado", sets: 3, reps_label: "12-15", rest_seconds: 75, muscle_group: "Romboides / Trapecio", notes: "Postura en bici" },
  { name: "Plancha con rotación (Spider)", sets: 3, reps_label: "10 c/lado", rest_seconds: 60, muscle_group: "Core dinámico", notes: "Control de cadera" },
];
```

- [ ] **Step 2: Agregar el objeto `TRAINING_SEED` al mismo archivo**

```typescript
// ─── Plan completo ────────────────────────────────────────────────────────────
// Horario ajustado: Sábado = Sábado Santo (sin sesión). Domingo = Rodada larga.

export const TRAINING_SEED: {
  name: string;
  start_date: string;
  race_date: string;
  phases: PhaseSeed[];
} = {
  name: "Plan Ciclismo — L'Étape 2026",
  start_date: "2026-03-04",
  race_date: "2026-10-04", // Confirmar fecha exacta antes del seed
  phases: [
    // ── FASE 1 — Adaptación (meses 1-2: mar-abr) ────────────────────────────
    {
      phase_number: 1,
      name: "Fase 1 — Adaptación",
      description: "Base aeróbica + hábito. Meses 1–2.",
      start_month: 1, end_month: 2,
      bike_km_week_min: 30, bike_km_week_max: 50,
      weights_days_per_week: 2,
      sessions: [
        { day_of_week: 1, activity_type: "bike", title: "Bici — base aeróbica", description: null, duration_min: 40, intensity: "low", level_min: 3, level_max: 4, rpm_min: 75, rpm_max: 85, watts_ref: "~50W", routine_label: null, exercises: [] },
        { day_of_week: 2, activity_type: "weights", title: "Pesas — Rutina A (Tren Inferior + Core)", description: "Sentadillas, prensa, zancadas, core. Calentar 8-10 min en bici antes.", duration_min: 55, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "A", exercises: RUTINA_A },
        { day_of_week: 3, activity_type: "bike", title: "Bici — técnica y cadencia", description: null, duration_min: 45, intensity: "low", level_min: 2, level_max: 3, rpm_min: 80, rpm_max: 85, watts_ref: "~40W", routine_label: null, exercises: [] },
        { day_of_week: 4, activity_type: "weights", title: "Pesas — Rutina B (Tren Superior + Core)", description: "Jalón, remo, hombros, core. Finalizar con 5 min stretching.", duration_min: 55, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "B", exercises: RUTINA_B },
        { day_of_week: 5, activity_type: "bike", title: "Bici — continua moderada", description: null, duration_min: 50, intensity: "moderate", level_min: 5, level_max: 5, rpm_min: 78, rpm_max: 78, watts_ref: "~65W", routine_label: null, exercises: [] },
        { day_of_week: 7, activity_type: "bike", title: "Bici — rodada larga 🚵", description: "Objetivo distancia: 12–15 km. El más importante de la semana.", duration_min: 75, intensity: "low", level_min: 3, level_max: 4, rpm_min: 75, rpm_max: 80, watts_ref: null, routine_label: null, exercises: [] },
      ],
    },
    // ── FASE 2 — Resistencia (meses 3-4: may-jun) ───────────────────────────
    {
      phase_number: 2,
      name: "Fase 2 — Resistencia",
      description: "Volumen + fuerza. Meses 3–4.",
      start_month: 3, end_month: 4,
      bike_km_week_min: 60, bike_km_week_max: 100,
      weights_days_per_week: 2,
      sessions: [
        { day_of_week: 1, activity_type: "bike", title: "Bici — resistencia", description: null, duration_min: 60, intensity: "moderate", level_min: 7, level_max: 8, rpm_min: 80, rpm_max: 80, watts_ref: "~90W", routine_label: null, exercises: [] },
        { day_of_week: 2, activity_type: "weights", title: "Pesas — Rutina A (cargas mayores)", description: "Aumentar peso vs Fase 1. Sentadillas, prensa, zancadas, core.", duration_min: 55, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "A", exercises: RUTINA_A },
        { day_of_week: 3, activity_type: "bike", title: "Bici — intervalos", description: "5×3 min Nivel 11-12 / 2 min Nivel 3 de recuperación.", duration_min: 50, intensity: "high", level_min: 11, level_max: 12, rpm_min: 90, rpm_max: 95, watts_ref: "120-150W", routine_label: null, exercises: [] },
        { day_of_week: 4, activity_type: "weights", title: "Pesas — Rutina B (cargas mayores)", description: "Aumentar peso vs Fase 1. Jalón, remo, hombros, core.", duration_min: 55, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "B", exercises: RUTINA_B },
        { day_of_week: 5, activity_type: "bike", title: "Bici — ritmo carrera", description: "Objetivo: 20 km.", duration_min: 75, intensity: "moderate", level_min: 8, level_max: 9, rpm_min: 82, rpm_max: 82, watts_ref: null, routine_label: null, exercises: [] },
        { day_of_week: 7, activity_type: "bike", title: "Bici — rodada larga 🚵", description: "Objetivo: 20–25 km.", duration_min: 105, intensity: "moderate", level_min: 6, level_max: 7, rpm_min: 80, rpm_max: 80, watts_ref: null, routine_label: null, exercises: [] },
      ],
    },
    // ── FASE 3 — Velocidad (meses 5-6: jul-ago) ─────────────────────────────
    {
      phase_number: 3,
      name: "Fase 3 — Velocidad",
      description: "Velocidad + simulacros de 30 km. Meses 5–6.",
      start_month: 5, end_month: 6,
      bike_km_week_min: 100, bike_km_week_max: 130,
      weights_days_per_week: 2,
      sessions: [
        { day_of_week: 1, activity_type: "bike", title: "Bici — velocidad", description: "Series de 1 km. RPM 90+.", duration_min: 45, intensity: "very_high", level_min: 15, level_max: 16, rpm_min: 90, rpm_max: 100, watts_ref: "180-220W", routine_label: null, exercises: [] },
        { day_of_week: 2, activity_type: "weights", title: "Pesas — Rutina A reducida", description: "Solo prensa de piernas + core (3 ejercicios).", duration_min: 40, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "A_reducida", exercises: RUTINA_A_REDUCIDA },
        { day_of_week: 3, activity_type: "bike", title: "Bici — recuperación activa", description: "Suave. No forzar.", duration_min: 35, intensity: "low", level_min: 2, level_max: 3, rpm_min: 70, rpm_max: 70, watts_ref: "<50W", routine_label: null, exercises: [] },
        { day_of_week: 4, activity_type: "weights", title: "Pesas — Rutina B reducida", description: "Jalón + remo + core (3 ejercicios).", duration_min: 40, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "B_reducida", exercises: RUTINA_B_REDUCIDA },
        { day_of_week: 5, activity_type: "bike", title: "Bici — HIIT", description: "8×1 min máximo / 90 seg recuperación.", duration_min: 50, intensity: "very_high", level_min: 16, level_max: 25, rpm_min: 95, rpm_max: 100, watts_ref: ">200W", routine_label: null, exercises: [] },
        { day_of_week: 7, activity_type: "bike", title: "Bici — Simulacro 30 km 🏆", description: "Ritmo carrera real.", duration_min: 90, intensity: "high", level_min: 10, level_max: 12, rpm_min: 85, rpm_max: 90, watts_ref: "150-180W", routine_label: null, exercises: [] },
      ],
    },
    // ── FASE 4 — Taper (últimas 3 semanas: sep) ─────────────────────────────
    {
      phase_number: 4,
      name: "Fase 4 — Taper",
      description: "Descarga + preparación carrera. Últimas 3 semanas.",
      start_month: 7, end_month: 8, // calculado desde race_date en calculatePhaseNumber
      bike_km_week_min: 40, bike_km_week_max: 60,
      weights_days_per_week: 1,
      sessions: [
        { day_of_week: 1, activity_type: "bike", title: "Bici — mantenimiento", description: null, duration_min: 35, intensity: "low", level_min: 5, level_max: 8, rpm_min: 75, rpm_max: 80, watts_ref: "60-90W", routine_label: null, exercises: [] },
        { day_of_week: 2, activity_type: "weights", title: "Pesas — Rutina A reducida (activación)", description: "Solo activación. Cargas 50% de lo habitual.", duration_min: 30, intensity: "low", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "A_reducida", exercises: RUTINA_A_REDUCIDA },
        { day_of_week: 3, activity_type: "bike", title: "Bici — suave", description: "Sin esfuerzo. Piernas sueltas.", duration_min: 30, intensity: "low", level_min: 1, level_max: 2, rpm_min: 70, rpm_max: 75, watts_ref: "<50W", routine_label: null, exercises: [] },
        { day_of_week: 4, activity_type: "rest", title: "Descanso activo", description: "Stretching completo: cuádriceps, cadera, espalda.", duration_min: 20, intensity: "rest", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: null, exercises: [] },
        { day_of_week: 5, activity_type: "bike", title: "Bici — activación", description: "Piernas frescas.", duration_min: 25, intensity: "low", level_min: 3, level_max: 4, rpm_min: 75, rpm_max: 78, watts_ref: "<50W", routine_label: null, exercises: [] },
        { day_of_week: 7, activity_type: "bike", title: "Bici — rodada corta", description: "15–20 km cómodos. Sin reventar.", duration_min: 45, intensity: "low", level_min: 5, level_max: 5, rpm_min: 75, rpm_max: 80, watts_ref: "~60W", routine_label: null, exercises: [] },
      ],
    },
  ],
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/training-data.ts
git commit -m "feat: datos del plan de entrenamiento ciclismo"
```

---

## Task 4: Lógica pura + tests

**Files:**
- Create: `src/lib/training.ts`
- Create: `src/lib/training.test.ts`

- [ ] **Step 1: Escribir los tests primero**

```typescript
// src/lib/training.test.ts
import { describe, it, expect } from "vitest";
import { calculatePhaseNumber, jsDayToPlanDay, isSabbathDay } from "./training";

const START = new Date("2026-03-04");
const RACE = new Date("2026-10-04");

describe("calculatePhaseNumber", () => {
  it("Fase 1 — mes 1 (marzo)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-03-15"), RACE)).toBe(1);
  });
  it("Fase 1 — mes 2 (abril)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-04-20"), RACE)).toBe(1);
  });
  it("Fase 2 — mes 3 (mayo)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-05-10"), RACE)).toBe(2);
  });
  it("Fase 2 — mes 4 (junio)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-06-15"), RACE)).toBe(2);
  });
  it("Fase 3 — mes 5 (julio)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-07-01"), RACE)).toBe(3);
  });
  it("Fase 3 — mes 6 (agosto)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-08-20"), RACE)).toBe(3);
  });
  it("Fase 4 — últimas 3 semanas (taper)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-09-20"), RACE)).toBe(4);
  });
  it("Exactamente en el inicio del taper (21 días antes)", () => {
    const taperStart = new Date(RACE);
    taperStart.setDate(taperStart.getDate() - 21);
    expect(calculatePhaseNumber(START, taperStart, RACE)).toBe(4);
  });
  it("Un día antes del taper sigue en Fase 3", () => {
    const beforeTaper = new Date(RACE);
    beforeTaper.setDate(beforeTaper.getDate() - 22);
    expect(calculatePhaseNumber(START, beforeTaper, RACE)).toBe(3);
  });
});

describe("jsDayToPlanDay", () => {
  it("Sunday (0) → 7", () => expect(jsDayToPlanDay(0)).toBe(7));
  it("Monday (1) → 1", () => expect(jsDayToPlanDay(1)).toBe(1));
  it("Tuesday (2) → 2", () => expect(jsDayToPlanDay(2)).toBe(2));
  it("Saturday (6) → 6", () => expect(jsDayToPlanDay(6)).toBe(6));
});

describe("isSabbathDay", () => {
  it("sábado 2026-05-23 → true", () => {
    expect(isSabbathDay(new Date("2026-05-23"))).toBe(true);
  });
  it("lunes 2026-05-25 → false", () => {
    expect(isSabbathDay(new Date("2026-05-25"))).toBe(false);
  });
  it("domingo 2026-05-24 → false", () => {
    expect(isSabbathDay(new Date("2026-05-24"))).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que los tests fallan**

```bash
npm test -- training.test
```

Expected: FAIL — "Cannot find module './training'"

- [ ] **Step 3: Implementar `src/lib/training.ts`**

```typescript
// src/lib/training.ts
// Lógica pura — sin dependencias de DB ni de servidor.

/**
 * Calcula el número de fase (1–4) según las fechas.
 * Fase 4 = últimas 3 semanas antes de race_date.
 * Fase 3 = meses 5–6 desde start_date.
 * Fase 2 = meses 3–4. Fase 1 = meses 1–2.
 */
export function calculatePhaseNumber(
  startDate: Date,
  today: Date,
  raceDate: Date
): 1 | 2 | 3 | 4 {
  // Taper: últimas 3 semanas antes de la carrera
  const taperStart = new Date(raceDate);
  taperStart.setDate(taperStart.getDate() - 21);
  if (today >= taperStart) return 4;

  // Mes relativo al inicio (1-based)
  const yearDiff = today.getFullYear() - startDate.getFullYear();
  const monthDiff = today.getMonth() - startDate.getMonth();
  const relativeMonth = yearDiff * 12 + monthDiff + 1;

  if (relativeMonth <= 2) return 1;
  if (relativeMonth <= 4) return 2;
  return 3;
}

/**
 * Convierte el valor de Date.getDay() (0=Dom) al day_of_week del plan (1=Lun…7=Dom).
 */
export function jsDayToPlanDay(jsDay: number): number {
  if (jsDay === 0) return 7; // Domingo → 7
  return jsDay;              // Lun=1 … Sáb=6
}

/**
 * Sábado = Sábado Santo — nunca hay entrenamiento.
 */
export function isSabbathDay(today: Date): boolean {
  return today.getDay() === 6;
}
```

- [ ] **Step 4: Verificar que los tests pasan**

```bash
npm test -- training.test
```

Expected: PASS — 11 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/training.ts src/lib/training.test.ts
git commit -m "feat: lógica pura de entrenamiento — fase, día del plan, sábado"
```

---

## Task 5: Server actions de entrenamiento

**Files:**
- Create: `src/app/actions/training.ts`

- [ ] **Step 1: Crear el archivo con el auto-seed y `getTrainingPlan`**

```typescript
// src/app/actions/training.ts
"use server";
import { sql } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { getUserId, fmtDate } from "@/lib/server-user";
import { calculatePhaseNumber, jsDayToPlanDay, isSabbathDay } from "@/lib/training";
import { TRAINING_SEED } from "@/lib/training-data";
import type { TrainingSessionTemplate, TrainingExercise } from "@/lib/types";

// ─── Auto-seed ────────────────────────────────────────────────────────────────

async function seedTrainingPlan(userId: string) {
  const { name, start_date, race_date, phases } = TRAINING_SEED;

  const [planRow] = await sql`
    INSERT INTO training_plan (user_id, name, start_date, race_date)
    VALUES (${userId}, ${name}, ${start_date}, ${race_date})
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id
  `;
  if (!planRow) return; // ya existía

  const planId = planRow.id as number;

  for (const phase of phases) {
    const [phaseRow] = await sql`
      INSERT INTO training_phase
        (plan_id, phase_number, name, description,
         start_month, end_month,
         bike_km_week_min, bike_km_week_max, weights_days_per_week)
      VALUES
        (${planId}, ${phase.phase_number}, ${phase.name}, ${phase.description},
         ${phase.start_month}, ${phase.end_month},
         ${phase.bike_km_week_min}, ${phase.bike_km_week_max}, ${phase.weights_days_per_week})
      RETURNING id
    `;
    const phaseId = phaseRow.id as number;

    for (const session of phase.sessions) {
      const [sessionRow] = await sql`
        INSERT INTO training_session_template
          (phase_id, day_of_week, activity_type, title, description,
           duration_min, intensity,
           level_min, level_max, rpm_min, rpm_max, watts_ref, routine_label)
        VALUES
          (${phaseId}, ${session.day_of_week}, ${session.activity_type},
           ${session.title}, ${session.description ?? null},
           ${session.duration_min}, ${session.intensity},
           ${session.level_min ?? null}, ${session.level_max ?? null},
           ${session.rpm_min ?? null}, ${session.rpm_max ?? null},
           ${session.watts_ref ?? null}, ${session.routine_label ?? null})
        RETURNING id
      `;
      const sessionId = sessionRow.id as number;

      for (let i = 0; i < session.exercises.length; i++) {
        const ex = session.exercises[i];
        await sql`
          INSERT INTO training_exercise
            (session_template_id, sort_order, name, sets, reps_label,
             rest_seconds, muscle_group, notes)
          VALUES
            (${sessionId}, ${i}, ${ex.name}, ${ex.sets}, ${ex.reps_label},
             ${ex.rest_seconds}, ${ex.muscle_group}, ${ex.notes})
        `;
      }
    }
  }
}

// ─── getTrainingPlan ──────────────────────────────────────────────────────────

export async function getTrainingPlan(): Promise<{
  id: number;
  startDate: string;
  raceDate: string;
} | null> {
  const userId = await getUserId();
  let rows = await sql`
    SELECT id, start_date::text as start_date, race_date::text as race_date
    FROM training_plan WHERE user_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    await seedTrainingPlan(userId);
    rows = await sql`
      SELECT id, start_date::text as start_date, race_date::text as race_date
      FROM training_plan WHERE user_id = ${userId} LIMIT 1
    `;
  }
  if (rows.length === 0) return null;
  return {
    id: rows[0].id as number,
    startDate: rows[0].start_date as string,
    raceDate: rows[0].race_date as string,
  };
}
```

- [ ] **Step 2: Agregar `getTrainingCardData` al mismo archivo**

```typescript
// Tipo de respuesta de getTrainingCardData
export type LastSet = {
  weightKg: number | null;
  repsCompleted: number | null;
  durationSeconds: number | null;
};

export type TodaySetEntry = {
  setNumber: number;
  weightKg: number | null;
  repsCompleted: number | null;
  durationSeconds: number | null;
};

export type TrainingCardData = {
  session: TrainingSessionTemplate | null;
  exercises: TrainingExercise[];
  done: boolean;
  // exerciseId → datos de la última vez antes de hoy
  lastSets: Record<number, LastSet>;
  // exerciseId → sets de hoy
  todaySets: Record<number, TodaySetEntry[]>;
};

export async function getTrainingCardData(date: Date): Promise<TrainingCardData> {
  const userId = await getUserId();

  if (isSabbathDay(date)) {
    return { session: null, exercises: [], done: false, lastSets: {}, todaySets: {} };
  }

  const plan = await getTrainingPlan();
  if (!plan) return { session: null, exercises: [], done: false, lastSets: {}, todaySets: {} };

  const startDate = new Date(plan.startDate + "T00:00:00");
  const raceDate = new Date(plan.raceDate + "T00:00:00");
  const phaseNumber = calculatePhaseNumber(startDate, date, raceDate);
  const planDay = jsDayToPlanDay(date.getDay());
  const d = fmtDate(date);

  // Fase activa
  const phaseRows = await sql`
    SELECT id FROM training_phase
    WHERE plan_id = ${plan.id} AND phase_number = ${phaseNumber}
    LIMIT 1
  `;
  if (!phaseRows[0]) return { session: null, exercises: [], done: false, lastSets: {}, todaySets: {} };
  const phaseId = phaseRows[0].id as number;

  // Template de sesión para hoy
  const sessionRows = await sql`
    SELECT id, phase_id, day_of_week, activity_type, title, description,
           duration_min, intensity,
           level_min, level_max, rpm_min, rpm_max, watts_ref, routine_label
    FROM training_session_template
    WHERE phase_id = ${phaseId} AND day_of_week = ${planDay}
    LIMIT 1
  `;
  if (!sessionRows[0]) return { session: null, exercises: [], done: false, lastSets: {}, todaySets: {} };

  const sr = sessionRows[0];
  const session: TrainingSessionTemplate = {
    id: sr.id as number,
    phaseId: sr.phase_id as number,
    dayOfWeek: sr.day_of_week as number,
    activityType: sr.activity_type as TrainingSessionTemplate["activityType"],
    title: sr.title as string,
    description: sr.description as string | null,
    durationMin: sr.duration_min as number | null,
    intensity: sr.intensity as TrainingSessionTemplate["intensity"],
    levelMin: sr.level_min as number | null,
    levelMax: sr.level_max as number | null,
    rpmMin: sr.rpm_min as number | null,
    rpmMax: sr.rpm_max as number | null,
    wattsRef: sr.watts_ref as string | null,
    routineLabel: sr.routine_label as TrainingSessionTemplate["routineLabel"],
  };

  // Ejercicios (si es sesión de pesas)
  let exercises: TrainingExercise[] = [];
  if (session.activityType === "weights") {
    const exRows = await sql`
      SELECT id, session_template_id, sort_order, name, sets, reps_label,
             rest_seconds, muscle_group, notes
      FROM training_exercise
      WHERE session_template_id = ${session.id}
      ORDER BY sort_order
    `;
    exercises = exRows.map((r) => ({
      id: r.id as number,
      sessionTemplateId: r.session_template_id as number,
      sortOrder: r.sort_order as number,
      name: r.name as string,
      sets: r.sets as number,
      repsLabel: r.reps_label as string,
      restSeconds: r.rest_seconds as number | null,
      muscleGroup: r.muscle_group as string | null,
      notes: r.notes as string | null,
    }));
  }

  // ¿Sesión hecha hoy?
  const logRows = await sql`
    SELECT done FROM training_session_log
    WHERE user_id = ${userId} AND date = ${d}
    LIMIT 1
  `;
  const done = (logRows[0]?.done as boolean) ?? false;

  // Última sesión por ejercicio (antes de hoy)
  const lastSetRows = exercises.length > 0
    ? await sql`
        SELECT DISTINCT ON (exercise_id)
               exercise_id, weight_kg, reps_completed, duration_seconds
        FROM training_set_log
        WHERE user_id = ${userId}
          AND date < ${d}
          AND exercise_id = ANY(${exercises.map((e) => e.id)})
        ORDER BY exercise_id, date DESC, set_number DESC
      `
    : [];
  const lastSets: Record<number, LastSet> = {};
  for (const r of lastSetRows) {
    lastSets[r.exercise_id as number] = {
      weightKg: r.weight_kg as number | null,
      repsCompleted: r.reps_completed as number | null,
      durationSeconds: r.duration_seconds as number | null,
    };
  }

  // Sets de hoy por ejercicio
  const todaySetRows = exercises.length > 0
    ? await sql`
        SELECT exercise_id, set_number, weight_kg, reps_completed, duration_seconds
        FROM training_set_log
        WHERE user_id = ${userId} AND date = ${d}
          AND exercise_id = ANY(${exercises.map((e) => e.id)})
        ORDER BY exercise_id, set_number
      `
    : [];
  const todaySets: Record<number, TodaySetEntry[]> = {};
  for (const r of todaySetRows) {
    const eid = r.exercise_id as number;
    if (!todaySets[eid]) todaySets[eid] = [];
    todaySets[eid].push({
      setNumber: r.set_number as number,
      weightKg: r.weight_kg as number | null,
      repsCompleted: r.reps_completed as number | null,
      durationSeconds: r.duration_seconds as number | null,
    });
  }

  return { session, exercises, done, lastSets, todaySets };
}
```

- [ ] **Step 3: Agregar `markSessionDone` y `saveSetLog` al mismo archivo**

```typescript
export async function markSessionDone(
  date: Date,
  sessionTemplateId: number,
  done: boolean
) {
  const userId = await getUserId();
  const d = fmtDate(date);
  await sql`
    INSERT INTO training_session_log (user_id, date, session_template_id, done, completed_at, updated_at)
    VALUES (${userId}, ${d}, ${sessionTemplateId}, ${done},
            ${done ? new Date().toISOString() : null}, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET done = EXCLUDED.done,
                  completed_at = EXCLUDED.completed_at,
                  updated_at = NOW()
  `;
  // Actualizar columna denormalizada en day_state
  await sql`
    INSERT INTO day_state (user_id, date, training_done, updated_at)
    VALUES (${userId}, ${d}, ${done}, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET training_done = EXCLUDED.training_done, updated_at = NOW()
  `;
  revalidatePath("/");
}

export async function saveSetLog(
  date: Date,
  exerciseId: number,
  setNumber: number,
  data: { weightKg?: number | null; repsCompleted?: number | null; durationSeconds?: number | null }
) {
  const userId = await getUserId();
  const d = fmtDate(date);
  await sql`
    INSERT INTO training_set_log
      (user_id, date, exercise_id, set_number, weight_kg, reps_completed, duration_seconds, updated_at)
    VALUES
      (${userId}, ${d}, ${exerciseId}, ${setNumber},
       ${data.weightKg ?? null}, ${data.repsCompleted ?? null},
       ${data.durationSeconds ?? null}, NOW())
    ON CONFLICT (user_id, date, exercise_id, set_number)
    DO UPDATE SET
      weight_kg = EXCLUDED.weight_kg,
      reps_completed = EXCLUDED.reps_completed,
      duration_seconds = EXCLUDED.duration_seconds,
      updated_at = NOW()
  `;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/training.ts
git commit -m "feat: server actions de entrenamiento — plan, sesión, sets, auto-seed"
```

---

## Task 6: Modificar `day.ts` — nueva lógica de Día Ganado

**Files:**
- Modify: `src/app/actions/day.ts`

- [ ] **Step 1: Actualizar `getDayState` para devolver `training_done`**

Localizar la función `getDayState` y reemplazarla:

```typescript
export async function getDayState(date: Date) {
  const userId = await getUserId();
  const d = fmtDate(date);
  const rows = await sql`
    SELECT taa, taa_done, linea_espiritual, training_done FROM day_state
    WHERE user_id = ${userId} AND date = ${d}
    LIMIT 1
  `;
  const row = rows[0];
  return {
    taa: (row?.taa as string | undefined) ?? null,
    taa_done: (row?.taa_done as boolean | undefined) ?? false,
    linea: (row?.linea_espiritual as string | undefined) ?? "",
    training_done: (row?.training_done as boolean | null | undefined) ?? null,
  };
}
```

- [ ] **Step 2: Actualizar `getMonthChain` para la nueva lógica de Día Ganado**

Localizar `getMonthChain` y reemplazarla:

```typescript
export async function getMonthChain(days: number = 30) {
  const userId = await getUserId();
  const rows = await sql`
    SELECT
      date::text as date,
      taa_done AND COALESCE(training_done, TRUE) AS won
    FROM day_state
    WHERE user_id = ${userId}
      AND date >= CURRENT_DATE - (${days} || ' days')::interval
    ORDER BY date ASC
  `;
  return rows.map((r) => ({
    date: r.date as string,
    won: r.won as boolean,
  }));
}
```

> Nota: `COALESCE(training_done, TRUE)` hace que días anteriores a la feature (donde `training_done IS NULL`) sigan contando como "ganados" solo con TAA. Backward compatible.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/day.ts
git commit -m "feat: getDayState devuelve training_done; getMonthChain usa TAA + entrenamiento"
```

---

## Task 7: CSS para `TrainingCard`

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Agregar las clases `.training-*` al final del archivo `globals.css`**

```css
/* ─── TrainingCard ─────────────────────────────────────────────────────────── */
.training-card{ margin-top:22px; border:1px solid var(--panel-bd); background:var(--panel); border-radius:16px; padding:20px; backdrop-filter:blur(8px); }
.training-card.done{ border-color:rgba(45,212,191,.4); box-shadow:0 0 40px -14px rgba(45,212,191,.3); }
.training-card.rest{ border-color:rgba(167,139,250,.25); }
.training-label{ font-size:.7rem; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-dim); font-weight:600; margin-bottom:14px; }
.training-title{ font-size:1.05rem; color:#fff; font-weight:600; line-height:1.3; }
.training-meta{ font-size:.82rem; color:var(--ink-dim); margin-top:5px; line-height:1.4; }
.training-params{ font-size:.8rem; color:var(--cab); margin-top:6px; font-family:ui-monospace,Menlo,monospace; letter-spacing:.02em; }
.training-expand{ background:none; border:none; color:var(--ink-dim); cursor:pointer; font-size:.82rem; margin-top:12px; text-decoration:underline; text-underline-offset:3px; font-family:inherit; padding:0; display:block; }
.training-expand:hover{ color:var(--ink); }
.training-exercises{ margin-top:14px; display:flex; flex-direction:column; gap:8px; }
.training-ex{ border:1px solid var(--panel-bd); border-radius:10px; padding:12px; transition:opacity .15s; }
.training-ex.checked{ opacity:.5; }
.training-ex-head{ display:flex; align-items:flex-start; gap:10px; cursor:pointer; }
.training-ex-check{ width:18px; height:18px; border-radius:5px; border:2px solid var(--ink-dim); flex-shrink:0; margin-top:1px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; transition:all .15s; }
.training-ex-check.on{ background:var(--salud); border-color:var(--salud); color:#03241f; }
.training-ex-name{ font-size:.88rem; font-weight:500; line-height:1.3; }
.training-ex-detail{ font-size:.72rem; color:var(--ink-dim); margin-top:2px; }
.training-ex-inputs{ display:flex; gap:10px; margin-top:10px; flex-wrap:wrap; align-items:flex-end; }
.training-ex-field{ display:flex; flex-direction:column; gap:3px; }
.training-ex-field label{ font-size:.6rem; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); }
.training-ex-field input{ width:80px; background:rgba(255,255,255,.05); border:1px solid var(--panel-bd); color:var(--ink); border-radius:7px; padding:5px 8px; font-size:.85rem; font-family:inherit; outline:none; transition:border-color .15s; }
.training-ex-field input:focus{ border-color:var(--cab); }
.training-ex-prev{ font-size:.66rem; color:var(--ink-faint); margin-top:4px; font-style:italic; }
.training-done-btn{ margin-top:16px; width:100%; background:rgba(45,212,191,.1); color:var(--salud); border:1px solid rgba(45,212,191,.28); border-radius:10px; padding:11px; cursor:pointer; font-weight:700; font-size:.88rem; transition:all .18s; font-family:inherit; }
.training-done-btn:hover{ background:rgba(45,212,191,.18); }
.training-done-btn.on{ background:rgba(45,212,191,.2); border-color:var(--salud); }
.training-badge{ display:flex; align-items:center; gap:8px; font-size:.9rem; color:var(--salud); margin-top:12px; }
.training-badge-undo{ background:none; border:none; color:var(--ink-faint); cursor:pointer; font-size:.72rem; text-decoration:underline; text-underline-offset:2px; font-family:inherit; margin-left:auto; }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "style: clases CSS para TrainingCard"
```

---

## Task 8: Componente `TrainingCard`

**Files:**
- Create: `src/components/TrainingCard.tsx`

- [ ] **Step 1: Crear el componente con tipos e imports**

```typescript
// src/components/TrainingCard.tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import {
  getTrainingCardData,
  markSessionDone,
  saveSetLog,
  type TrainingCardData,
  type TodaySetEntry,
} from "@/app/actions/training";
import type { TrainingExercise } from "@/lib/types";

interface TrainingCardProps {
  date: Date;
  onSessionDone: (done: boolean) => void;
  onSessionLoaded: (hasSession: boolean) => void;
}
```

- [ ] **Step 2: Agregar el estado interno y la carga de datos**

```typescript
export default function TrainingCard({ date, onSessionDone, onSessionLoaded }: TrainingCardProps) {
  const [data, setData] = useState<TrainingCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  // checks locales por ejercicio (optimistas)
  const [exChecks, setExChecks] = useState<Record<number, boolean>>({});
  // inputs de peso/reps por ejercicio: { [exerciseId]: { [setNumber]: {w, r, d} } }
  const [setInputs, setSetInputs] = useState<
    Record<number, Record<number, { w: string; r: string; d: string }>>
  >({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTrainingCardData(date)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        onSessionLoaded(d.session !== null);
        onSessionDone(d.done);
        // Pre-cargar sets de hoy en los inputs
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
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
```

- [ ] **Step 3: Agregar los handlers de acciones**

```typescript
  const toggleDone = useCallback(async () => {
    if (!data?.session) return;
    const next = !data.done;
    setData((d) => d ? { ...d, done: next } : d);
    onSessionDone(next);
    await markSessionDone(date, data.session.id, next);
  }, [data, date, onSessionDone]);

  const toggleExCheck = useCallback((exId: number) => {
    setExChecks((c) => ({ ...c, [exId]: !c[exId] }));
  }, []);

  const handleSetBlur = useCallback(
    async (
      exId: number,
      setNumber: number,
      field: "w" | "r" | "d",
      value: string
    ) => {
      const num = value.trim() === "" ? null : Number(value);
      await saveSetLog(date, exId, setNumber, {
        weightKg: field === "w" ? num : undefined,
        repsCompleted: field === "r" ? num : undefined,
        durationSeconds: field === "d" ? num : undefined,
      });
    },
    [date]
  );

  const updateInput = useCallback(
    (exId: number, setNumber: number, field: "w" | "r" | "d", value: string) => {
      setSetInputs((prev) => ({
        ...prev,
        [exId]: { ...prev[exId], [setNumber]: { ...(prev[exId]?.[setNumber] ?? { w: "", r: "", d: "" }), [field]: value } },
      }));
    },
    []
  );
```

- [ ] **Step 4: Agregar el render completo**

```typescript
  if (loading) {
    return (
      <div className="training-card" style={{ opacity: 0.5 }}>
        <div className="training-label">🚴 Entrenamiento</div>
        <div style={{ color: "var(--ink-dim)", fontSize: ".85rem" }}>Cargando…</div>
      </div>
    );
  }

  if (!data || !data.session) return null;

  const { session, exercises, done } = data;
  const isRest = session.activityType === "rest";
  const isBike = session.activityType === "bike";

  if (isRest) {
    return (
      <div className="training-card rest">
        <div className="training-label">🧘 Descanso activo</div>
        <div className="training-title">{session.title}</div>
        {session.description && <div className="training-meta">{session.description}</div>}
        {session.durationMin && <div className="training-meta">{session.durationMin} min</div>}
      </div>
    );
  }

  return (
    <div className={`training-card${done ? " done" : ""}`}>
      <div className="training-label">🚴 Entrenamiento · {session.activityType === "bike" ? "Bici" : "Pesas"}</div>
      <div className="training-title">{session.title}</div>
      <div className="training-meta">
        {session.durationMin && <>{session.durationMin} min</>}
        {session.intensity && <> · {intensityLabel(session.intensity)}</>}
      </div>

      {isBike && (
        <div className="training-params">
          {session.levelMin != null && `Nivel ${session.levelMin}${session.levelMax && session.levelMax !== session.levelMin ? `–${session.levelMax}` : ""}`}
          {session.rpmMin != null && ` · ${session.rpmMin}${session.rpmMax && session.rpmMax !== session.rpmMin ? `–${session.rpmMax}` : ""} RPM`}
          {session.wattsRef && ` · ${session.wattsRef}`}
        </div>
      )}

      {session.description && <div className="training-meta" style={{ marginTop: 8, fontStyle: "italic" }}>{session.description}</div>}

      {!isBike && exercises.length > 0 && (
        <>
          <button className="training-expand" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "▲ Ocultar ejercicios" : "▶ Ver ejercicios"}
          </button>
          {expanded && (
            <ExerciseList
              exercises={exercises}
              checks={exChecks}
              setInputs={setInputs}
              lastSets={data.lastSets}
              onToggle={toggleExCheck}
              onSetBlur={handleSetBlur}
              onInputChange={updateInput}
            />
          )}
        </>
      )}

      {done ? (
        <div className="training-badge">
          <span>✅ Sesión completada</span>
          <button className="training-badge-undo" onClick={toggleDone}>deshacer</button>
        </div>
      ) : (
        <button className={`training-done-btn${done ? " on" : ""}`} onClick={toggleDone}>
          ✓ Marcar sesión hecha
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Agregar los sub-componentes `ExerciseList` y `ExerciseRow` al mismo archivo**

```typescript
function intensityLabel(intensity: string): string {
  const map: Record<string, string> = {
    low: "Baja", moderate: "Moderada", high: "Alta", very_high: "Muy alta", rest: "Descanso",
  };
  return map[intensity] ?? intensity;
}

function ExerciseList({
  exercises, checks, setInputs, lastSets, onToggle, onSetBlur, onInputChange,
}: {
  exercises: TrainingExercise[];
  checks: Record<number, boolean>;
  setInputs: Record<number, Record<number, { w: string; r: string; d: string }>>;
  lastSets: TrainingCardData["lastSets"];
  onToggle: (id: number) => void;
  onSetBlur: (exId: number, setNumber: number, field: "w" | "r" | "d", value: string) => void;
  onInputChange: (exId: number, setNumber: number, field: "w" | "r" | "d", value: string) => void;
}) {
  return (
    <div className="training-exercises">
      {exercises.map((ex) => (
        <ExerciseRow
          key={ex.id}
          exercise={ex}
          checked={!!checks[ex.id]}
          inputs={setInputs[ex.id] ?? {}}
          lastSet={lastSets[ex.id] ?? null}
          onToggle={() => onToggle(ex.id)}
          onSetBlur={onSetBlur}
          onInputChange={onInputChange}
        />
      ))}
    </div>
  );
}

function ExerciseRow({
  exercise, checked, inputs, lastSet, onToggle, onSetBlur, onInputChange,
}: {
  exercise: TrainingExercise;
  checked: boolean;
  inputs: Record<number, { w: string; r: string; d: string }>;
  lastSet: { weightKg: number | null; repsCompleted: number | null; durationSeconds: number | null } | null;
  onToggle: () => void;
  onSetBlur: (exId: number, setNumber: number, field: "w" | "r" | "d", value: string) => void;
  onInputChange: (exId: number, setNumber: number, field: "w" | "r" | "d", value: string) => void;
}) {
  const isIsometric = exercise.repsLabel.includes("seg");
  const sets = exercise.sets;

  const lastSetText = lastSet
    ? lastSet.weightKg != null
      ? `última vez: ${lastSet.weightKg} kg × ${lastSet.repsCompleted ?? "?"} reps`
      : lastSet.durationSeconds != null
      ? `última vez: ${lastSet.durationSeconds} seg`
      : null
    : "primera vez";

  return (
    <div className={`training-ex${checked ? " checked" : ""}`}>
      <div className="training-ex-head" onClick={onToggle}>
        <div className={`training-ex-check${checked ? " on" : ""}`}>{checked ? "✓" : ""}</div>
        <div>
          <div className="training-ex-name">{exercise.name}</div>
          <div className="training-ex-detail">
            {sets} series · {exercise.repsLabel}
            {exercise.restSeconds && ` · ${exercise.restSeconds} seg descanso`}
          </div>
          {exercise.notes && (
            <div className="training-ex-detail" style={{ color: "var(--ink-faint)", marginTop: 2 }}>
              {exercise.notes}
            </div>
          )}
        </div>
      </div>

      {/* Sets con inputs de peso/reps */}
      {Array.from({ length: sets }, (_, i) => i + 1).map((setNum) => {
        const vals = inputs[setNum] ?? { w: "", r: "", d: "" };
        return (
          <div className="training-ex-inputs" key={setNum} onClick={(e) => e.stopPropagation()}>
            <span style={{ fontSize: ".72rem", color: "var(--ink-faint)", alignSelf: "flex-end", paddingBottom: 6, minWidth: 36 }}>
              Set {setNum}
            </span>
            {!isIsometric ? (
              <>
                <div className="training-ex-field">
                  <label>Peso (kg)</label>
                  <input
                    type="number"
                    value={vals.w}
                    onChange={(e) => onInputChange(exercise.id, setNum, "w", e.target.value)}
                    onBlur={(e) => onSetBlur(exercise.id, setNum, "w", e.target.value)}
                    placeholder="–"
                  />
                </div>
                <div className="training-ex-field">
                  <label>Reps</label>
                  <input
                    type="number"
                    value={vals.r}
                    onChange={(e) => onInputChange(exercise.id, setNum, "r", e.target.value)}
                    onBlur={(e) => onSetBlur(exercise.id, setNum, "r", e.target.value)}
                    placeholder="–"
                  />
                </div>
              </>
            ) : (
              <div className="training-ex-field">
                <label>Seg</label>
                <input
                  type="number"
                  value={vals.d}
                  onChange={(e) => onInputChange(exercise.id, setNum, "d", e.target.value)}
                  onBlur={(e) => onSetBlur(exercise.id, setNum, "d", e.target.value)}
                  placeholder="–"
                />
              </div>
            )}
          </div>
        );
      })}

      {lastSetText && <div className="training-ex-prev">{lastSetText}</div>}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/TrainingCard.tsx
git commit -m "feat: componente TrainingCard — bici, pesas expandible, registro de sets"
```

---

## Task 9: Modificar `Sentinel.tsx`

**Files:**
- Modify: `src/components/Sentinel.tsx`

- [ ] **Step 1: Actualizar el `useEffect` de carga del día para usar `training_done`**

En el `useEffect` que llama a `getDayState`, actualizar la desestructuración:

```typescript
// Reemplazar:
const [dayState, dayChecks, chain, yestState] = ...
setTaaState(dayState.taa ?? "");
setTaaDone(dayState.taa_done);

// Con:
const [dayState, dayChecks, chain, yestState] = ...
setTaaState(dayState.taa ?? "");
setTaaDone(dayState.taa_done);
setTrainingDone(dayState.training_done === true);
```

Agregar el nuevo estado junto a los existentes (cerca de la línea donde está `const [taaDone, setTaaDone] = useState(false)`):

```typescript
const [trainingDone, setTrainingDone] = useState(false);
const [trainingRequired, setTrainingRequired] = useState(false);
```

- [ ] **Step 2: Agregar los callbacks para `TrainingCard` y actualizar `toggleWon`**

Agregar los dos callbacks nuevos:

```typescript
const handleTrainingDone = useCallback((done: boolean) => {
  setTrainingDone(done);
}, []);

const handleSessionLoaded = useCallback((hasSession: boolean) => {
  setTrainingRequired(hasSession);
}, []);
```

Actualizar `toggleWon` para reflejar la nueva lógica — no cambia la función en sí (solo marca `taa_done`), pero los efectos visuales dependen de `dayWon`:

```typescript
// Agregar computed value cerca de los otros useMemo/computed:
const dayWon = taaDone && (trainingDone || !trainingRequired);
```

- [ ] **Step 3: Actualizar la prop `won` en `Hero` y las condiciones del banner**

En la declaración de `Hero` en el JSX de `Sentinel`, agregar `won={dayWon}`:

```typescript
// Reemplazar:
<Hero
  focus={focus}
  sabbath={sabbath}
  taa={taa}
  taaDone={taaDone}
  // ...

// Con:
<Hero
  focus={focus}
  sabbath={sabbath}
  taa={taa}
  taaDone={taaDone}
  won={dayWon}
  // ...
```

En la función `Hero`, agregar `won: boolean` al tipo de props:

```typescript
function Hero(props: {
  focus: ReturnType<typeof getFocus>;
  sabbath: boolean;
  taa: string;
  taaDone: boolean;
  won: boolean;          // ← nuevo
  cycle: Cycle;
  // ...resto igual
```

Dentro del cuerpo de `Hero`, reemplazar el uso de `taaDone` en el banner por `won`:

```typescript
// Reemplazar:
{!sabbath && (taaDone ? (
  <>
    <div className="dg">
      <div className="won-banner">🏆 Día Ganado <small>cerraste tu TAA — esto mueve la aguja</small></div>
    </div>
    <div className="dg" style={{ marginTop: 10 }}>
      <button className="dg-btn on" onClick={props.onToggleWon}><span className="box">✓</span>TAA cumplida</button>
      <button className="dg-edit" onClick={props.onEditTaa}>editar TAA</button>
    </div>
  </>
) : taa ? (
  ...

// Con:
{!sabbath && (props.won ? (
  <>
    <div className="dg">
      <div className="won-banner">🏆 Día Ganado <small>TAA + entrenamiento — esto mueve la aguja</small></div>
    </div>
    <div className="dg" style={{ marginTop: 10 }}>
      <button className="dg-btn on" onClick={props.onToggleWon}><span className="box">✓</span>TAA cumplida</button>
      <button className="dg-edit" onClick={props.onEditTaa}>editar TAA</button>
    </div>
  </>
) : taa ? (
  ...
```

- [ ] **Step 4: Insertar `<TrainingCard>` entre `<Hero>` y `<Spine>` en el return**

```typescript
// Agregar el import al inicio del archivo (junto a los otros imports de componentes):
import TrainingCard from "@/components/TrainingCard";

// En el JSX del return, entre </Hero> y el bloque de Spine:
      <Hero
        // ...props
      />

      <TrainingCard
        date={today}
        onSessionDone={handleTrainingDone}
        onSessionLoaded={handleSessionLoaded}
      />

      {routine === null ? (
        // ...Spine loading state
```

- [ ] **Step 5: Actualizar `Chain` para usar el campo `won` devuelto por `getMonthChain`**

`getMonthChain` ahora devuelve `{ date, won }` en lugar de `{ date, taa_done }`. Actualizar la llamada y el estado:

```typescript
// El tipo del estado chainData cambia de:
const [chainData, setChainData] = useState<{ date: string; taa_done: boolean }[]>([]);
// A:
const [chainData, setChainData] = useState<{ date: string; won: boolean }[]>([]);
```

En el `useEffect`, actualizar cómo se asigna `chainData` (ahora `chain` ya viene con `won`):

```typescript
setChainData(chain);  // sin cambios — chain ahora tiene { date, won }
```

En `toggleWon` (donde se actualiza `chainData` optimísticamente):

```typescript
// Reemplazar:
setChainData((prev) => {
  const existing = prev.findIndex((r) => r.date === ds);
  if (existing >= 0) return prev.map((r, i) => (i === existing ? { ...r, taa_done: next } : r));
  return next ? [...prev, { date: ds, taa_done: true }] : prev;
});

// Con (la cadena refleja dayWon, no solo taaDone):
setChainData((prev) => {
  const newWon = next && (trainingDone || !trainingRequired);
  const existing = prev.findIndex((r) => r.date === ds);
  if (existing >= 0) return prev.map((r, i) => (i === existing ? { ...r, won: newWon } : r));
  return newWon ? [...prev, { date: ds, won: true }] : prev;
});
```

En el componente `Chain`, cambiar `taa_done` por `won` en el `wonMap` y los cells:

```typescript
// Dentro del componente Chain, reemplazar:
const wonMap = new Map(chainData.map((r) => [r.date, r.taa_done]));
// Con:
const wonMap = new Map(chainData.map((r) => [r.date, r.won]));

// Reemplazar:
else status = wonMap.get(dateKey) === true ? "won" : "lost";
if (status === "won") won++;
// Sin cambios aquí — funciona igual con el nuevo campo
```

- [ ] **Step 6: Verificar que compila sin errores**

```bash
npm run build
```

Expected: build exitoso sin errores de TypeScript.

- [ ] **Step 7: Commit final**

```bash
git add src/components/Sentinel.tsx
git commit -m "feat: integrar TrainingCard en Sentinel — Día Ganado = TAA + entrenamiento"
```

---

## Self-review: cobertura del spec

| Requisito del spec | Tarea |
|--------------------|-------|
| 6 tablas SQL nuevas + `training_done` en `day_state` | Task 1 |
| Tipos `TrainingPhase`, `TrainingSessionTemplate`, `TrainingExercise`, `TrainingSetLog` | Task 2 |
| `calculatePhaseNumber`, `jsDayToPlanDay`, `isSabbathDay` | Task 4 |
| Tests de lógica pura | Task 4 |
| Auto-seed del plan completo | Task 5 |
| `getTrainingCardData` (plan + fase + sesión + ejercicios + sets) | Task 5 |
| `markSessionDone` + `saveSetLog` | Task 5 |
| `getDayState` devuelve `training_done` | Task 6 |
| `getMonthChain` usa `TAA AND COALESCE(training_done, TRUE)` | Task 6 |
| CSS para tarjeta | Task 7 |
| TrainingCard: estados cargando / sin sesión / descanso / bici / pesas | Task 8 |
| Ejercicios expandibles con inputs de peso/reps por set | Task 8 |
| "Última vez: X kg" por ejercicio | Task 8 |
| Sentinel: `<TrainingCard>` entre Hero y Spine | Task 9 |
| Día Ganado = `taaDone AND (trainingDone OR !trainingRequired)` | Task 9 |
| Banner "🏆 Día Ganado" usa nueva lógica | Task 9 |
| Chain usa campo `won` calculado server-side | Task 9 |
| Horario: Vie=Bici, Sáb=sin sesión, Dom=Rodada larga | Task 3 (datos seed) |
| Backward compat: días sin `training_done` siguen ganados con solo TAA | Task 6 (`COALESCE`) |
