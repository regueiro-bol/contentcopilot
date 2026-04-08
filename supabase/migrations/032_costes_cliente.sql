-- =====================================================================
-- Sprint 5: Costes por cliente
-- Amplía registros_costes con cliente_id y crea vista agregada.
-- =====================================================================

-- ── 1. Añadir columna cliente_id a registros_costes ──────────────────
ALTER TABLE registros_costes
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_registros_costes_cliente
  ON registros_costes(cliente_id);

-- ── 2. Vista de costes agregados por cliente y mes ───────────────────
CREATE OR REPLACE VIEW vista_costes_cliente AS
SELECT
  c.id                                          AS cliente_id,
  c.nombre                                      AS cliente_nombre,
  DATE_TRUNC('month', rc.created_at)            AS mes,

  COALESCE(SUM(rc.coste_usd), 0)::numeric(12,6) AS coste_total,

  -- Claude API (borradores, copiloto, revisiones, humanizador,
  --             brief_seo, inspiracion, estrategia, georadar_claude)
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion IN (
      'borrador','copiloto','revision','humanizacion',
      'brief_seo','inspiracion','estrategia_claude','georadar_claude'
    ) THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                           AS coste_claude,

  -- GPT-4o
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion IN ('georadar_gpt4')
    THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                           AS coste_gpt4,

  -- Google Gemini
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion IN ('georadar_gemini')
    THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                           AS coste_gemini,

  -- Perplexity
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion IN ('georadar_perplexity')
    THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                           AS coste_perplexity,

  -- Imágenes y vídeos FLUX
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion IN
      ('imagen_flux','ad_creative','video_reel','video_story')
    THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                           AS coste_imagenes,

  -- APIs externas (SerpApi + DataForSEO)
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion IN ('serpapi','datasorseo')
    THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                           AS coste_apis_externas,

  -- GEORadar total (todos los LLMs)
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion IN (
      'georadar_claude','georadar_gpt4',
      'georadar_gemini','georadar_perplexity'
    ) THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                           AS coste_georadar,

  COUNT(DISTINCT rc.contenido_id)               AS contenidos_procesados,
  COUNT(rc.id)                                  AS total_operaciones

FROM clientes c
LEFT JOIN registros_costes rc
  ON (rc.cliente_id = c.id
      OR (rc.cliente_id IS NULL
          AND rc.contenido_id IN (
            SELECT id FROM contenidos WHERE cliente_id = c.id
          )))
GROUP BY c.id, c.nombre, DATE_TRUNC('month', rc.created_at);
