-- ============================================================
-- Migración 010 — Competitive Intelligence
-- ============================================================
-- Tablas para el módulo de análisis de competencia:
--   competitors     — páginas/marcas a monitorizar
--   competitor_ads  — anuncios encontrados en Meta Ad Library
--   ci_reports      — informes de análisis generados por IA
-- ============================================================

-- ── competitors ───────────────────────────────────────────────────────────────

CREATE TABLE competitors (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  platform              TEXT        NOT NULL DEFAULT 'meta'
                        CHECK (platform IN ('meta', 'google', 'tiktok')),
  page_name             TEXT        NOT NULL,          -- nombre exacto de la página en Meta
  page_id               TEXT,                          -- ID de la página (opcional, mejora la precisión)
  active                BOOLEAN     NOT NULL DEFAULT true,
  check_frequency_days  INTEGER     NOT NULL DEFAULT 7,
  last_checked_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX competitors_client_id_idx ON competitors(client_id);
CREATE INDEX competitors_client_active_idx ON competitors(client_id, active);

ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitors_select_authenticated"
  ON competitors FOR SELECT TO authenticated USING (true);

CREATE POLICY "competitors_insert_service_role"
  ON competitors FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "competitors_update_service_role"
  ON competitors FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "competitors_delete_service_role"
  ON competitors FOR DELETE TO service_role USING (true);

-- ── competitor_ads ────────────────────────────────────────────────────────────

CREATE TABLE competitor_ads (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id     UUID        NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  client_id         UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  platform          TEXT        NOT NULL DEFAULT 'meta',
  ad_id_external    TEXT        NOT NULL,   -- ID del ad en Meta Ad Library
  creative_url      TEXT,                   -- URL al snapshot/preview del ad
  copy_text         TEXT,                   -- Texto principal del anuncio
  cta_type          TEXT,                   -- Call to action (LEARN_MORE, SIGN_UP, etc.)
  started_running   TIMESTAMPTZ,            -- Cuándo empezó a publicarse
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  raw_data          JSONB       NOT NULL DEFAULT '{}',
  UNIQUE (platform, ad_id_external)
);

CREATE INDEX competitor_ads_competitor_id_idx  ON competitor_ads(competitor_id);
CREATE INDEX competitor_ads_client_id_idx      ON competitor_ads(client_id);
CREATE INDEX competitor_ads_is_active_idx      ON competitor_ads(client_id, is_active);
CREATE INDEX competitor_ads_first_seen_idx     ON competitor_ads(client_id, first_seen_at DESC);

ALTER TABLE competitor_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitor_ads_select_authenticated"
  ON competitor_ads FOR SELECT TO authenticated USING (true);

CREATE POLICY "competitor_ads_insert_service_role"
  ON competitor_ads FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "competitor_ads_update_service_role"
  ON competitor_ads FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "competitor_ads_delete_service_role"
  ON competitor_ads FOR DELETE TO service_role USING (true);

-- ── ci_reports ────────────────────────────────────────────────────────────────

CREATE TABLE ci_reports (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  period_start          TIMESTAMPTZ NOT NULL,
  period_end            TIMESTAMPTZ NOT NULL,
  report_type           TEXT        NOT NULL DEFAULT 'benchmark'
                        CHECK (report_type IN ('benchmark', 'performance')),
  competitors_analyzed  INTEGER     NOT NULL DEFAULT 0,
  ads_analyzed          INTEGER     NOT NULL DEFAULT 0,
  content               JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ci_reports_client_id_idx     ON ci_reports(client_id);
CREATE INDEX ci_reports_client_date_idx   ON ci_reports(client_id, created_at DESC);

ALTER TABLE ci_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ci_reports_select_authenticated"
  ON ci_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "ci_reports_insert_service_role"
  ON ci_reports FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "ci_reports_update_service_role"
  ON ci_reports FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ci_reports_delete_service_role"
  ON ci_reports FOR DELETE TO service_role USING (true);
