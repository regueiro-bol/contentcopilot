import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RagChunk {
  id: string
  titulo: string
  contenido: string
  chunk_index: number
  articulo_id: string | null
  metadatos: Record<string, unknown>
  similitud: number
}

// ─── Búsqueda vectorial ───────────────────────────────────────────────────────

/**
 * Busca los chunks más relevantes en la base documental de un proyecto.
 * @param proyectoId  UUID del proyecto
 * @param query       Pregunta o contexto de búsqueda
 * @param limite      Número máximo de resultados (default 5)
 * @returns           String con el contexto concatenado, listo para inyectar en prompt
 */
export async function buscarRAG(
  proyectoId: string,
  query: string,
  limite = 5,
): Promise<string> {
  // 1. Generar embedding de la consulta
  const embeddingResponse = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const queryEmbedding = embeddingResponse.data[0].embedding

  // 2. Búsqueda por similitud coseno con pgvector
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('buscar_rag', {
    p_proyecto_id: proyectoId,
    p_embedding: JSON.stringify(queryEmbedding),
    p_limite: limite,
  })

  if (error) {
    console.error('[buscarRAG] error en RPC:', error.message)
    return ''
  }

  if (!data || data.length === 0) return ''

  const chunks = data as RagChunk[]

  // 3. Formatear como contexto para el prompt
  const contexto = chunks
    .map((c, i) => `[Fragmento ${i + 1} — "${c.titulo}"]\n${c.contenido}`)
    .join('\n\n---\n\n')

  return contexto
}

/**
 * Devuelve los chunks crudos (para uso avanzado)
 */
export async function buscarRAGChunks(
  proyectoId: string,
  query: string,
  limite = 5,
): Promise<RagChunk[]> {
  const embeddingResponse = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const queryEmbedding = embeddingResponse.data[0].embedding

  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('buscar_rag', {
    p_proyecto_id: proyectoId,
    p_embedding: JSON.stringify(queryEmbedding),
    p_limite: limite,
  })

  if (error) {
    console.error('[buscarRAGChunks] error en RPC:', error.message)
    return []
  }

  return (data as RagChunk[]) ?? []
}

// ─── buscarContextoRAG — función principal para el copiloto ──────────────────

/**
 * Genera el embedding de `query`, busca en documentos_rag del proyecto
 * y devuelve un bloque de texto con el contexto más relevante, listo
 * para inyectar en el system prompt de Claude.
 *
 * Usa la nueva firma RPC: buscar_rag(query_embedding, p_proyecto_id, limite)
 *
 * @returns '' si no hay documentos RAG o la búsqueda falla (nunca lanza)
 */
export async function buscarContextoRAG(
  proyecto_id: string,
  query      : string,
  limite     : number = 3,
): Promise<string> {
  console.log('[RAG lib] proyecto_id:', proyecto_id)
  console.log('[RAG lib] Generando embedding para:', query.substring(0, 50))

  if (!proyecto_id || !query.trim()) {
    console.log('[RAG lib] Abortado — proyecto_id o query vacíos')
    return ''
  }

  try {
    const oa = getOpenAI()

    // 1. Embedding de la consulta
    const embRes = await oa.embeddings.create({
      model: 'text-embedding-3-small',
      input: query.substring(0, 8000),
    })
    const queryEmbedding = embRes.data[0].embedding
    console.log('[RAG lib] Embedding generado, dims:', queryEmbedding?.length)

    // 2. Búsqueda vectorial — firma: buscar_rag(query_embedding, p_proyecto_id, limite)
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('buscar_rag', {
      query_embedding: queryEmbedding,
      p_proyecto_id  : proyecto_id,
      limite,
    })

    console.log('[RAG lib] Resultados RPC:', (data as unknown[])?.length ?? 0, '| error:', error?.message ?? 'ninguno')

    if (error) {
      console.error('[RAG lib] RPC error detalle:', error)
      return ''
    }

    if (!data || (data as unknown[]).length === 0) {
      console.log('[RAG lib] Sin resultados — tabla vacía o sin similitud suficiente')
      return ''
    }

    const filas = data as Array<{ titulo: string; contenido: string; similitud: number }>
    console.log('[RAG lib] Primer resultado:', filas[0]?.titulo, '| similitud:', filas[0]?.similitud)

    // 3. Formatear como bloque de contexto para el system prompt
    const bloques = filas
      .map((r) => `[${r.titulo}]:\n${r.contenido}`)
      .join('\n\n---\n\n')

    return `CONTENIDO SIMILAR DEL CLIENTE:\n\n${bloques}`
  } catch (err) {
    console.error('[RAG lib] excepción:', err instanceof Error ? err.message : err)
    return ''
  }
}
