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

/**
 * Objeto centralizado de todos los precios por servicio.
 * Usar estos valores en lugar de literales hardcoded.
 */
export const PRECIOS = {
  // Claude Sonnet
  claude_input:  0.000003,    // $3 por millón tokens input
  claude_output: 0.000015,    // $15 por millón tokens output

  // OpenAI GPT-4o
  gpt4_input:    0.0000025,   // $2.50 por millón tokens input
  gpt4_output:   0.000010,    // $10 por millón tokens output

  // OpenAI embeddings (text-embedding-3-small)
  embedding:     0.00000002,  // $0.02 por millón tokens

  // Google Gemini 1.5 Flash
  gemini_input:  0.00000125,  // $1.25 por millón tokens input
  gemini_output: 0.000005,    // $5 por millón tokens output

  // Perplexity (por query sonar-pro)
  perplexity_query: 0.005,    // $0.005 por query

  // Imágenes FLUX
  flux_imagen:   0.055,       // $0.055 por imagen

  // APIs externas
  serpapi_busqueda:    0.005,  // $0.005 por búsqueda (estimado)
  datasorseo_keyword:  0.0001, // $0.0001 por keyword procesada
} as const

// ─── Tipos de operación ───────────────────────────────────────────────────────

export type TipoOperacion =
  // Claude API (contenidos)
  | 'borrador'          // generación de borrador completo
  | 'copiloto'          // conversación en el copiloto
  | 'revision'          // revisión GEO-SEO
  | 'humanizacion'      // humanización de texto IA
  | 'prompt_imagen'     // generación de prompt de imagen
  // Claude API (estrategia / otros módulos)
  | 'brief_seo'         // generación de brief SEO
  | 'inspiracion'       // análisis de inspiración con Claude
  | 'estrategia_claude' // generación de mapa estratégico
  | 'georadar_claude'   // query GEORadar vía Claude
  // OpenAI
  | 'rag_embedding'     // embeddings para el índice RAG
  | 'georadar_gpt4'     // query GEORadar vía GPT-4o
  // Google Gemini
  | 'georadar_gemini'   // query GEORadar vía Gemini
  // Perplexity
  | 'georadar_perplexity' // query GEORadar vía Perplexity
  // Imágenes y vídeos (FLUX)
  | 'imagen_flux'       // imagen destacada con FLUX
  | 'ad_creative'       // pieza social con FLUX
  | 'video_reel'        // reel generado con FLUX + FFmpeg
  | 'video_story'       // story generado con FLUX + FFmpeg
  // APIs externas
  | 'serpapi'           // búsqueda en SerpApi (Google, Ads Transparency…)
  | 'datasorseo'        // keywords DataForSEO
  | 'georadar_scan'     // coste agregado de un scan completo (resumen)

// ─── Cálculo ─────────────────────────────────────────────────────────────────

/** Calcula coste Claude en USD a partir de tokens de entrada y salida */
export function calcularCosteClaudeUSD(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRECIOS.claude_input) + (outputTokens * PRECIOS.claude_output)
}

/** Alias semántico de calcularCosteClaudeUSD */
export const calcularCosteClaudeTokens = calcularCosteClaudeUSD

/** Calcula coste GPT-4o en USD a partir de tokens de entrada y salida */
export function calcularCosteGPT4Tokens(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRECIOS.gpt4_input) + (outputTokens * PRECIOS.gpt4_output)
}

/** Calcula coste Gemini en USD a partir de tokens de entrada y salida */
export function calcularCosteGeminiTokens(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRECIOS.gemini_input) + (outputTokens * PRECIOS.gemini_output)
}

/** Calcula coste de embeddings OpenAI en USD */
export function calcularCosteEmbeddingUSD(tokens: number): number {
  return tokens * PRECIOS.embedding
}

/** Calcula coste de imágenes FLUX en USD */
export function calcularCosteFluxUSD(numImagenes: number): number {
  return numImagenes * PRECIOS.flux_imagen
}

/** Formatea un coste en USD con 4 decimales para la UI */
export function formatearCosteUSD(coste: number): string {
  return `$${(coste ?? 0).toFixed(4)}`
}

// ─── Persistencia ─────────────────────────────────────────────────────────────

export interface RegistroCosteInput {
  contenido_id?  : string | null
  proyecto_id?   : string | null
  cliente_id?    : string | null
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
      cliente_id    : data.cliente_id    ?? null,
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
