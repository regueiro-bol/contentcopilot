-- ============================================================
-- Migración 007 — Brand Context + Refactor asset_type ENUM
-- ============================================================
-- Cambios:
--   1. Elimina 'color' y 'font' del ENUM asset_type
--   2. Añade 'brand_book' al ENUM asset_type
--   3. Crea tabla brand_context (colores, tipografía, tono…
--      extraídos del brand book por el procesador de IA)
--   4. Actualiza la vista brand_assets_coverage para reflejar
--      la nueva estructura (has_brand_book, has_context en vez
--      de has_colors; generation_status basado en brand_context)
-- ============================================================

-- ── 1. Eliminar la vista que depende de los valores del ENUM ──────────────────
DROP VIEW IF EXISTS brand_assets_coverage;

-- ── 2. Reemplazar el ENUM asset_type ─────────────────────────────────────────
-- PostgreSQL no permite DROP VALUE en un ENUM con ALTER TYPE,
-- así que creamos uno nuevo, migramos la columna y renombramos.

CREATE TYPE asset_type_v2 AS ENUM (
  'logo',
  'brand_book',
  'product_image',
  'reference_ad',
  'template'
);

-- Cambiar la columna (no hay filas con 'color' ni 'font', operación segura)
ALTER TABLE brand_assets
  ALTER COLUMN asset_type TYPE asset_type_v2
  USING asset_type::text::asset_type_v2;

-- Limpiar el índice que referenciaba el tipo antiguo y
-- actualizar índices que dependen del tipo de columna
DROP INDEX IF EXISTS brand_assets_asset_type_idx;
DROP INDEX IF EXISTS brand_assets_client_asset_idx;

DROP TYPE asset_type;
ALTER TYPE asset_type_v2 RENAME TO asset_type;

-- Recrear índices
CREATE INDEX brand_assets_asset_type_idx   ON brand_assets(asset_type);
CREATE INDEX brand_assets_client_asset_idx ON brand_assets(client_id, asset_type);

-- ── 3. Tabla brand_context ────────────────────────────────────────────────────
CREATE TABLE brand_context (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

  -- Datos de marca extraídos del brand book
  colors         JSONB       NOT NULL DEFAULT '[]',
  typography     JSONB       NOT NULL DEFAULT '[]',
  tone_of_voice  TEXT,
  style_keywords TEXT[],
  restrictions   TEXT,
  raw_summary    TEXT,

  -- Control de proceso
  processed_at   TIMESTAMPTZ,
  source_file_id TEXT,          -- drive_file_id del brand book procesado

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un único registro de contexto por cliente
CREATE UNIQUE INDEX brand_context_client_id_idx ON brand_context(client_id);

-- Trigger updated_at
CREATE TRIGGER brand_context_updated_at
  BEFORE UPDATE ON brand_context
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE brand_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_context_select_authenticated"
  ON brand_context FOR SELECT TO authenticated USING (true);

CREATE POLICY "brand_context_insert_service_role"
  ON brand_context FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "brand_context_update_service_role"
  ON brand_context FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ── 4. Recrear vista brand_assets_coverage ────────────────────────────────────
CREATE VIEW brand_assets_coverage AS
WITH asset_flags AS (
  SELECT
    ba.client_id,
    COALESCE(bool_or(ba.asset_type = 'logo'          AND ba.active AND ba.approved), false) AS has_logo,
    COALESCE(bool_or(ba.asset_type = 'brand_book'    AND ba.active AND ba.approved), false) AS has_brand_book,
    COALESCE(bool_or(ba.asset_type = 'product_image' AND ba.active AND ba.approved), false) AS has_product_images,
    COUNT(ba.id) FILTER (WHERE ba.active)                AS total_assets,
    COUNT(ba.id) FILTER (WHERE ba.active AND NOT ba.approved) AS pending_review
  FROM brand_assets ba
  GROUP BY ba.client_id
)
SELECT
  c.id                                      AS cliente_id,
  c.nombre                                  AS cliente_nombre,
  COALESCE(af.has_logo,           false)    AS has_logo,
  COALESCE(af.has_brand_book,     false)    AS has_brand_book,
  COALESCE(af.has_product_images, false)    AS has_product_images,
  (bc.processed_at IS NOT NULL)             AS has_context,
  COALESCE(af.total_assets,       0)        AS total_assets,
  COALESCE(af.pending_review,     0)        AS pending_review,
  CASE
    WHEN NOT COALESCE(af.has_logo, false)        THEN 'blocked'
    WHEN (bc.processed_at IS NULL)               THEN 'pending'
    ELSE 'ready'
  END                                       AS generation_status
FROM clientes c
LEFT JOIN asset_flags  af ON af.client_id = c.id
LEFT JOIN brand_context bc ON bc.client_id = c.id;
