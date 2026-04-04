-- ============================================================
-- 014_gsc_keywords_columns.sql
-- Columnas GSC para enriquecer el research de keywords
-- ============================================================

ALTER TABLE keywords ADD COLUMN IF NOT EXISTS gsc_clicks INTEGER;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS gsc_impressions INTEGER;
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS gsc_ctr NUMERIC(6,4);
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS gsc_position NUMERIC(6,2);
ALTER TABLE keywords ADD COLUMN IF NOT EXISTS gsc_opportunity TEXT
  CHECK (gsc_opportunity IN ('quick_win', 'existing', 'new'));

COMMENT ON COLUMN keywords.gsc_clicks IS 'Clicks reales de GSC (últimos 90 días)';
COMMENT ON COLUMN keywords.gsc_impressions IS 'Impresiones reales de GSC (últimos 90 días)';
COMMENT ON COLUMN keywords.gsc_ctr IS 'CTR real de GSC';
COMMENT ON COLUMN keywords.gsc_position IS 'Posición media en GSC';
COMMENT ON COLUMN keywords.gsc_opportunity IS 'existing (pos<=3), quick_win (pos 4-20), new (no en GSC)';

NOTIFY pgrst, 'reload schema';
