-- ============================================================
-- 039_gsc_snapshots_opportunities.sql
-- Sprint 20: GSC snapshot cache + content opportunities
-- ============================================================

-- Histórico de snapshots GSC (caché diaria)
CREATE TABLE IF NOT EXISTS gsc_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  -- Métricas globales del período
  total_clicks       INTEGER     DEFAULT 0,
  total_impressions  INTEGER     DEFAULT 0,
  avg_ctr            NUMERIC(5,2) DEFAULT 0,
  avg_position       NUMERIC(5,2) DEFAULT 0,
  -- Top queries del período (JSONB array)
  top_queries        JSONB       DEFAULT '[]',
  -- Top páginas del período (JSONB array)
  top_pages          JSONB       DEFAULT '[]',
  -- Clasificación por tipo de búsqueda (Claude haiku)
  search_type_breakdown JSONB    DEFAULT '{}',
  -- Rendimiento por cluster del mapa
  cluster_breakdown  JSONB       DEFAULT '{}',
  -- Evolución diaria (clicks/impressions/position por día)
  daily_evolution    JSONB       DEFAULT '[]',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, date)
);

CREATE INDEX IF NOT EXISTS idx_gsc_snapshots_client_date
  ON gsc_snapshots(client_id, date DESC);

-- Oportunidades detectadas automáticamente desde datos GSC
CREATE TABLE IF NOT EXISTS content_opportunities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN (
    'quick_win',        -- posición 6-20, >500 impresiones
    'update',           -- artículo antiguo con caída de tráfico
    'missing_content',  -- keyword con impresiones sin artículo
    'bofu_gap',         -- cluster sin contenido transaccional
    'brand_dependent'   -- >40% tráfico de marca
  )),
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  keyword       TEXT,
  cluster       TEXT,
  current_position NUMERIC(5,2),
  impressions   INTEGER,
  clicks        INTEGER,
  contenido_id  UUID REFERENCES contenidos(id),
  priority      INTEGER DEFAULT 2,
  status        TEXT DEFAULT 'activa'
                CHECK (status IN ('activa','descartada','en_proceso')),
  detected_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_content_opportunities_client
  ON content_opportunities(client_id, status);

-- RLS
ALTER TABLE gsc_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_gsc_snap"
  ON gsc_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON gsc_snapshots TO authenticated, service_role;

ALTER TABLE content_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_content_opp"
  ON content_opportunities FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON content_opportunities TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
