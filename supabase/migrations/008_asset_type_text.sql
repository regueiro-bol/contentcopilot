-- ============================================================
-- Migración 008 — asset_type: ENUM → TEXT + CHECK constraint
-- ============================================================
-- El ENUM causaba problemas de stale cache en PostgREST tras el
-- DROP TYPE + RENAME de la migración 007 (OID cambiado).
-- TEXT + CHECK es equivalente funcionalmente, sin caché de tipos.
-- ============================================================

-- 1. Eliminar la vista que referencia la columna
DROP VIEW IF EXISTS brand_assets_coverage;

-- 2. Convertir la columna a TEXT (preserva todos los valores existentes)
ALTER TABLE brand_assets
  ALTER COLUMN asset_type TYPE TEXT
  USING asset_type::text;

-- 3. Añadir CHECK constraint con los valores válidos
ALTER TABLE brand_assets
  ADD CONSTRAINT brand_assets_asset_type_check
  CHECK (asset_type IN ('logo', 'brand_book', 'product_image', 'reference_ad', 'template'));

-- 4. Eliminar el ENUM ya innecesario
DROP TYPE IF EXISTS asset_type;

-- 5. Recrear la vista (sin referencias al ENUM)
CREATE VIEW brand_assets_coverage AS
WITH asset_flags AS (
  SELECT
    ba.client_id,
    COALESCE(bool_or(ba.asset_type = 'logo'          AND ba.active AND ba.approved), false) AS has_logo,
    COALESCE(bool_or(ba.asset_type = 'brand_book'    AND ba.active AND ba.approved), false) AS has_brand_book,
    COALESCE(bool_or(ba.asset_type = 'product_image' AND ba.active AND ba.approved), false) AS has_product_images,
    COUNT(ba.id) FILTER (WHERE ba.active)                    AS total_assets,
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
    WHEN NOT COALESCE(af.has_logo, false) THEN 'blocked'
    WHEN (bc.processed_at IS NULL)        THEN 'pending'
    ELSE 'ready'
  END                                       AS generation_status
FROM clientes c
LEFT JOIN asset_flags   af ON af.client_id = c.id
LEFT JOIN brand_context bc ON bc.client_id = c.id;
