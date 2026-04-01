-- ─── Actualización de la función de búsqueda RAG ────────────────────────────
-- Recrea buscar_rag con la firma que usa el copiloto:
--   query_embedding vector(1536)  — el embedding de la consulta
--   p_proyecto_id   uuid          — filtro por proyecto
--   limite          int           — número máximo de resultados

CREATE OR REPLACE FUNCTION buscar_rag(
  query_embedding vector(1536),
  p_proyecto_id   uuid,
  limite          int DEFAULT 5
)
RETURNS TABLE (
  titulo     text,
  contenido  text,
  similitud  float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    titulo,
    contenido,
    1 - (embedding <=> query_embedding) AS similitud
  FROM documentos_rag
  WHERE proyecto_id = p_proyecto_id
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT limite;
$$;
