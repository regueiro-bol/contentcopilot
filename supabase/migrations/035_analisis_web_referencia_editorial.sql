-- 035 · Añadir referencia_editorial_id a analisis_web
-- Permite vincular un análisis a un competidor editorial (referencias_externas)
-- en lugar de (o además de) un competidor publicitario (competitors)
ALTER TABLE analisis_web
  ADD COLUMN IF NOT EXISTS referencia_editorial_id UUID
    REFERENCES referencias_externas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS analisis_web_referencia_editorial_idx
  ON analisis_web(referencia_editorial_id);
