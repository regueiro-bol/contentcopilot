-- ============================================================
-- 041_strategy_proyecto_id.sql
-- Sprint 1: Link keyword_research_sessions to proyectos
-- ============================================================

ALTER TABLE keyword_research_sessions
  ADD COLUMN IF NOT EXISTS proyecto_id UUID REFERENCES proyectos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS krs_proyecto_id_idx
  ON keyword_research_sessions(proyecto_id);

NOTIFY pgrst, 'reload schema';
