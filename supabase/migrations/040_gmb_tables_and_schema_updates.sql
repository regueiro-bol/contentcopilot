-- ============================================================
-- 040_gmb_tables_and_schema_updates.sql
-- Sprint 21: GMB integration + content_opportunities schema updates
-- ============================================================

-- Tabla GMB locations
CREATE TABLE IF NOT EXISTS gmb_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  google_account_id UUID REFERENCES google_accounts(id) ON DELETE SET NULL,
  location_id TEXT NOT NULL,
  location_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  website TEXT,
  category TEXT,
  rating NUMERIC(3,2),
  review_count INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_gmb_locations_client
  ON gmb_locations(client_id);

-- Tabla GMB snapshots (caché diaria)
CREATE TABLE IF NOT EXISTS gmb_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  date DATE NOT NULL,
  views_maps INTEGER DEFAULT 0,
  views_search INTEGER DEFAULT 0,
  clicks_website INTEGER DEFAULT 0,
  clicks_phone INTEGER DEFAULT 0,
  clicks_directions INTEGER DEFAULT 0,
  avg_rating NUMERIC(3,2),
  total_reviews INTEGER DEFAULT 0,
  new_reviews INTEGER DEFAULT 0,
  review_keywords JSONB DEFAULT '[]',
  recent_reviews JSONB DEFAULT '[]',
  top_questions JSONB DEFAULT '[]',
  content_ideas JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, location_id, date)
);

CREATE INDEX IF NOT EXISTS idx_gmb_snapshots_client_date
  ON gmb_snapshots(client_id, date DESC);

-- Añadir campo gmb_location_id a client_google_connections
ALTER TABLE client_google_connections
  ADD COLUMN IF NOT EXISTS gmb_location_id TEXT;

-- Añadir funnel_stage y fase a content_opportunities
ALTER TABLE content_opportunities
  ADD COLUMN IF NOT EXISTS funnel_stage TEXT,
  ADD COLUMN IF NOT EXISTS fase TEXT;

-- RLS
ALTER TABLE gmb_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_gmb_locations"
  ON gmb_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON gmb_locations TO authenticated, service_role;

ALTER TABLE gmb_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_gmb_snapshots"
  ON gmb_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON gmb_snapshots TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
