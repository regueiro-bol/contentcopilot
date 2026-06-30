-- Columna para guardar el texto anterior al regenerar un borrador.
-- Solo persiste la última versión previa (no es un historial completo).
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS texto_anterior TEXT;
