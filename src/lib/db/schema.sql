-- El Centinela — schema Postgres
-- Ejecutar una vez en la consola de Vercel Postgres (tab "Data" → "Query")

-- Estado diario (TAA + Día Ganado por fecha)
CREATE TABLE IF NOT EXISTS day_state (
  user_id    TEXT        NOT NULL,
  date       DATE        NOT NULL,          -- YYYY-MM-DD local
  taa        TEXT,                          -- texto libre de la TAA del día
  taa_done   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

-- Checks de rituales (spine tasks)
CREATE TABLE IF NOT EXISTS task_check (
  user_id    TEXT        NOT NULL,
  date       DATE        NOT NULL,
  task_id    TEXT        NOT NULL,          -- mismo ID que en rituals.ts
  checked    BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date, task_id)
);

-- Rutina personalizada por día de semana (override del DEFAULT_ROUTINE)
CREATE TABLE IF NOT EXISTS routine_config (
  user_id    TEXT        NOT NULL,
  dow        SMALLINT    NOT NULL,          -- 0=Dom .. 6=Sáb
  rituals    JSONB       NOT NULL,          -- array de Ritual[]
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, dow)
);

-- Compromisos de sprint (3 por semana)
CREATE TABLE IF NOT EXISTS sprint_commitment (
  user_id    TEXT        NOT NULL,
  iso_year   SMALLINT    NOT NULL,
  iso_week   SMALLINT    NOT NULL,
  slot       SMALLINT    NOT NULL CHECK (slot IN (1,2,3)),
  text       TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, iso_year, iso_week, slot)
);

-- Ciclo menstrual de Michelle (punto de inicio de cada ciclo)
CREATE TABLE IF NOT EXISTS cycle_log (
  user_id          TEXT        NOT NULL,
  cycle_start_date DATE        NOT NULL,   -- primer día del período
  cycle_length     SMALLINT    NOT NULL DEFAULT 28,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, cycle_start_date)
);
