/**
 * POST /api/social/generate-architecture
 *
 * Claude genera la Fase 3 — Arquitectura de contenidos.
 * Lee: social_platforms, social_strategy, social_audit_synthesis, clientes.
 * Devuelve: { editorialPillars, formatsByPlatform, publishingCadence, calendarTemplate }
 */

import { auth } from '@clerk/nextjs/server'
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

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { clientId: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId } = body
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()

  const [{ data: cliente }, { data: platforms }, { data: strategy }] = await Promise.all([
    supabase.from('clientes').select('nombre, sector').eq('id', clientId).single(),
    supabase.from('social_platforms').select('platform, is_active, strategic_priority, strategic_conclusion').eq('client_id', clientId).order('platform'),
    supabase.from('social_strategy').select('platform_decisions, channel_architecture').eq('client_id', clientId).maybeSingle(),
  ])

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const activePlatforms = (platforms ?? [])
    .filter((p) => p.is_active || p.strategic_priority === 'alta' || p.strategic_priority === 'mantener')
    .map((p) => PLATFORM_LABELS[p.platform] ?? p.platform)

  const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (sector: ${cliente.sector})` : ''}

ESTRATEGIA DE PLATAFORMAS (Fase 2):
Decisiones por plataforma:
${strategy?.platform_decisions ?? '(no disponible)'}

Arquitectura del ecosistema:
${strategy?.channel_architecture ?? '(no disponible)'}

PLATAFORMAS ACTIVAS: ${activePlatforms.join(', ') || '(no definidas)'}

Genera la arquitectura de contenidos en cuatro bloques:

BLOQUE 1 — PILARES EDITORIALES
3-5 pilares con:
- Nombre del pilar
- Territorio temático (de qué trata)
- Ángulo permanente (cómo lo aborda la marca de forma única)
- Ejemplos de temas tipo
- Distribución por plataforma (en cuáles aplica)

BLOQUE 2 — FORMATOS POR PLATAFORMA
Para cada plataforma activa:
- 3-5 formatos nativos recomendados
- Nombre interno para el equipo
- Función editorial de cada formato
- Frecuencia recomendada

BLOQUE 3 — CADENCIA DE PUBLICACIÓN
Posts por semana por plataforma.
Distribución por días de la semana.
Horarios recomendados si son relevantes.

BLOQUE 4 — CALENDARIO TIPO SEMANAL
Descripción de una semana tipo: qué se publica cada día en cada plataforma activa.

Extensión: 150-200 palabras por bloque. Lenguaje concreto y operativo.

Responde SOLO con JSON sin markdown:
{
  "editorialPillars": "...",
  "formatsByPlatform": "...",
  "publishingCadence": "...",
  "calendarTemplate": "..."
}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model : 'claude-sonnet-4-5',
      max_tokens: 5120,
      system: `Eres un consultor senior de social media especializado en arquitectura de contenidos para marcas B2B. Tu trabajo es definir la estructura editorial que sostendrá toda la producción de contenido social: pilares, formatos y cadencia.

Los pilares no son categorías temáticas genéricas: son posiciones intelectuales que la marca ocupa. Un pilar editorial dice qué lugar único ocupa la marca en la conversación de su sector, no solo sobre qué temas habla.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude no devolvió JSON válido')

    const result = JSON.parse(jsonMatch[0]) as {
      editorialPillars  : string
      formatsByPlatform : string
      publishingCadence : string
      calendarTemplate  : string
    }

    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-generate-architecture',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
    }).catch(console.error)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-architecture] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
