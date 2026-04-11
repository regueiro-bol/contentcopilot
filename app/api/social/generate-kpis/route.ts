/**
 * POST /api/social/generate-kpis
 *
 * Claude genera la Fase 5 — KPIs y métricas.
 * Lee: social_platforms, social_strategy, social_content_architecture, clientes.
 * Devuelve: { kpisByObjective, measurementMethodology, reportingSystem }
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

  const [{ data: cliente }, { data: platforms }, { data: strategy }, { data: architecture }] = await Promise.all([
    supabase.from('clientes').select('nombre, sector, descripcion, identidad_corporativa').eq('id', clientId).single(),
    supabase.from('social_platforms').select('platform, followers, avg_engagement, posts_per_week, strategic_priority').eq('client_id', clientId).order('platform'),
    supabase.from('social_strategy').select('platform_decisions').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_content_architecture').select('publishing_cadence').eq('client_id', clientId).maybeSingle(),
  ])

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const clienteContext = [
    cliente.sector             ? `Sector: ${cliente.sector}` : '',
    (cliente as any).descripcion          ? `Contexto: ${String((cliente as any).descripcion).substring(0, 300)}` : '',
    (cliente as any).identidad_corporativa ? `Identidad de marca: ${String((cliente as any).identidad_corporativa).substring(0, 300)}` : '',
  ].filter(Boolean).join('\n')

  const activePlatformsSummary = (platforms ?? [])
    .filter((p) => p.strategic_priority === 'alta' || p.strategic_priority === 'mantener' || !p.strategic_priority)
    .map((p) => {
      const name = PLATFORM_LABELS[p.platform] ?? p.platform
      return `${name}: ${p.followers ?? 0} seguidores | Engagement: ${p.avg_engagement ? `${p.avg_engagement}%` : 'N/D'} | Posts/semana actual: ${p.posts_per_week ?? 'N/D'}`
    }).join('\n')

  const cadenceText = jsonbToText(architecture?.publishing_cadence).substring(0, 400)

  const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (sector: ${cliente.sector})` : ''}

PLATAFORMAS ACTIVAS Y MÉTRICAS ACTUALES:
${activePlatformsSummary || '(sin datos de plataformas)'}

ESTRATEGIA DE PLATAFORMAS:
${strategy?.platform_decisions?.substring(0, 400) ?? '(no disponible)'}

CADENCIA PLANIFICADA:
${cadenceText || '(no disponible)'}

Genera el sistema de KPIs en tres bloques:

BLOQUE 1 — INDICADORES POR OBJETIVO
Organizar en tres niveles:
- Métricas de autoridad (¿está la marca construyendo liderazgo real?)
- Métricas de rendimiento por plataforma (¿funciona el contenido?)
- Métricas de actividad (¿se está ejecutando la estrategia?)

Para cada KPI incluir:
- Nombre del indicador
- Qué mide exactamente
- Cómo se obtiene el dato
- Target a 3 meses y target a 12 meses (realistas desde la situación actual)

BLOQUE 2 — METODOLOGÍA DE MEDICIÓN
Herramientas recomendadas (nativas de plataforma + externas).
Frecuencia de medición por tipo de métrica.
Quién extrae los datos y cómo se consolidan.

BLOQUE 3 — SISTEMA DE REPORTING
Estructura del reporte mensual (secciones, extensión).
Estructura de la revisión trimestral.
Formato de entrega al cliente.

Extensión: 150-200 palabras por bloque.
Targets basados en la situación actual del cliente, no en benchmarks genéricos.

Responde SOLO con JSON sin markdown:
{
  "kpisByObjective": "...",
  "measurementMethodology": "...",
  "reportingSystem": "..."
}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model : 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: `Eres un consultor senior de social media y estrategia de contenidos digitales.

Cliente: ${cliente.nombre}
${clienteContext}

Tu trabajo es definir un sistema de KPIs adaptado específicamente al sector, objetivos y contexto de este cliente. Nunca uses enfoques genéricos ni benchmarks de industrias que no correspondan.

Los KPIs deben ser realistas, medibles con herramientas estándar y organizados para que el cliente entienda qué significan. Lo que importa es si la marca está construyendo autoridad real, no si acumula likes.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude no devolvió JSON válido')

    const result = JSON.parse(jsonMatch[0]) as {
      kpisByObjective        : string
      measurementMethodology : string
      reportingSystem        : string
    }

    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-generate-kpis',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
    }).catch(console.error)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-kpis] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
