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
  // Fallback: stringify so AI still gets useful context
  try { return JSON.stringify(val) } catch { return '' }
}

function truncate(text: string, max = 500): string {
  if (!text) return ''
  return text.length > max ? text.substring(0, max) + '…' : text
}

function extractBlock(text: string, label: string): string {
  // Matches "BLOQUE N — anything" up to the next BLOQUE heading or end of string
  const regex = new RegExp(`${label}[^\\n]*\\n([\\s\\S]*?)(?=BLOQUE \\d|$)`, 'i')
  const match = text.match(regex)
  if (match) return match[1].trim()
  // Fallback: if no blocks found at all, put everything in roadmap
  if (label === 'BLOQUE 1') return text.trim()
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

  // ── Global try-catch wraps ALL logic (DB queries + prompt building + AI call) ──
  try {
    const supabase = createAdminClient()

    const [
      { data: cliente },
      { data: platforms },
      { data: strategy },
      { data: architecture },
      { data: kpis },
    ] = await Promise.all([
      supabase.from('clientes').select('nombre, sector, descripcion, identidad_corporativa').eq('id', clientId).single(),
      supabase.from('social_platforms').select('platform, strategic_priority').eq('client_id', clientId).order('platform'),
      supabase.from('social_strategy').select('platform_decisions').eq('client_id', clientId).maybeSingle(),
      supabase.from('social_content_architecture').select('publishing_cadence').eq('client_id', clientId).maybeSingle(),
      supabase.from('social_kpis').select('kpis_by_objective').eq('client_id', clientId).maybeSingle(),
    ])

    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cliente as any
    const clienteContext = [
      c.sector              ? `Sector: ${c.sector}` : '',
      c.descripcion         ? `Contexto: ${truncate(String(c.descripcion), 500)}` : '',
      c.identidad_corporativa ? `Identidad de marca: ${truncate(String(c.identidad_corporativa), 500)}` : '',
    ].filter(Boolean).join('\n')

    const activePlatforms = (platforms ?? [])
      .filter((p) => p.strategic_priority === 'alta' || p.strategic_priority === 'mantener' || !p.strategic_priority)
      .map((p) => PLATFORM_LABELS[p.platform] ?? p.platform)

    const cadenceText  = truncate(jsonbToText(architecture?.publishing_cadence))
    const kpisText     = truncate(jsonbToText(kpis?.kpis_by_objective))
    const strategyText = truncate(strategy?.platform_decisions ?? '')

    const userPrompt = `CLIENTE: ${c.nombre}${c.sector ? ` (sector: ${c.sector})` : ''}

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

Usa exactamente estos encabezados (sin numeración extra):

BLOQUE 1 — ROADMAP DE IMPLEMENTACIÓN
[texto del roadmap]

BLOQUE 2 — PRIMEROS 90 DÍAS
[texto de los primeros 90 días]

BLOQUE 3 — EQUIPO Y RECURSOS
[texto del equipo y recursos]`

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model     : 'claude-sonnet-4-5',
      max_tokens: 1500,
      system    : `Eres un consultor senior de social media y estrategia de contenidos digitales.

Cliente: ${c.nombre}
${clienteContext}

Tu trabajo es traducir una estrategia completa en un plan de acción realista adaptado al sector, tamaño y contexto de este cliente: qué hace quién, cuándo y con qué recursos. Nunca uses enfoques genéricos.

El plan debe ser ambicioso pero ejecutable. Mejor un plan de 80 acciones que se cumplen que un plan de 200 que se abandona en el mes 2.`,
      messages  : [{ role: 'user', content: userPrompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Respuesta inesperada de Claude')
    const text = content.text.trim()

    const result = {
      roadmap      : extractBlock(text, 'BLOQUE 1'),
      first90Days  : extractBlock(text, 'BLOQUE 2'),
      teamResources: extractBlock(text, 'BLOQUE 3'),
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
    console.error('[social/generate-action-plan] ERROR:', msg, err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
