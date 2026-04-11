-- ─────────────────────────────────────────────────────────────────────────────
-- 038 · Social strategy versioning + client validation
-- ─────────────────────────────────────────────────────────────────────────────

-- Tabla de versiones de estrategia
CREATE TABLE IF NOT EXISTS social_strategy_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  version_number INTEGER     NOT NULL DEFAULT 1,
  status         TEXT        NOT NULL DEFAULT 'activa' CHECK (status IN (
    'activa',     -- en uso actualmente
    'validada',   -- aprobada por el cliente
    'descartada'  -- rechazada, archivada
  )),
  label          TEXT,        -- ej: "v1 — Borrador inicial", "v2 — Revisión cliente"
  notes          TEXT,        -- notas internas sobre esta versión
  snapshot       JSONB,       -- copia completa de las 6 fases en el momento de crear versión
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  DEFAULT NOW(),
  validated_at   TIMESTAMPTZ,
  validated_by   TEXT,
  UNIQUE(client_id, version_number)
);

-- Campos de validación y versión en social_audit_synthesis
ALTER TABLE social_audit_synthesis
  ADD COLUMN IF NOT EXISTS client_validated    BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_version     INTEGER     DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision_notes      TEXT;

-- Tabla de revisiones del cliente
CREATE TABLE IF NOT EXISTS social_strategy_revisions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  version_number        INTEGER     NOT NULL DEFAULT 1,
  revision_instructions TEXT        NOT NULL,  -- lo que escribió el estratega
  affected_phases       TEXT[],                -- qué fases se regeneraron
  status                TEXT        DEFAULT 'pendiente' CHECK (status IN (
    'pendiente', 'aplicada', 'descartada'
  )),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  applied_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_strategy_versions_client
  ON social_strategy_versions(client_id);

CREATE INDEX IF NOT EXISTS idx_strategy_revisions_client
  ON social_strategy_revisions(client_id);

NOTIFY pgrst, 'reload schema';
