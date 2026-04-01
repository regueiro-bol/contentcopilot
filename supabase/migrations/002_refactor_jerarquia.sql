-- ============================================================
-- Migración 002: Refactorización jerarquía Cliente → Proyectos → Contenidos
-- ContentCopilot — 2024
-- ============================================================

-- Eliminar tablas anteriores en orden inverso (dependencias)
DROP TABLE IF EXISTS conversaciones     CASCADE;
DROP TABLE IF EXISTS contenidos         CASCADE;
DROP TABLE IF EXISTS proyectos          CASCADE;
DROP TABLE IF EXISTS perfiles_autor     CASCADE;
DROP TABLE IF EXISTS clientes           CASCADE;

-- Habilitar extensiones
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. clientes — entidad corporativa (nivel 1)
-- ============================================================
CREATE TABLE clientes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                  TEXT NOT NULL,
  slug                    TEXT NOT NULL UNIQUE,
  sector                  TEXT NOT NULL,
  url_web                 TEXT NOT NULL DEFAULT '',
  logo_url                TEXT,
  activo                  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Contexto corporativo
  descripcion             TEXT NOT NULL DEFAULT '',
  restricciones_globales  TEXT[] NOT NULL DEFAULT '{}',
  identidad_corporativa   TEXT NOT NULL DEFAULT '',

  -- Gestión interna
  account_manager_id      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_clientes_activo          ON clientes (activo);
CREATE INDEX idx_clientes_account_manager ON clientes (account_manager_id);
CREATE INDEX idx_clientes_sector          ON clientes (sector);

-- ============================================================
-- 2. proyectos — canal editorial (nivel 2)
-- ============================================================
CREATE TABLE proyectos (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                      TEXT NOT NULL,
  slug                        TEXT NOT NULL,
  cliente_id                  UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  activo                      BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Descripción editorial
  descripcion                 TEXT NOT NULL DEFAULT '',

  -- Voz editorial
  tono_voz                    TEXT NOT NULL DEFAULT '',
  etiquetas_tono              JSONB NOT NULL DEFAULT '[]',
  keywords_objetivo           JSONB NOT NULL DEFAULT '[]',
  keywords_prohibidas         JSONB NOT NULL DEFAULT '[]',
  tematicas_autorizadas       JSONB NOT NULL DEFAULT '[]',
  tematicas_vetadas           JSONB NOT NULL DEFAULT '[]',
  perfil_lector               TEXT NOT NULL DEFAULT '',

  -- Modo de trabajo
  modo_creativo               BOOLEAN NOT NULL DEFAULT false,

  -- Entrega
  modo_entrega                TEXT NOT NULL DEFAULT 'drive'
                              CHECK (modo_entrega IN ('drive', 'cms', 'word', 'email')),
  cms_url                     TEXT,
  drive_carpeta_url           TEXT,
  wordpress_url               TEXT,
  excel_seo_url               TEXT,
  contacto_aprobacion_nombre  TEXT,
  contacto_aprobacion_email   TEXT,

  -- Base documental (RAG)
  documentos_subidos          JSONB NOT NULL DEFAULT '[]',
  rag_ultima_actualizacion    TIMESTAMPTZ,
  rag_num_documentos          INTEGER NOT NULL DEFAULT 0,

  UNIQUE (cliente_id, slug)
);

CREATE INDEX idx_proyectos_cliente_id ON proyectos (cliente_id);
CREATE INDEX idx_proyectos_activo     ON proyectos (activo);

-- ============================================================
-- 3. perfiles_autor — biblioteca transversal de autores
-- ============================================================
CREATE TABLE perfiles_autor (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  email           TEXT UNIQUE,
  bio             TEXT,
  especialidades  TEXT[] NOT NULL DEFAULT '{}',
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_perfiles_autor_activo ON perfiles_autor (activo);

-- ============================================================
-- 4. contenidos — pieza individual de contenido (nivel 3)
-- ============================================================
CREATE TABLE contenidos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo              TEXT NOT NULL,
  slug                TEXT NOT NULL,
  proyecto_id         UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  cliente_id          UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Estado en el flujo editorial
  estado              TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN (
                        'pendiente', 'borrador', 'revision_seo',
                        'revision_cliente', 'devuelto', 'aprobado', 'publicado'
                      )),

  -- Asignación
  redactor_id         UUID REFERENCES perfiles_autor(id) ON DELETE SET NULL,

  -- SEO
  keyword_principal   TEXT,
  url_destino         TEXT,

  -- Planificación
  fecha_entrega       DATE,
  tamanyo_texto_min   INTEGER,
  tamanyo_texto_max   INTEGER,

  -- Brief SEO (jsonb — generado por Agente Brief SEO)
  brief               JSONB,

  -- Entrega
  url_publicado       TEXT,
  link_drive          TEXT,

  UNIQUE (proyecto_id, slug)
);

