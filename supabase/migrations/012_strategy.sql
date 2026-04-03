-- ============================================================
-- Migración 012: Módulo Estrategia de Contenidos
-- ContentCopilot — Sprint 1
--
-- Tablas:
--   keyword_research_sessions  — sesión de investigación de keywords
--   keywords                   — keywords descubiertas + métricas
--   content_maps               — mapa de contenidos generado
--   content_map_items          — artículos individuales del mapa
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- keyword_research_sessions
-- Representa una sesión completa de investigación de keywords
-- para un cliente. Puede estar en curso o completada.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keyword_research_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status       TEXT        NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'researching', 'clustering', 'completed', 'error')),

  -- Nombre descriptivo de la sesión
  nombre       TEXT        NOT NULL DEFAULT '',

  -- Configuración de la investigación (locationCode, languageCode, etc.)
  config       JSONB       NOT NULL DEFAULT '{}',
  -- Ej: { "locationCode": 2724, "languageCode": "es", "maxKeywords": 500 }

  -- Tópicos semilla introducidos por el usuario
  seed_topics  JSONB       NOT NULL DEFAULT '[]',
  -- Ej: ["academia oposiciones", "preparar oposiciones"]

  -- Resumen de resultados (se rellena al completar)
  resumen      JSONB       NOT NULL DEFAULT '{}'
  -- Ej: { "total_keywords": 324, "clusters": 8, "avg_difficulty": 42 }
);

CREATE INDEX IF NOT EXISTS krs_client_id_idx    ON keyword_research_sessions(client_id);
CREATE INDEX IF NOT EXISTS krs_status_idx       ON keyword_research_sessions(status);
CREATE INDEX IF NOT EXISTS krs_created_at_idx   ON keyword_research_sessions(created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'krs_updated_at'
  ) THEN
    CREATE TRIGGER krs_updated_at
      BEFORE UPDATE ON keyword_research_sessions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE keyword_research_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_krs" ON keyword_research_sessions
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);


-- ─────────────────────────────────────────────────────────────
-- keywords
-- Keywords individuales descubiertas en una sesión,
-- con todas sus métricas SEO y clasificación editorial.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keywords (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES keyword_research_sessions(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- La keyword en sí
  keyword      TEXT        NOT NULL,

  -- Métricas DataForSEO
  volume             INTEGER,      -- búsquedas/mes
  keyword_difficulty INTEGER,      -- 0–100
  cpc                NUMERIC(8,2), -- coste por clic en EUR/USD
  competition        NUMERIC(5,4), -- 0.0–1.0
  competition_level  TEXT          CHECK (competition_level IN ('LOW', 'MEDIUM', 'HIGH')),
  search_intent      TEXT          CHECK (search_intent IN ('informational','transactional','commercial','navigational')),

  -- Datos de tendencia mensuales
  monthly_searches   JSONB,        -- [{ year, month, search_volume }]

  -- Clasificación editorial (se rellena en la fase de clustering)
  cluster_name  TEXT,              -- nombre del cluster temático
  funnel_stage  TEXT CHECK (funnel_stage IN ('tofu', 'mofu', 'bofu')),
  priority      INTEGER DEFAULT 0, -- 1=alta, 2=media, 3=baja (o score numérico)

  -- Control
  incluida      BOOLEAN NOT NULL DEFAULT true,  -- false = descartada manualmente
  notas         TEXT
);

CREATE INDEX IF NOT EXISTS kw_session_id_idx    ON keywords(session_id);
CREATE INDEX IF NOT EXISTS kw_keyword_idx       ON keywords(keyword);
CREATE INDEX IF NOT EXISTS kw_volume_idx        ON keywords(volume DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS kw_cluster_idx       ON keywords(cluster_name);
CREATE INDEX IF NOT EXISTS kw_funnel_idx        ON keywords(funnel_stage);

-- Evitar duplicados dentro de la misma sesión
CREATE UNIQUE INDEX IF NOT EXISTS kw_session_keyword_unique
  ON keywords(session_id, keyword);

ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_kw" ON keywords
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);


-- ─────────────────────────────────────────────────────────────
-- content_maps
-- Mapa de contenidos generado a partir de una sesión de keywords.
-- Un cliente puede tener varios mapas (histórico).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_maps (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        REFERENCES keyword_research_sessions(id) ON DELETE SET NULL,
  client_id    UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  nombre       TEXT        NOT NULL DEFAULT '',
  status       TEXT        NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'review', 'approved', 'active')),

  -- Snapshot de configuración usada para generar el mapa
  config       JSONB       NOT NULL DEFAULT '{}'
  -- Ej: { "meses": 6, "articulos_por_mes": 8, "priorizar": "volumen" }
);

