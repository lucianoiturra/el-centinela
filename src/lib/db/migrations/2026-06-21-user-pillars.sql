-- Catalogo editable de pilares por usuario.
CREATE TABLE IF NOT EXISTS user_pillar (
  user_id        TEXT        NOT NULL,
  id             TEXT        NOT NULL,
  label          TEXT        NOT NULL,
  color          TEXT        NOT NULL,
  sort_order     SMALLINT    NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);
