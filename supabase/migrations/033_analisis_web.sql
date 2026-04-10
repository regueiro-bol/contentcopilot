-- 033_analisis_web.sql
-- Tabla para almacenar análisis de contenido web de competidores y clientes

CREATE TABLE IF NOT EXISTS analisis_web (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id               UUID REFERENCES clientes(id) ON DELETE CASCADE,
  competidor_id            UUID REFERENCES competitors(id) ON DELETE SET NULL,
  tipo                     TEXT NOT NULL CHECK (tipo IN ('cliente', 'competidor')),
  url_analizada            TEXT NOT NULL,
  fecha_analisis           TIMESTAMPTZ DEFAULT NOW(),
  num_articulos            INTEGER DEFAULT 0,
  tematicas_detectadas     JSONB DEFAULT '[]',
  keywords_posicionamiento JSONB DEFAULT '[]',
  articulos                JSONB DEFAULT '[]',
  informe_completo         TEXT,
  resumen                  JSONB DEFAULT '{}',
  estado                   TEXT DEFAULT 'completado'
                             CHECK (estado IN ('procesando', 'completado', 'error')),
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE analisis_web ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_access" ON analisis_web
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_analisis_web_cliente     ON analisis_web(cliente_id);
CREATE INDEX IF NOT EXISTS idx_analisis_web_competidor  ON analisis_web(competidor_id);
CREATE INDEX IF NOT EXISTS idx_analisis_web_tipo        ON analisis_web(cliente_id, tipo);
CREATE INDEX IF NOT EXISTS idx_analisis_web_created     ON analisis_web(created_at DESC);
