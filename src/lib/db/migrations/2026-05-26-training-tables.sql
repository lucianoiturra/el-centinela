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
