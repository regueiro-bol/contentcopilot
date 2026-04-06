-- 025 · Oportunidades de actualidad — estacionales + trending
-- =============================================================

CREATE TABLE oportunidades_actualidad (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo          TEXT        NOT NULL CHECK (tipo IN ('estacional', 'trending')),
  titulo        TEXT        NOT NULL,
  keyword       TEXT,
  descripcion   TEXT,
  urgencia      TEXT        CHECK (urgencia IN ('24h', 'semana', 'mes')),
  relevancia    TEXT        CHECK (relevancia IN ('alta', 'media', 'baja')),
  fecha_evento  DATE,
  volumen_est   INTEGER,
  trending_pct  INTEGER,
  contexto      TEXT,
  activa        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS oa_client_id_idx ON oportunidades_actualidad(client_id);
CREATE INDEX IF NOT EXISTS oa_tipo_idx      ON oportunidades_actualidad(tipo);
CREATE INDEX IF NOT EXISTS oa_expires_idx   ON oportunidades_actualidad(expires_at);

ALTER TABLE oportunidades_actualidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_access_oa"
  ON oportunidades_actualidad FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
