import Anthropic from '@anthropic-ai/sdk'

// Inicializar cliente de Anthropic con la clave API
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Opciones para la generación de contenido con Claude
 */
export interface OpcionesGeneracion {
  modelo?: string
  maxTokens?: number
  temperatura?: number
  sistemaPrompt?: string
}

/**
 * Genera contenido usando Claude con streaming
 * Ideal para el copiloto en tiempo real
 */
export async function* generarContenidoStream(
  mensajes: Array<{ role: 'user' | 'assistant'; content: string }>,
  opciones: OpcionesGeneracion = {}
) {
  const {
    modelo = 'claude-opus-4-6',
    maxTokens = 2048,
    sistemaPrompt = 'Eres un experto copywriter y estratega de contenido digital. Ayudas a crear contenido de alta calidad en español para marcas y empresas. Tu estilo es claro, persuasivo y adaptado al tono de cada cliente.',
  } = opciones

  const stream = anthropic.messages.stream({
    model: modelo,
    max_tokens: maxTokens,
    system: sistemaPrompt,
    messages: mensajes,
  })

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      yield chunk.delta.text
    }
  }
}

/**
 * Genera contenido con Claude sin streaming
 * Para operaciones de análisis y procesamiento en segundo plano
 */
export async function generarContenido(
  prompt: string,
  sistemaPrompt?: string,
  opciones: OpcionesGeneracion = {}
): Promise<string> {
  const {
    modelo = 'claude-opus-4-6',
    maxTokens = 2048,
  } = opciones

  const mensaje = await anthropic.messages.create({
    model: modelo,
    max_tokens: maxTokens,
    system:
      sistemaPrompt ??
      'Eres un experto copywriter y estratega de contenido digital. Responde siempre en español.',
    messages: [{ role: 'user', content: prompt }],
  })

  const bloque = mensaje.content[0]
  if (bloque.type !== 'text') return ''
  return bloque.text
}

/**
 * Genera sugerencias de mejora para un texto dado
 */
export async function generarSugerencias(
  texto: string,
  contextoCliente?: string
): Promise<string[]> {
  const prompt = `Analiza el siguiente texto y proporciona exactamente 3 sugerencias concretas de mejora.
Devuelve SOLO las sugerencias en formato JSON array de strings, sin explicaciones adicionales.

${contextoCliente ? `Contexto del cliente: ${contextoCliente}\n` : ''}
Texto a analizar:
"""
${texto}
"""

Responde únicamente con: ["sugerencia 1", "sugerencia 2", "sugerencia 3"]`

  const respuesta = await generarContenido(prompt, undefined, { maxTokens: 512 })

  try {
    const sugerencias = JSON.parse(respuesta)
    if (Array.isArray(sugerencias)) return sugerencias
  } catch {
    // Si no se puede parsear el JSON, dividir por líneas
    return respuesta
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .slice(0, 3)
  }

  return []
}

export default anthropic
