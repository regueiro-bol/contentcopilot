-- ─── RAG: documentos vectorizados ────────────────────────────────────────────

-- Habilitar extensión pgvector (idempotente)
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla de chunks vectorizados
CREATE TABLE IF NOT EXISTS documentos_rag (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id     UUID        NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  documento_id    TEXT        NOT NULL,   -- UUID del DocumentoProyecto origen
  articulo_id     TEXT,                   -- ID del artículo dentro del CSV (URL o slug)
  titulo          TEXT        NOT NULL,
  contenido       TEXT        NOT NULL,
  chunk_index     INTEGER     NOT NULL DEFAULT 0,
  embedding       vector(1536),
  metadatos       JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda vectorial (IVFFlat, cosine)
CREATE INDEX IF NOT EXISTS idx_documentos_rag_embedding
  ON documentos_rag
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Índice para filtrar por proyecto
CREATE INDEX IF NOT EXISTS idx_documentos_rag_proyecto_id
  ON documentos_rag (proyecto_id);

-- Índice para filtrar por documento origen
CREATE INDEX IF NOT EXISTS idx_documentos_rag_documento_id
  ON documentos_rag (documento_id);

-- RLS (si lo necesitas, descomenta y ajusta)
-- ALTER TABLE documentos_rag ENABLE ROW LEVEL SECURITY;

-- ─── Función RPC para búsqueda vectorial ─────────────────────────────────────

CREATE OR REPLACE FUNCTION buscar_rag(
  p_proyecto_id UUID,
  p_embedding   TEXT,      -- JSON array como string
  p_limite      INTEGER DEFAULT 5
)
RETURNS TABLE (
  id           UUID,
  titulo       TEXT,
  contenido    TEXT,
  chunk_index  INTEGER,
  articulo_id  TEXT,
  metadatos    JSONB,
  similitud    FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    dr.id,
    dr.titulo,
    dr.contenido,
    dr.chunk_index,
    dr.articulo_id,
    dr.metadatos,
    1 - (dr.embedding <=> p_embedding::vector) AS similitud
  FROM documentos_rag dr
  WHERE dr.proyecto_id = p_proyecto_id
    AND dr.embedding IS NOT NULL
  ORDER BY dr.embedding <=> p_embedding::vector
  LIMIT p_limite;
$$;
