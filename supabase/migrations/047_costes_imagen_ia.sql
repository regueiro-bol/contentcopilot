-- ─────────────────────────────────────────────────────────────────────────────
-- 047 — coste 'imagen_ia' en las vistas de costes
--
-- El selector de modelo de imagen (Fase 1) registra las imágenes destacadas con
-- tipo_operacion = 'imagen_ia' (genérico: FLUX / Seedream / Imagen) en lugar del
-- antiguo 'imagen_flux'. Esta migración añade 'imagen_ia' a los buckets de coste
-- de imagen de ambas vistas, MANTENIENDO 'imagen_flux' para no perder el
-- histórico de costes ya registrado.
--
-- Solo cambian las condiciones CASE WHEN (buckets imagen/texto). Las columnas de
-- salida, su orden y tipos son idénticos a la definición original → CREATE OR
-- REPLACE VIEW es seguro (no altera el esquema de la vista).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Vista por contenido (badge de coste del detalle + dashboard) ──────────────
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
    CASE WHEN rc.tipo_operacion NOT IN ('imagen_ia','imagen_flux','ad_creative','rag_embedding')
    THEN rc.coste_usd ELSE 0 END
  ), 0)::numeric(12,6)                                             AS coste_texto,

  -- Coste de imágenes (IA: FLUX/Seedream/Imagen + ad_creative)
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion IN ('imagen_ia','imagen_flux','ad_creative')
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

-- ── Vista por cliente (dashboard mensual) ─────────────────────────────────────
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

  -- Imágenes y vídeos IA (FLUX/Seedream/Imagen + ad_creative + vídeos)
  COALESCE(SUM(
    CASE WHEN rc.tipo_operacion IN
      ('imagen_ia','imagen_flux','ad_creative','video_reel','video_story')
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
