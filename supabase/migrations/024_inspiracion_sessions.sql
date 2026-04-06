-- 024 · Sesiones de inspiración — Fase 0 del módulo Estrategia
-- ==============================================================

CREATE TABLE inspiracion_sessions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  status                  TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'running', 'completed', 'error')),
  config                  JSONB       NOT NULL DEFAULT '{}',
  resultado               JSONB       NOT NULL DEFAULT '{}',
  oportunidades_marcadas  JSONB       NOT NULL DEFAULT '[]',
  error_message           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ins_client_id_idx  ON inspiracion_sessions(client_id);
CREATE INDEX IF NOT EXISTS ins_status_idx     ON inspiracion_sessions(status);
CREATE INDEX IF NOT EXISTS ins_created_at_idx ON inspiracion_sessions(created_at DESC);

ALTER TABLE inspiracion_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_access_ins"
  ON inspiracion_sessions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
