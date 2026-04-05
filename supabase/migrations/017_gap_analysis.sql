-- 017 · Gap Analysis RAG — función buscar_rag_cliente + columnas status en content_map_items
-- ==========================================================================================

-- 1. Función: búsqueda vectorial por cliente (cruza proyectos → documentos_rag)
CREATE OR REPLACE FUNCTION buscar_rag_cliente(
  query_embedding vector(1536),
  p_client_id     uuid,
  match_count     int DEFAULT 3
)
RETURNS TABLE (
  id            uuid,
  titulo        text,
  contenido     text,
  metadatos     jsonb,
  proyecto_id   uuid,
  similarity    float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.id,
    d.titulo,
    d.contenido,
    d.metadatos,
    d.proyecto_id,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documentos_rag d
  JOIN proyectos p ON p.id = d.proyecto_id
  WHERE p.cliente_id = p_client_id
    AND d.embedding IS NOT NULL
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 2. Columnas de gap analysis en content_map_items
ALTER TABLE content_map_items
  ADD COLUMN IF NOT EXISTS content_status   TEXT CHECK (content_status IN ('gap', 'existing_content', 'partial')),
  ADD COLUMN IF NOT EXISTS existing_url     TEXT,
  ADD COLUMN IF NOT EXISTS similarity_score NUMERIC(4,3);
