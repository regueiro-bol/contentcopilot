/**
 * lib/rag/indexar.ts
 *
 * Tubería de indexación del RAG: trocear → embeber → guardar.
 *
 * Extraído de app/api/rag/ingest/route.ts, donde vivía como funciones
 * privadas del fichero de ruta. Lo comparten ahora:
 *   - /api/rag/ingest      → documentos subidos (CSV de WordPress, DOCX, TXT)
 *   - /api/rag/indexar-web → artículos publicados en la web del cliente
 *
 * Los 3096 documentos ya indexados salieron de la primera; el formato de
 * fila que produce `guardarChunks` no ha cambiado al extraerlo.
 */

import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularCosteEmbeddingUSD, guardarRegistroCoste } from '@/lib/costes'

// ─── Constantes ───────────────────────────────────────────────────────────────

export const CHUNK_SIZE    = 500  // palabras por chunk
export const CHUNK_OVERLAP = 50   // palabras de solape entre chunks
export const EMBED_BATCH   = 20   // chunks por llamada a OpenAI
export const EMBED_DELAY   = 100  // ms entre lotes para no saturar la API

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ArticuloParseado {
  articulo_id : string
  titulo      : string
  contenido   : string
  metadatos   : Record<string, string>
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Divide texto en chunks de `tamano` palabras con `solapamiento` de solape */
export function dividirEnChunks(
  texto       : string,
  tamano      : number = CHUNK_SIZE,
  solapamiento: number = CHUNK_OVERLAP,
): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let i = 0

  while (i < palabras.length) {
    const slice = palabras.slice(i, i + tamano)
    const chunk = slice.join(' ').trim()
    if (chunk.length > 50) chunks.push(chunk)
    i += tamano - solapamiento
    if (i + tamano > palabras.length && i < palabras.length) {
      // último fragmento residual
      const ultimo = palabras.slice(i).join(' ').trim()
      if (ultimo.length > 50 && ultimo !== chunks[chunks.length - 1]) {
        chunks.push(ultimo)
      }
      break
    }
  }

  return chunks
}

/** Genera embeddings para un array de textos (en batch) */
export async function generarEmbeddings(
  textos: string[],
): Promise<{ embeddings: number[][]; totalTokens: number }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const inputs = textos.map((t) => t.slice(0, 8000)) // límite seguro
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: inputs,
  })
  return {
    embeddings : response.data.map((d) => d.embedding),
    totalTokens: response.usage?.total_tokens ?? 0,
  }
}

// ─── Persistencia ─────────────────────────────────────────────────────────────

export async function guardarChunks(
  proyectoId  : string,
  documentoId : string,
  articulo    : ArticuloParseado,
  chunks      : string[],
): Promise<{ guardados: number; errores: string[] }> {
  const supabase = createAdminClient()
  let guardados = 0
  let tokensTotalesEmbedding = 0
  const errores: string[] = []

  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const lote = chunks.slice(i, i + EMBED_BATCH)

    try {
      const { embeddings, totalTokens } = await generarEmbeddings(lote)
      tokensTotalesEmbedding += totalTokens

      const rows = lote.map((chunk, j) => ({
        proyecto_id : proyectoId,
        // documento_id no existe en la tabla — guardamos el UUID en metadatos
        articulo_id : articulo.articulo_id,
        titulo      : articulo.titulo,
        contenido   : chunk,
        chunk_index : i + j,
        // pgvector espera el array number[] directamente, NO un string JSON
        embedding   : embeddings[j],
        metadatos   : {
          ...articulo.metadatos,
          documento_id: documentoId,       // UUID del DocumentoProyecto para poder filtrar
          total_chunks: String(chunks.length),
        },
      }))

      console.log(`[RAG] Insertando lote ${i}–${i + lote.length} (${lote.length} chunks) para "${articulo.titulo}"`)
      const { error } = await supabase.from('documentos_rag').insert(rows)
      if (error) {
        console.error(`[RAG] Error en INSERT:`, error.message, error.details, error.hint)
        errores.push(`Chunk ${i}–${i + lote.length}: ${error.message}`)
      } else {
        console.log(`[RAG] INSERT OK — ${lote.length} filas guardadas`)
        guardados += lote.length
      }
    } catch (err) {
      errores.push(
        `Chunk ${i}–${i + lote.length}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (i + EMBED_BATCH < chunks.length) await sleep(EMBED_DELAY)
  }

  // ── Registrar coste de embeddings (fire & forget) ──────────────────────────
  if (tokensTotalesEmbedding > 0) {
    guardarRegistroCoste({
      proyecto_id   : proyectoId,
      tipo_operacion: 'rag_embedding',
      agente        : 'openai_embedding',
      modelo        : 'text-embedding-3-small',
      tokens_input  : tokensTotalesEmbedding,
      unidades      : guardados,
      coste_usd     : calcularCosteEmbeddingUSD(tokensTotalesEmbedding),
      metadatos     : {
        documento_id: documentoId,
        articulo_titulo: articulo.titulo,
        chunks_guardados: guardados,
      },
    }).catch((e) => console.error('[Costes RAG] Error al guardar:', e))
  }

  return { guardados, errores }
}
