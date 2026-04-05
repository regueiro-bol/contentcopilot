-- ============================================================
-- 016_ga4_snapshots.sql
-- Caché de métricas GA4 por página para ficha de cliente
-- ============================================================

CREATE TABLE ga4_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID REFERENCES clientes(id) ON DELETE CASCADE,
  property_id   TEXT NOT NULL,
  snapshot_date  DATE DEFAULT CURRENT_DATE,
  metrics       JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, snapshot_date)
);

ALTER TABLE ga4_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_ga4"
  ON ga4_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON ga4_snapshots TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
