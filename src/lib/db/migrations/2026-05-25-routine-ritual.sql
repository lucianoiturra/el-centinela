-- Migración 2026-05-25: rutina editable por ritual + línea espiritual del cierre.
-- Aditiva e idempotente. Correr una vez en Neon (SQL Editor) o vía script.

-- Rutina editable por ritual (reemplaza routine_config)
CREATE TABLE IF NOT EXISTS routine_ritual (
  user_id        TEXT        NOT NULL,
  id             TEXT        NOT NULL,
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

-- Línea espiritual del cierre nocturno, por fecha
ALTER TABLE day_state ADD COLUMN IF NOT EXISTS linea_espiritual TEXT;

-- routine_config queda obsoleta (nunca tuvo datos ni uso en runtime)
DROP TABLE IF EXISTS routine_config;
