-- ============================================================
-- Migración 028 — Estado del proyecto (activo / archivado)
-- ============================================================
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo'
  CHECK (estado IN ('activo', 'archivado'));

CREATE INDEX IF NOT EXISTS proyectos_estado_idx ON proyectos(estado);
