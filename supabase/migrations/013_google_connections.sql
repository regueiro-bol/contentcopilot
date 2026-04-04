-- ============================================================
-- 013_google_connections.sql
-- Cuentas Google de agencia + conexiones a clientes
-- ============================================================

-- ── google_accounts ─────────────────────────────────────────
-- Máximo 3 cuentas de agencia. Guardan tokens OAuth para
-- acceder a GSC y GA4 en nombre de los clientes.

CREATE TABLE google_accounts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  display_name  TEXT,
  access_token  TEXT,
  refresh_token TEXT        NOT NULL,
  token_expiry  TIMESTAMPTZ,
  scopes        TEXT[],
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE google_accounts IS 'Cuentas Google OAuth de la agencia (máx 3)';

-- ── client_google_connections ───────────────────────────────
-- Vincula un cliente con una cuenta Google y las propiedades
-- específicas de GSC/GA4 que debe consultar.

CREATE TABLE client_google_connections (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  google_account_id UUID        NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  gsc_property_url  TEXT,
  ga4_property_id   TEXT,
  ga4_stream_id     TEXT,
  status            TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'error', 'disconnected')),
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un cliente solo puede tener una conexión por cuenta Google
  UNIQUE (client_id, google_account_id)
);

COMMENT ON TABLE client_google_connections IS 'Conexiones entre clientes y cuentas Google (GSC + GA4)';

-- Índices
CREATE INDEX idx_cgc_client    ON client_google_connections(client_id);
CREATE INDEX idx_cgc_account   ON client_google_connections(google_account_id);

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE google_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_ga"
  ON google_accounts FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE client_google_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_cgc"
  ON client_google_connections FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- ── Grants ──────────────────────────────────────────────────

GRANT ALL ON google_accounts              TO authenticated, service_role;
GRANT ALL ON client_google_connections    TO authenticated, service_role;
