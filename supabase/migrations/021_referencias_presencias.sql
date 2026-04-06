-- 021 · Presencias por plataforma para referencias externas
-- =========================================================

-- Tabla de presencias (una referencia → múltiples plataformas)
CREATE TABLE referencia_presencias (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referencia_id   UUID        NOT NULL REFERENCES referencias_externas(id) ON DELETE CASCADE,
  plataforma      TEXT        NOT NULL CHECK (plataforma IN (
                    'web', 'instagram', 'tiktok',
                    'x', 'youtube', 'linkedin'
                  )),
  url             TEXT,
  handle          TEXT,
  id_publicitario TEXT,       -- Meta Ads page ID, Google Ads advertiser ID
  activo          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rp_referencia_id_idx ON referencia_presencias(referencia_id);

ALTER TABLE referencia_presencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_access_rp"
  ON referencia_presencias FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Limpiar columnas redundantes de referencias_externas
-- (plataforma, url, handle_rrss pasan a referencia_presencias)
ALTER TABLE referencias_externas
  DROP COLUMN IF EXISTS plataforma,
  DROP COLUMN IF EXISTS url,
  DROP COLUMN IF EXISTS handle_rrss;
