-- El Centinela — schema Postgres
-- Ejecutar una vez en la consola de Vercel Postgres (tab "Data" → "Query")

-- Estado diario (TAA + Día Ganado por fecha)
CREATE TABLE IF NOT EXISTS day_state (
  user_id          TEXT        NOT NULL,
  date             DATE        NOT NULL,          -- YYYY-MM-DD local
  taa              TEXT,                          -- texto libre de la TAA del día
  taa_done         BOOLEAN     NOT NULL DEFAULT FALSE,
  linea_espiritual TEXT,                          -- línea espiritual del cierre, por fecha
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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

-- Rutina editable por ritual (días de semana + cada N semanas). Reemplaza routine_config.
CREATE TABLE IF NOT EXISTS routine_ritual (
  user_id        TEXT        NOT NULL,
  id             TEXT        NOT NULL,          -- estable; ids semilla (higiene…) o cust-<rand>
  label          TEXT        NOT NULL,
  icon           TEXT        NOT NULL,
  pillar         TEXT        NOT NULL,
  phase          TEXT        NOT NULL,          -- 'manana' | 'tarde' | 'noche'
  start_min      SMALLINT,
  end_min        SMALLINT,
  time           TEXT,
  hard           BOOLEAN     NOT NULL DEFAULT FALSE,
  optional       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_taa         BOOLEAN     NOT NULL DEFAULT FALSE,
  days           SMALLINT[]  NOT NULL,          -- {0=Dom .. 6=Sáb}
  interval_weeks SMALLINT    NOT NULL DEFAULT 1,
  anchor_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  sort_order     SMALLINT    NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS user_pillar (
  user_id        TEXT        NOT NULL,
  id             TEXT        NOT NULL,
  label          TEXT        NOT NULL,
  color          TEXT        NOT NULL,
  sort_order     SMALLINT    NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
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

CREATE TABLE IF NOT EXISTS push_subscription (
  user_id        TEXT        NOT NULL,
  endpoint       TEXT        NOT NULL,
  p256dh         TEXT        NOT NULL,
  auth           TEXT        NOT NULL,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (endpoint)
);

CREATE TABLE IF NOT EXISTS notification_preference (
  user_id          TEXT        NOT NULL,
  timezone         TEXT        NOT NULL DEFAULT 'America/Santiago',
  taa_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  taa_time         TEXT        NOT NULL DEFAULT '08:00',
  cierre_enabled   BOOLEAN     NOT NULL DEFAULT TRUE,
  cierre_time      TEXT        NOT NULL DEFAULT '21:30',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS notification_delivery (
  user_id          TEXT        NOT NULL,
  local_date       DATE        NOT NULL,
  kind             TEXT        NOT NULL,
  delivered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, local_date, kind)
);
