-- 020 · Referencias externas — competidores editoriales, referentes y competencia publicitaria
-- ============================================================================================

CREATE TABLE referencias_externas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL,
  url         TEXT,
  tipo        TEXT        NOT NULL CHECK (tipo IN (
                'competidor_editorial',
                'competidor_publicitario',
                'referente'
              )),
  categoria   TEXT        CHECK (categoria IN (
                'contenidos', 'diseno_web', 'seo',
                'redes_sociales', 'general'
              )),
  plataforma  TEXT        CHECK (plataforma IN (
                'web', 'instagram', 'tiktok',
                'x', 'youtube', 'linkedin'
              )) DEFAULT 'web',
  handle_rrss TEXT,
  notas       TEXT,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS re_client_id_idx ON referencias_externas(client_id);
CREATE INDEX IF NOT EXISTS re_tipo_idx      ON referencias_externas(tipo);

ALTER TABLE referencias_externas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_access_re"
  ON referencias_externas FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
