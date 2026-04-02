-- =====================================================================
-- Calculadora de costes — ContentCopilot
-- Registra el coste de cada operación IA: Claude, embeddings RAG,
-- imágenes FLUX, etc.
-- =====================================================================

CREATE TABLE IF NOT EXISTS registros_costes (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz   NOT NULL DEFAULT now(),

  -- Contexto de la operación
  contenido_id    uuid          REFERENCES contenidos(id) ON DELETE SET NULL,
  proyecto_id     uuid          REFERENCES proyectos(id)  ON DELETE SET NULL,

  -- Tipo de operación: borrador | copiloto | revision | brief_seo |
  --   prompt_imagen | rag_embedding | imagen_flux | ad_creative
  tipo_operacion  text          NOT NULL,

  -- Agente / servicio que generó el coste
  agente          text          NOT NULL DEFAULT 'claude_api',
  modelo          text,

  -- Tokens (solo para Claude / embeddings)
  tokens_input    integer       NOT NULL DEFAULT 0,
  tokens_output   integer       NOT NULL DEFAULT 0,

  -- Unidades (imágenes generadas, chunks, etc.)
  unidades        integer       NOT NULL DEFAULT 1,

  -- Coste en USD con 6 decimales para máxima precisión
  coste_usd       numeric(12,6) NOT NULL DEFAULT 0,

  -- Metadatos adicionales opcionales (ej: nombre del documento RAG)
  metadatos       jsonb
);

-- Índices para las queries más frecuentes
CREATE INDEX IF NOT EXISTS idx_registros_costes_contenido ON registros_costes(contenido_id);
CREATE INDEX IF NOT EXISTS idx_registros_costes_proyecto  ON registros_costes(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_registros_costes_fecha     ON registros_costes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registros_costes_tipo      ON registros_costes(tipo_operacion);

-- ─── Vista: costes agregados por contenido ────────────────────────────────────
-- Usada en el badge de coste del detalle del contenido y en el dashboard.

CREATE OR REPLACE VIEW vista_costes_contenido AS
SELECT
  c.id                                                             AS contenido_id,
  c.titulo,
  c.estado,
  c.cliente_id,
  c.proyecto_id,
  c.created_at                                                     AS contenido_created_at,

  COALESCE(SUM(rc.coste_usd), 0)::numeric(12,6)                   AS coste_total,

  -- Coste de texto: todo lo que no es imágenes ni embeddings
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion NOT IN ('imagen_flux','ad_creative','rag_embedding')
    THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                                             AS coste_texto,

  -- Coste de imágenes (FLUX)
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion IN ('imagen_flux','ad_creative')
    THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                                             AS coste_imagenes,

  -- Coste de embeddings RAG
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion = 'rag_embedding'
    THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                                             AS coste_rag,

  COALESCE(SUM(rc.tokens_input),  0)                               AS tokens_input_total,
  COALESCE(SUM(rc.tokens_output), 0)                               AS tokens_output_total,
  COUNT(rc.id)                                                     AS num_operaciones

FROM contenidos c
LEFT JOIN registros_costes rc ON rc.contenido_id = c.id
GROUP BY c.id, c.titulo, c.estado, c.cliente_id, c.proyecto_id, c.created_at;