CREATE INDEX idx_contenidos_proyecto_id   ON contenidos (proyecto_id);
CREATE INDEX idx_contenidos_cliente_id    ON contenidos (cliente_id);
CREATE INDEX idx_contenidos_estado        ON contenidos (estado);
CREATE INDEX idx_contenidos_redactor_id   ON contenidos (redactor_id);
CREATE INDEX idx_contenidos_activo        ON contenidos (activo);
CREATE INDEX idx_contenidos_fecha_entrega ON contenidos (fecha_entrega);

-- ============================================================
-- 5. conversaciones — historial con agentes IA
-- ============================================================
CREATE TABLE conversaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    UUID REFERENCES clientes(id) ON DELETE SET NULL,
  proyecto_id   UUID REFERENCES proyectos(id) ON DELETE SET NULL,
  contenido_id  UUID REFERENCES contenidos(id) ON DELETE SET NULL,
  titulo        TEXT,
  mensajes      JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversaciones_cliente_id   ON conversaciones (cliente_id);
CREATE INDEX idx_conversaciones_proyecto_id  ON conversaciones (proyecto_id);
CREATE INDEX idx_conversaciones_contenido_id ON conversaciones (contenido_id);

-- ============================================================
-- Triggers updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clientes_updated_at
  BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER proyectos_updated_at
  BEFORE UPDATE ON proyectos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER contenidos_updated_at
  BEFORE UPDATE ON contenidos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER conversaciones_updated_at
  BEFORE UPDATE ON conversaciones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE clientes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contenidos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles_autor ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversaciones ENABLE ROW LEVEL SECURITY;

-- Políticas: los usuarios autenticados tienen acceso completo
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','proyectos','contenidos','perfiles_autor','conversaciones']
  LOOP
    EXECUTE format('CREATE POLICY %I_select ON %I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON %I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY %I_update ON %I FOR UPDATE TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY %I_delete ON %I FOR DELETE TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

-- ============================================================
-- Datos de ejemplo
-- ============================================================

-- Cliente: Banco Santander
INSERT INTO clientes (nombre, slug, sector, url_web, descripcion, restricciones_globales, identidad_corporativa, account_manager_id)
VALUES (
  'Banco Santander',
  'banco-santander',
  'Banca y Finanzas',
  'https://www.santander.com/es',
  'Entidad bancaria global con sede en España, líder en banca minorista y digital.',
  ARRAY['riesgo', 'pérdida', 'quiebra', 'crisis'],
  'Marca cercana, responsable y orientada al cliente. Tono confiable y profesional sin ser frío.',
  'account-manager-1'
) RETURNING id \gset cliente1_id

-- Proyectos del cliente: Banco Santander
INSERT INTO proyectos (nombre, slug, cliente_id, descripcion, tono_voz, etiquetas_tono, keywords_objetivo, modo_entrega)
SELECT
  'Blog Impulsa Empresa',
  'blog-impulsa-empresa',
  id,
  'Blog dirigido a pymes y emprendedores con contenidos de finanzas, fiscalidad y crecimiento empresarial.',
  'Cercano, práctico y orientado a la acción. Evitar tecnicismos financieros.',
  '["cercano","práctico","emprendedor"]'::jsonb,
  '["pymes","financiación empresas","créditos pyme","préstamo autónomo"]'::jsonb,
  'cms'
FROM clientes WHERE slug = 'banco-santander';

INSERT INTO proyectos (nombre, slug, cliente_id, descripcion, tono_voz, etiquetas_tono, keywords_objetivo, modo_entrega)
SELECT
  'Blog Corporativo',
  'blog-corporativo',
  id,
  'Blog institucional para inversores, medios y stakeholders.',
  'Formal, riguroso y con autoridad. Orientado a resultados e impacto social.',
  '["formal","institucional","autoridad"]'::jsonb,
  '["banca sostenible","resultados financieros","RSC bancaria"]'::jsonb,
  'drive'
FROM clientes WHERE slug = 'banco-santander';

-- Contenidos de ejemplo
INSERT INTO contenidos (titulo, slug, proyecto_id, cliente_id, estado, keyword_principal, fecha_entrega)
SELECT
  'Cómo conseguir financiación para tu pyme en 2025',
  'financiacion-pyme-2025',
  p.id,
  c.id,
  'revision_seo',
  'financiación pyme',
  '2025-04-10'
FROM proyectos p JOIN clientes c ON p.cliente_id = c.id
WHERE c.slug = 'banco-santander' AND p.slug = 'blog-impulsa-empresa';

INSERT INTO contenidos (titulo, slug, proyecto_id, cliente_id, estado, keyword_principal, fecha_entrega)
SELECT
  'Guía fiscal para autónomos: deducciones 2025',
  'guia-fiscal-autonomos-2025',
  p.id,
  c.id,
  'borrador',
  'deducciones autónomos 2025',
  '2025-04-20'
FROM proyectos p JOIN clientes c ON p.cliente_id = c.id
WHERE c.slug = 'banco-santander' AND p.slug = 'blog-impulsa-empresa';
