/**
 * lib/costes.ts
 * Utilidades para calcular y persistir el coste estimado de cada
 * operación IA en ContentCopilot.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Precios por token / unidad (USD) ────────────────────────────────────────

/** Claude Sonnet: $3 por millón de tokens de entrada */
export const PRECIO_CLAUDE_INPUT  = 0.000003

/** Claude Sonnet: $15 por millón de tokens de salida */
export const PRECIO_CLAUDE_OUTPUT = 0.000015

/** OpenAI text-embedding-3-small: $0.02 por millón de tokens */
export const PRECIO_EMBED_TOKEN   = 0.00000002

/** FAL.ai Flux Pro v1.1 / v1.1-ultra: $0.055 por imagen */
export const PRECIO_FLUX_IMAGEN   = 0.055

// ─── Tipos de operación ───────────────────────────────────────────────────────

export type TipoOperacion =
  | 'borrador'       // generación de borrador completo
  | 'copiloto'       // conversación en el copiloto
  | 'revision'       // revisión GEO-SEO
  | 'brief_seo'      // generación de brief SEO
  | 'prompt_imagen'  // generación de prompt de imagen
  | 'rag_embedding'  // embeddings para el índice RAG
  | 'imagen_flux'    // imagen destacada con FLUX
  | 'ad_creative'    // pieza social con FLUX

// ─── Cálculo ─────────────────────────────────────────────────────────────────

export function calcularCosteClaudeUSD(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRECIO_CLAUDE_INPUT) + (outputTokens * PRECIO_CLAUDE_OUTPUT)
}

export function calcularCosteEmbeddingUSD(tokens: number): number {
  return tokens * PRECIO_EMBED_TOKEN
}

export function calcularCosteFluxUSD(numImagenes: number): number {
  return numImagenes * PRECIO_FLUX_IMAGEN
}

/** Formatea un coste en USD con 4 decimales para la UI */
export function formatearCosteUSD(coste: number): string {
  return `$${(coste ?? 0).toFixed(4)}`
}

// ─── Persistencia ─────────────────────────────────────────────────────────────

export interface RegistroCosteInput {
  contenido_id?  : string | null
  proyecto_id?   : string | null
  tipo_operacion : TipoOperacion
  agente         : string
  modelo?        : string
  tokens_input?  : number
  tokens_output? : number
  unidades?      : number
  coste_usd      : number
  metadatos?     : Record<string, unknown>
}

/**
 * Guarda un registro de coste en la tabla `registros_costes`.
 * Nunca lanza excepciones — solo loguea errores.
 * Diseñada para usarse como fire-and-forget con `.catch(console.error)`.
 */
export async function guardarRegistroCoste(data: RegistroCosteInput): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('registros_costes').insert({
      contenido_id  : data.contenido_id  ?? null,
      proyecto_id   : data.proyecto_id   ?? null,
      tipo_operacion: data.tipo_operacion,
      agente        : data.agente,
      modelo        : data.modelo        ?? null,
      tokens_input  : data.tokens_input  ?? 0,
      tokens_output : data.tokens_output ?? 0,
      unidades      : data.unidades      ?? 1,
      coste_usd     : data.coste_usd,
      metadatos     : data.metadatos     ?? null,
    })
    if (error) {
      console.error('[Costes] Error al guardar registro:', error.message)
    }
  } catch (e) {
    console.error('[Costes] Excepción inesperada:', e)
  }
}
