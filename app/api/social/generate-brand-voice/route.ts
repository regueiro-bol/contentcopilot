/**
 * POST /api/social/generate-brand-voice
 *
 * Claude genera la Fase 4 — Tono y guidelines de marca.
 * Lee: brand_context (si existe), social_strategy, social_content_architecture,
 *      social_platforms, clientes.
 * Devuelve: { voiceManual, registerByPlatform, editorialRedLines, consistencyGuidelines }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste, calcularCosteClaudeUSD } from '@/lib/costes'

export const maxDuration = 60

const PLATFORM_LABELS: Record<string, string> = {
  linkedin  : 'LinkedIn',
  twitter_x : 'Twitter/X',
  instagram : 'Instagram',
  facebook  : 'Facebook',
  tiktok    : 'TikTok',
  youtube   : 'YouTube',
}

// Helper: extrae texto de campo JSONB guardado como { content: "..." }
function jsonbToText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && 'content' in val) {
    return String((val as { content: string }).content)
  }
  return ''
}

export async function POST(request: NextRequest) {

  let body: { clientId: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId } = body
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()

  // Cargar datos (brand_context es opcional — silencioso si no existe)
  const [
    { data: cliente },
    { data: platforms },
    { data: strategy },
    { data: architecture },
    brandContextResult,
  ] = await Promise.all([
    supabase.from('clientes').select('nombre, sector').eq('id', clientId).single(),
    supabase.from('social_platforms').select('platform, is_active, strategic_priority').eq('client_id', clientId).order('platform'),
    supabase.from('social_strategy').select('platform_decisions').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_content_architecture').select('editorial_pillars').eq('client_id', clientId).maybeSingle(),
    supabase.from('brand_context').select('tone_of_voice, style_keywords, restrictions, raw_summary').eq('client_id', clientId).maybeSingle().then(
      (r) => r,
      () => ({ data: null, error: null }), // Silencioso si la tabla no existe
    ),
  ])

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const brandContext = brandContextResult?.data ?? null

  const activePlatforms = (platforms ?? [])
    .filter((p) => p.is_active || p.strategic_priority === 'alta' || p.strategic_priority === 'mantener')
    .map((p) => PLATFORM_LABELS[p.platform] ?? p.platform)

  const editorialPillarsText = jsonbToText(architecture?.editorial_pillars).substring(0, 500)

  // Construir sección de brand_context si existe
  const brandContextSection = brandContext
    ? `
IDENTIDAD DE MARCA (del brandbook):
${brandContext.tone_of_voice ? `Tono de voz: ${brandContext.tone_of_voice}` : ''}
${brandContext.style_keywords?.length ? `Keywords de estilo: ${brandContext.style_keywords.join(', ')}` : ''}
${brandContext.restrictions ? `Restricciones de marca: ${brandContext.restrictions}` : ''}
${brandContext.raw_summary ? `Resumen de marca: ${brandContext.raw_summary.substring(0, 500)}` : ''}
`.trim()
    : ''

  const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (sector: ${cliente.sector})` : ''}

${brandContextSection}

PILARES EDITORIALES (Fase 3):
${editorialPillarsText || '(no disponibles)'}

PLATAFORMAS ACTIVAS: ${activePlatforms.join(', ') || '(no definidas)'}

ESTRATEGIA (extracto Fase 2):
${strategy?.platform_decisions ? strategy.platform_decisions.substring(0, 400) : '(no disponible)'}

Genera las guidelines de tono y voz en cuatro bloques:

BLOQUE 1 — MANUAL DE VOZ PARA REDES
5 atributos de voz con:
- Nombre del atributo
- Qué significa en la práctica
- Cómo suena cuando funciona bien
- Cómo suena cuando falla (anti-ejemplo)

BLOQUE 2 — REGISTRO POR PLATAFORMA
Para cada plataforma activa:
- Longitud típica de posts
- Tono específico (más formal/informal, analítico/narrativo...)
- Estructura recomendada de posts
- Uso de emojis (cantidad y función)
- Uso de hashtags (cantidad, posición)
- Dónde van los links

BLOQUE 3 — LO QUE LA MARCA NUNCA DICE
10-15 reglas concretas de lo que está prohibido: expresiones, tonos, estructuras o enfoques que rompen la voz editorial de la marca.
Ejemplos de frases o enfoques prohibidos.

BLOQUE 4 — CONSISTENCIA EN EQUIPO DISTRIBUIDO
Checklist de publicación universal (5-8 puntos).
Proceso de revisión y aprobación.
Qué hacer cuando hay duda.

Extensión: 150-200 palabras por bloque. Operativo y concreto.

Responde SOLO con JSON sin markdown:
{
  "voiceManual": "...",
  "registerByPlatform": "...",
  "editorialRedLines": "...",
  "consistencyGuidelines": "..."
}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model : 'claude-sonnet-4-5',
      max_tokens: 5120,
      system: `Eres un consultor senior especializado en identidad editorial y brand voice para redes sociales. Tu trabajo es definir cómo una marca habla en redes: no solo el tono abstracto, sino las reglas concretas que un community manager puede aplicar en cada post.

Las guidelines deben ser operativas, no teóricas. Cada regla debe poder aplicarse en 5 segundos antes de publicar.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude no devolvió JSON válido')

    const result = JSON.parse(jsonMatch[0]) as {
      voiceManual           : string
      registerByPlatform    : string
      editorialRedLines     : string
      consistencyGuidelines : string
    }

    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-generate-brand-voice',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
    }).catch(console.error)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-brand-voice] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
