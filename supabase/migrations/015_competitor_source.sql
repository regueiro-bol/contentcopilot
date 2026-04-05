-- ============================================================
-- 015_competitor_source.sql
-- Tracking de keywords descubiertas via competidores
-- ============================================================

ALTER TABLE keywords ADD COLUMN IF NOT EXISTS competitor_source TEXT;
COMMENT ON COLUMN keywords.competitor_source IS 'Dominio del competidor que rankea esta keyword (null si es propia)';

NOTIFY pgrst, 'reload schema';
