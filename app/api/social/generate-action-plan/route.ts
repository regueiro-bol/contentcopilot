/**
 * POST /api/social/generate-action-plan
 *
 * Claude genera la Fase 6 — Plan de acción.
 * Lee: todas las fases anteriores, social_platforms, clientes.
 * Devuelve: { roadmap, first90Days, teamResources }
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

function jsonbToText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && 'content' in val) {
    return String((val as { content: string }).content)
  }
  return ''
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

  const [
    { data: cliente },
    { data: platforms },
    { data: strategy },
    { data: architecture },
    { data: kpis },
  ] = await Promise.all([
    supabase.from('clientes').select('nombre, sector').eq('id', clientId).single(),
    supabase.from('social_platforms').select('platform, is_active, strategic_priority').eq('client_id', clientId).order('platform'),
    supabase.from('social_strategy').select('platform_decisions').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_content_architecture').select('publishing_cadence').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_kpis').select('kpis_by_objective').eq('client_id', clientId).maybeSingle(),
  ])

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const activePlatforms = (platforms ?? [])
    .filter((p) => p.is_active || p.strategic_priority === 'alta' || p.strategic_priority === 'mantener')
    .map((p) => PLATFORM_LABELS[p.platform] ?? p.platform)

  const cadenceText     = jsonbToText(architecture?.publishing_cadence).substring(0, 300)
  const kpisText        = jsonbToText(kpis?.kpis_by_objective).substring(0, 300)
  const strategyText    = strategy?.platform_decisions?.substring(0, 300) ?? ''

  const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (sector: ${cliente.sector})` : ''}

RESUMEN ESTRATÉGICO:
Plataformas activas: ${activePlatforms.join(', ') || '(no definidas)'}
Cadencia planificada: ${cadenceText || '(no disponible)'}
KPIs principales: ${kpisText || '(no disponible)'}

CONTEXTO:
${strategyText || '(no disponible)'}

Genera el plan de acción en tres bloques:

BLOQUE 1 — ROADMAP DE IMPLEMENTACIÓN
Tres horizontes con sus objetivos e hitos:

Horizonte 1 — Fundación (Días 1-30):
Qué infraestructura construir antes de publicar nada.
Acciones concretas por semana.
Hito de validación al final del horizonte.

Horizonte 2 — Activación (Días 31-90):
Arranque de la ejecución y calibración con datos reales.
Qué experimentos hacer y cómo medir si funcionan.
Hito de validación al final.

Horizonte 3 — Consolidación (Meses 4-12):
Hitos estratégicos del año (eventos, lanzamientos, campañas).
Cómo escalar lo que funciona.

BLOQUE 2 — PRIMEROS 90 DÍAS EN DETALLE
Semana a semana para el Horizonte 1.
Bloque a bloque para el Horizonte 2.
Para cada período: acciones concretas, responsable y entregable.

BLOQUE 3 — EQUIPO Y RECURSOS
Roles necesarios con dedicación mensual estimada.
Stack tecnológico recomendado con coste orientativo.
Modelo de coordinación entre equipo y cliente.

Extensión: 200-250 palabras por bloque. Concreto y accionable.

Responde SOLO con JSON sin markdown:
{
  "roadmap": "...",
  "first90Days": "...",
  "teamResources": "..."
}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model : 'claude-sonnet-4-5',
      max_tokens: 5120,
      system: `Eres un consultor senior de social media especializado en implementación y gestión de cuentas B2B. Tu trabajo es traducir una estrategia completa en un plan de acción realista: qué hace quién, cuándo y con qué recursos.

El plan debe ser ambicioso pero ejecutable. Mejor un plan de 80 acciones que se cumplen que un plan de 200 que se abandona en el mes 2.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude no devolvió JSON válido')

    const result = JSON.parse(jsonMatch[0]) as {
      roadmap       : string
      first90Days   : string
      teamResources : string
    }

    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-generate-action-plan',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
    }).catch(console.error)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-action-plan] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
