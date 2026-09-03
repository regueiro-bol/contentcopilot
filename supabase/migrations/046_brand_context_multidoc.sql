-- ─────────────────────────────────────────────────────────────────────────────
-- 046 — brand_context multi-documento
--
-- El extractor de brand assets pasa a procesar TODOS los brand books activos
-- del cliente y fusionar los resultados. Trazabilidad:
--   · source_files : array JSONB de { drive_file_id, file_name } con todos los
--                    documentos que alimentaron el contexto (source_file_id se
--                    conserva por compatibilidad con el primero procesado)
--   · model        : modelo(s) de IA usados en la extracción
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE brand_context
  ADD COLUMN IF NOT EXISTS source_files JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS model TEXT;

COMMENT ON COLUMN brand_context.source_files IS
  'Documentos procesados para generar el contexto: [{drive_file_id, file_name}]';
COMMENT ON COLUMN brand_context.model IS
  'Modelo(s) de IA usados en la última extracción (ej. gemini-2.5-flash)';
