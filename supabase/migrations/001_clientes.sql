-- ============================================================
-- Migración: tabla clientes (completa)
-- ContentCopilot — 2024
-- ============================================================

-- Eliminar tabla existente si existe (con sus dependencias)
DROP TABLE IF EXISTS clientes CASCADE;

-- Habilitar extensión pgcrypto si no está activa (para encrypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Tabla principal: clientes
-- ============================================================
CREATE TABLE clientes (
  -- Identidad
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                      TEXT NOT NULL,
  slug                        TEXT NOT NULL UNIQUE,
  sector                      TEXT NOT NULL,
  url_web                     TEXT NOT NULL DEFAULT '',
  logo_url                    TEXT,
  account_manager_id          TEXT NOT NULL DEFAULT '',
  activo                      BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Perfil de marca
  descripcion                 TEXT NOT NULL DEFAULT '',
  tono_voz                    TEXT NOT NULL DEFAULT '',
  etiquetas_tono              TEXT[] NOT NULL DEFAULT '{}',
  keywords_objetivo           TEXT[] NOT NULL DEFAULT '{}',
  palabras_prohibidas         TEXT[] NOT NULL DEFAULT '{}',
  competidores                TEXT[] NOT NULL DEFAULT '{}',
  perfil_lector               TEXT NOT NULL DEFAULT '',

  -- Configuración SEO/GEO
  keywords_principales        TEXT[] NOT NULL DEFAULT '{}',
  tematicas_autorizadas       TEXT[] NOT NULL DEFAULT '{}',
  tematicas_vetadas           TEXT[] NOT NULL DEFAULT '{}',
  excel_seo_url               TEXT,

  -- Base documental (RAG)
  drive_carpeta_url           TEXT,
  wordpress_url               TEXT,
  wordpress_usuario           TEXT,
  wordpress_password_enc      TEXT,                          -- almacenado encriptado
  documentos_subidos          JSONB NOT NULL DEFAULT '[]',   -- array de DocumentoCliente
  rag_ultima_actualizacion    TIMESTAMPTZ,
  rag_num_documentos          INTEGER NOT NULL DEFAULT 0,

  -- Entrega
  modo_entrega                TEXT NOT NULL DEFAULT 'drive'
                              CHECK (modo_entrega IN ('drive', 'cms', 'word', 'email')),
  cms_url                     TEXT,
  contacto_aprobacion_nombre  TEXT,
  contacto_aprobacion_email   TEXT
);

-- ============================================================
-- Índices
-- ============================================================
CREATE INDEX idx_clientes_activo             ON clientes (activo);
CREATE INDEX idx_clientes_account_manager    ON clientes (account_manager_id);
CREATE INDEX idx_clientes_slug               ON clientes (slug);
CREATE INDEX idx_clientes_sector             ON clientes (sector);

-- ============================================================
-- Trigger: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Política: los usuarios autenticados pueden ver todos los clientes
CREATE POLICY "clientes_select" ON clientes
  FOR SELECT TO authenticated USING (true);

-- Política: los usuarios autenticados pueden insertar clientes
CREATE POLICY "clientes_insert" ON clientes
  FOR INSERT TO authenticated WITH CHECK (true);

-- Política: los usuarios autenticados pueden actualizar clientes
CREATE POLICY "clientes_update" ON clientes
  FOR UPDATE TO authenticated USING (true);

-- Política: los usuarios autenticados pueden eliminar clientes
CREATE POLICY "clientes_delete" ON clientes
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Datos de ejemplo (puedes eliminar en producción)
-- ============================================================
INSERT INTO clientes (
  nombre, slug, sector, url_web, account_manager_id, activo,
  descripcion, tono_voz, etiquetas_tono, keywords_objetivo,
  palabras_prohibidas, competidores, perfil_lector,
  keywords_principales, tematicas_autorizadas, tematicas_vetadas,
  modo_entrega, contacto_aprobacion_nombre, contacto_aprobacion_email
) VALUES (
  'TechCorp España',
  'techcorp-espana',
  'Tecnología',
  'https://techcorp.es',
  'account-manager-1',
  true,
  'Empresa líder en soluciones SaaS para pymes españolas. Fundada en 2018, con presencia en toda la Península Ibérica.',
  'Profesional y cercano, evitando tecnicismos innecesarios.',
  ARRAY['profesional', 'cercano', 'claro'],
  ARRAY['innovación', 'eficiencia', 'digitalización', 'pymes'],
  ARRAY['barato', 'fácil', 'simple'],
  ARRAY['Holded', 'Factorial', 'Sage'],
  'Directores y responsables de operaciones de pymes de 10-100 empleados en España, con conocimiento medio de tecnología.',
  ARRAY['software pymes', 'digitalización empresas', 'SaaS España'],
  ARRAY['productividad', 'automatización', 'gestión empresarial', 'transformación digital'],
  ARRAY['política', 'religión', 'deportes'],
  'drive',
  'María García',
  'maria@techcorp.es'
);
