-- 053: buscar_rag_cliente devuelve articulo_id
--
-- El gap analysis recuperaba UN solo fragmento (match_count=1) y lo tomaba
-- como veredicto. Como se compara un título corto contra fragmentos de ~500
-- palabras, la puntuación dependía de qué fragmento tocara: el mismo artículo
-- daba 0.82 si caía en el párrafo de precios y 0.69 si caía en la introducción.
--
-- Para agregar varios fragmentos POR ARTÍCULO hace falta la clave del
-- artículo, que la función no devolvía. `titulo` no sirve como clave: dos
-- artículos distintos pueden compartirlo.
--
-- El tipo de retorno cambia, así que hay que DROP + CREATE: CREATE OR REPLACE
-- no admite modificar los parámetros de salida.
--
-- Único consumidor: app/api/strategy/check-existing. `buscar_rag` (otra
-- función, usada por lib/rag.ts) no se toca.

DROP FUNCTION IF EXISTS buscar_rag_cliente(vector(1536), uuid, int);

CREATE FUNCTION buscar_rag_cliente(
  query_embedding vector(1536),
  p_client_id     uuid,
  match_count     int DEFAULT 3
)
RETURNS TABLE (
  id            uuid,
  articulo_id   text,
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
    d.articulo_id,
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

NOTIFY pgrst, 'reload schema';
