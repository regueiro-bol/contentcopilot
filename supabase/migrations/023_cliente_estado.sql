-- 023 · Estado de cliente: activo / inactivo / archivado
-- =====================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activo'
  CHECK (estado IN ('activo', 'inactivo', 'archivado'));

-- Migrar datos existentes desde el campo booleano 'activo'
UPDATE clientes SET estado = 'activo'   WHERE activo = true  AND (estado IS NULL OR estado = 'activo');
UPDATE clientes SET estado = 'inactivo' WHERE activo = false AND (estado IS NULL OR estado = 'activo');
