-- Campos para enlaces internos (con anchor+url pares) y fuentes de competencia.
-- Los mismos datos se almacenan también dentro del JSONB `brief` (BriefSEO).
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS enlaces_internos JSONB    DEFAULT '[]';
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS fuentes_competencia TEXT[] DEFAULT '{}';