CREATE INDEX IF NOT EXISTS cm_client_id_idx   ON content_maps(client_id);
CREATE INDEX IF NOT EXISTS cm_session_id_idx  ON content_maps(session_id);
CREATE INDEX IF NOT EXISTS cm_status_idx      ON content_maps(status);
CREATE INDEX IF NOT EXISTS cm_created_at_idx  ON content_maps(created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'cm_updated_at'
  ) THEN
    CREATE TRIGGER cm_updated_at
      BEFORE UPDATE ON content_maps
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE content_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_cm" ON content_maps
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);


-- ─────────────────────────────────────────────────────────────
-- content_map_items
-- Artículos individuales dentro de un mapa de contenidos.
-- Cada uno es una pieza planificada para producción.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_map_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id              UUID        NOT NULL REFERENCES content_maps(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Contenido editorial
  title               TEXT        NOT NULL,
  slug                TEXT        NOT NULL DEFAULT '',
  main_keyword        TEXT        NOT NULL,
  secondary_keywords  JSONB       NOT NULL DEFAULT '[]',  -- string[]

  -- Clasificación
  cluster             TEXT,
  funnel_stage        TEXT        CHECK (funnel_stage IN ('tofu', 'mofu', 'bofu')),

  -- Métricas SEO del artículo
  volume              INTEGER,
  difficulty          INTEGER,
  priority            INTEGER     DEFAULT 0,

  -- Planificación
  suggested_month     TEXT,       -- Ej: "2025-03"
  status              TEXT        NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('planned','assigned','in_progress','published','discarded')),

  -- Enlace al contenido generado (si ya se produjo)
  contenido_id        UUID        REFERENCES contenidos(id) ON DELETE SET NULL,

  -- Orden dentro del mes
  sort_order          INTEGER     DEFAULT 0,

  notas               TEXT
);

CREATE INDEX IF NOT EXISTS cmi_map_id_idx          ON content_map_items(map_id);
CREATE INDEX IF NOT EXISTS cmi_main_keyword_idx    ON content_map_items(main_keyword);
CREATE INDEX IF NOT EXISTS cmi_cluster_idx         ON content_map_items(cluster);
CREATE INDEX IF NOT EXISTS cmi_funnel_idx          ON content_map_items(funnel_stage);
CREATE INDEX IF NOT EXISTS cmi_suggested_month_idx ON content_map_items(suggested_month);
CREATE INDEX IF NOT EXISTS cmi_status_idx          ON content_map_items(status);
CREATE INDEX IF NOT EXISTS cmi_contenido_id_idx    ON content_map_items(contenido_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'cmi_updated_at'
  ) THEN
    CREATE TRIGGER cmi_updated_at
      BEFORE UPDATE ON content_map_items
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE content_map_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_cmi" ON content_map_items
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);


-- ─────────────────────────────────────────────────────────────
-- Vista de resumen por sesión
-- Útil para el dashboard de estrategia.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vista_strategy_sessions AS
SELECT
  s.id,
  s.client_id,
  c.nombre                                            AS client_nombre,
  s.nombre,
  s.status,
  s.created_at,
  s.updated_at,
  s.seed_topics,
  s.config,
  COUNT(k.id)                                         AS total_keywords,
  COUNT(k.id) FILTER (WHERE k.incluida = true)        AS keywords_incluidas,
  COUNT(DISTINCT k.cluster_name)
    FILTER (WHERE k.cluster_name IS NOT NULL)          AS num_clusters,
  AVG(k.keyword_difficulty)
    FILTER (WHERE k.keyword_difficulty IS NOT NULL)    AS avg_difficulty,
  SUM(k.volume)
    FILTER (WHERE k.volume IS NOT NULL)                AS total_volume
FROM keyword_research_sessions s
LEFT JOIN clientes c ON c.id = s.client_id
LEFT JOIN keywords k ON k.session_id = s.id
GROUP BY s.id, c.nombre;
