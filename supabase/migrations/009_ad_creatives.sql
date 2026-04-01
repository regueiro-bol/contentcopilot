-- ============================================================
-- Migración 009 — Tabla ad_creatives
-- ============================================================
-- Almacena los creativos generados (copy + imagen) para cada
-- cliente. Cada fila es una pieza: un formato, una variación
-- de copy y una imagen generada por IA.
-- ============================================================

CREATE TABLE ad_creatives (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

  -- Contexto de generación
  brief              TEXT        NOT NULL,
  publication_intent TEXT        NOT NULL
                     CHECK (publication_intent IN (
                       'organic_informative',
                       'organic_brand',
                       'paid_campaign'
                     )),
  source_content     TEXT,           -- texto de post fuente (opcional)

  -- Copia generada por Claude (JSONB para flexibilidad por tipo)
  -- organic_informative: { headline, caption }
  -- organic_brand:       { headline, tagline }
  -- paid_campaign:       { headline, body, cta }
  copy               JSONB       NOT NULL DEFAULT '{}',

  -- Imagen generada por Fal.ai
  image_url          TEXT,           -- null si la generación falló
  format             TEXT        NOT NULL
                     CHECK (format IN ('1x1', '9x16', '1.91x1')),
  model_used         TEXT,           -- endpoint de Fal.ai utilizado
  variation_index    INTEGER     NOT NULL DEFAULT 0,  -- 0-based dentro del batch

  -- Estado de revisión
  status             TEXT        NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'approved', 'rejected')),

  -- Metadatos de generación (semilla, duración, error si aplica)
  generation_meta    JSONB       NOT NULL DEFAULT '{}',

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX ad_creatives_client_id_idx    ON ad_creatives(client_id);
CREATE INDEX ad_creatives_status_idx       ON ad_creatives(status);
CREATE INDEX ad_creatives_intent_idx       ON ad_creatives(publication_intent);
CREATE INDEX ad_creatives_client_status_idx ON ad_creatives(client_id, status);

-- Trigger updated_at
CREATE TRIGGER ad_creatives_updated_at
  BEFORE UPDATE ON ad_creatives
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_creatives_select_authenticated"
  ON ad_creatives FOR SELECT TO authenticated USING (true);

CREATE POLICY "ad_creatives_insert_service_role"
  ON ad_creatives FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "ad_creatives_update_service_role"
  ON ad_creatives FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ad_creatives_delete_service_role"
  ON ad_creatives FOR DELETE TO service_role USING (true);
