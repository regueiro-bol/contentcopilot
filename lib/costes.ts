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

/** GPT-4o: $2.5 por millón de tokens de entrada */
export const PRECIO_GPT4_INPUT    = 0.0000025

/** GPT-4o: $10 por millón de tokens de salida */
export const PRECIO_GPT4_OUTPUT   = 0.00001

/** Gemini 2.0 Flash: $0.075 por millón de tokens de entrada */
export const PRECIO_GEMINI_INPUT  = 0.000000075

/** Gemini 2.0 Flash: $0.30 por millón de tokens de salida */
export const PRECIO_GEMINI_OUTPUT = 0.0000003

/** SerpApi: ~$0.01 por búsqueda (plan estándar) */
export const PRECIO_SERPAPI_BUSQUEDA = 0.01

/** DataForSEO keyword_ideas: ~$0.015 por tarea */
export const PRECIO_DATAFORSEO_IDEAS       = 0.015

/** DataForSEO search_volume: ~$0.015 por tarea */
export const PRECIO_DATAFORSEO_VOLUME      = 0.015

/** DataForSEO competitor keywords: ~$0.015 por dominio */
export const PRECIO_DATAFORSEO_COMPETITOR  = 0.015

// ─── Objeto PRECIOS (alternativa estructurada) ────────────────────────────────
export const PRECIOS = {
  claude_input         : PRECIO_CLAUDE_INPUT,
  claude_output        : PRECIO_CLAUDE_OUTPUT,
  embed_token          : PRECIO_EMBED_TOKEN,
  flux_imagen          : PRECIO_FLUX_IMAGEN,
  gpt4_input           : PRECIO_GPT4_INPUT,
  gpt4_output          : PRECIO_GPT4_OUTPUT,
  gemini_input         : PRECIO_GEMINI_INPUT,
  gemini_output        : PRECIO_GEMINI_OUTPUT,
  serpapi_busqueda     : PRECIO_SERPAPI_BUSQUEDA,
  dataforseo_ideas     : PRECIO_DATAFORSEO_IDEAS,
  dataforseo_volume    : PRECIO_DATAFORSEO_VOLUME,
  dataforseo_competitor: PRECIO_DATAFORSEO_COMPETITOR,
} as const

// ─── Tipos de operación ───────────────────────────────────────────────────────

export type TipoOperacion =
  | 'borrador'              // generación de borrador completo
  | 'copiloto'              // conversación en el copiloto
  | 'revision'              // revisión GEO-SEO
  | 'brief_seo'             // generación de brief SEO
  | 'prompt_imagen'         // generación de prompt de imagen
  | 'rag_embedding'         // embeddings para el índice RAG
  | 'imagen_flux'           // imagen destacada con FLUX
  | 'ad_creative'           // pieza social con FLUX
  | 'video_reel'            // reel generado con FLUX + FFmpeg
  | 'video_story'           // story generado con FLUX + FFmpeg
  | 'humanizacion'          // humanización de texto IA
  | 'georadar_claude'       // GEORadar — consulta Claude
  | 'georadar_gpt4'         // GEORadar — consulta GPT-4
  | 'georadar_gemini'       // GEORadar — consulta Gemini
  | 'georadar_perplexity'   // GEORadar — consulta Perplexity
  | 'serpapi_search'        // búsqueda SerpApi (inspiración / CI)
  | 'dataforseo_keywords'   // DataForSEO keyword ideas
  | 'dataforseo_volume'     // DataForSEO search volume
  | 'competitor_keywords'   // DataForSEO competitor keywords
  | 'analisis_web'          // Análisis de contenido web (Claude)

// ─── Cálculo ─────────────────────────────────────────────────────────────────

/** Calcula coste Claude en USD a partir de tokens de entrada y salida */
export function calcularCosteClaudeUSD(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRECIO_CLAUDE_INPUT) + (outputTokens * PRECIO_CLAUDE_OUTPUT)
}

/** Alias semántico de calcularCosteClaudeUSD */
export const calcularCosteClaudeTokens = calcularCosteClaudeUSD

/** Calcula coste GPT-4o en USD a partir de tokens de entrada y salida */
export function calcularCosteGPT4USD(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRECIO_GPT4_INPUT) + (outputTokens * PRECIO_GPT4_OUTPUT)
}

/** Alias semántico de calcularCosteGPT4USD */
export const calcularCosteGPT4Tokens = calcularCosteGPT4USD

/** Calcula coste Gemini en USD a partir de tokens de entrada y salida */
export function calcularCosteGeminiUSD(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRECIO_GEMINI_INPUT) + (outputTokens * PRECIO_GEMINI_OUTPUT)
}

/** Alias semántico de calcularCosteGeminiUSD */
export const calcularCosteGeminiTokens = calcularCosteGeminiUSD

/** Calcula coste de embeddings OpenAI en USD */
export function calcularCosteEmbeddingUSD(tokens: number): number {
  return tokens * PRECIO_EMBED_TOKEN
}

/** Calcula coste de imágenes FLUX en USD */
export function calcularCosteFluxUSD(numImagenes: number): number {
  return numImagenes * PRECIO_FLUX_IMAGEN
}

/** Formatea un coste en USD con 4 decimales para la UI */
export function formatearCosteUSD(coste: number): string {
  return `$${(coste ?? 0).toFixed(4)}`
}

// ─── Persistencia ─────────────────────────────────────────────────────────────

export interface RegistroCosteInput {
  cliente_id?    : string | null
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
      cliente_id    : data.cliente_id    ?? null,
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
