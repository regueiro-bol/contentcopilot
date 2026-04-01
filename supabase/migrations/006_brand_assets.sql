-- ============================================================
-- Migración 006: Brand Asset Manager
-- Gestiona los activos de marca por cliente (logos, colores,
-- fuentes, imágenes, anuncios de referencia y plantillas)
-- para alimentar la generación de contenido y creatividades.
-- ============================================================

-- ============================================================
-- 1. ENUMs
-- ============================================================

-- Tipo de activo de marca
CREATE TYPE asset_type AS ENUM (
  'logo',            -- Logotipos (SVG, PNG transparente)
  'color',           -- Paleta de colores (hex, rgb, cmyk)
  'font',            -- Tipografías corporativas (TTF, OTF, WOFF)
  'product_image',   -- Fotografías de producto
  'reference_ad',    -- Anuncios de referencia (creatividades aprobadas)
  'template'         -- Plantillas (Canva, Figma, Word, etc.)
);

-- Intención de publicación — permite filtrar activos por canal
CREATE TYPE publication_intent AS ENUM (
  'organic_informative',  -- Contenido orgánico educativo / informativo
  'organic_brand',        -- Contenido orgánico de marca / storytelling
  'paid_campaign'         -- Creatividades para campañas de pago
);

-- ============================================================
-- 2. Tabla brand_assets
-- ============================================================

CREATE TABLE brand_assets (
  -- Identificación
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL
                              REFERENCES clientes(id) ON DELETE CASCADE,

  -- Tipo y clasificación
  asset_type      asset_type  NOT NULL,

  -- Referencia en Google Drive
  drive_file_id   TEXT        NOT NULL,
  drive_url       TEXT        NOT NULL,

  -- Metadatos del fichero
  file_name       TEXT,
  mime_type       TEXT,

  -- Metadatos semánticos ampliables (colores hex, variantes, tamaños, etc.)
  metadata        JSONB       NOT NULL DEFAULT '{}',

  -- Estado de revisión
  approved        BOOLEAN     NOT NULL DEFAULT false,
  active          BOOLEAN     NOT NULL DEFAULT true,

  -- Timestamps
  synced_at       TIMESTAMPTZ,                          -- Última sync con Drive
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. Índices
-- ============================================================

-- Acceso por cliente (el más frecuente)
CREATE INDEX idx_brand_assets_client_id
  ON brand_assets (client_id);

-- Acceso por tipo de activo
CREATE INDEX idx_brand_assets_asset_type
  ON brand_assets (asset_type);

-- Combinado cliente + tipo (filtros de cobertura y generación)
CREATE INDEX idx_brand_assets_client_type
  ON brand_assets (client_id, asset_type);

-- Búsqueda dentro de metadata (colores hex, etiquetas, etc.)
CREATE INDEX idx_brand_assets_metadata
  ON brand_assets USING gin (metadata);

-- ============================================================
-- 4. Trigger updated_at
-- ============================================================
-- set_updated_at() ya existe desde la migración 002.
-- Se añade el trigger directamente.

CREATE TRIGGER brand_assets_updated_at
  BEFORE UPDATE ON brand_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 5. Vista brand_assets_coverage
-- Calcula el estado de cobertura de activos por cliente.
-- Incluye todos los clientes aunque no tengan activos.
-- ============================================================

CREATE OR REPLACE VIEW brand_assets_coverage AS
WITH stats AS (
  SELECT
    c.id                    AS cliente_id,
    c.nombre                AS cliente_nombre,

    -- Presencia de activos esenciales aprobados y activos
    COALESCE(
      bool_or(ba.asset_type = 'logo'          AND ba.active AND ba.approved),
      false
    )                       AS has_logo,

    COALESCE(
      bool_or(ba.asset_type = 'color'         AND ba.active AND ba.approved),
      false
    )                       AS has_colors,

    COALESCE(
      bool_or(ba.asset_type = 'product_image' AND ba.active AND ba.approved),
      false
    )                       AS has_product_images,

    -- Contadores generales (solo activos no archivados)
    COUNT(ba.id) FILTER (WHERE ba.active)                    AS total_assets,
    COUNT(ba.id) FILTER (WHERE ba.active AND NOT ba.approved) AS pending_review

  FROM clientes c
  LEFT JOIN brand_assets ba ON ba.client_id = c.id
  GROUP BY c.id, c.nombre
)
SELECT
  cliente_id,
  cliente_nombre,
  has_logo,
  has_colors,
  has_product_images,
  total_assets,
  pending_review,

  -- generation_status:
  --   blocked → falta logo aprobado (mínimo imprescindible)
  --   pending → hay logo pero faltan colores (marca incompleta)
  --   ready   → logo + colores aprobados (puede generar)
  CASE
    WHEN NOT has_logo   THEN 'blocked'
    WHEN NOT has_colors THEN 'pending'
    ELSE                     'ready'
  END AS generation_status

FROM stats;

-- ============================================================
-- 6. Row Level Security
-- ============================================================

ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario autenticado puede leer activos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brand_assets'
      AND policyname = 'brand_assets_select'
  ) THEN
    CREATE POLICY "brand_assets_select"
      ON brand_assets
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END
$$;

-- INSERT / UPDATE / DELETE: solo service_role
-- (el service_role elude RLS por defecto en Supabase;
--  estas políticas lo hacen explícito y documentado)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brand_assets'
      AND policyname = 'brand_assets_insert'
  ) THEN
    CREATE POLICY "brand_assets_insert"
      ON brand_assets
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brand_assets'
      AND policyname = 'brand_assets_update'
  ) THEN
    CREATE POLICY "brand_assets_update"
      ON brand_assets
      FOR UPDATE
      TO service_role
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brand_assets'
      AND policyname = 'brand_assets_delete'
  ) THEN
    CREATE POLICY "brand_assets_delete"
      ON brand_assets
      FOR DELETE
      TO service_role
      USING (true);
  END IF;
END
$$;
