-- Infraestructura de push notifications reales.
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
