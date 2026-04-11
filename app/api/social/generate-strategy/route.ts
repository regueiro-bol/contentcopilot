/**
 * POST /api/social/generate-strategy
 *
 * Claude genera la Fase 2 — Estrategia de plataformas.
 * Lee: social_platforms, social_audit_synthesis, clientes.
 * Devuelve: { platformDecisions, channelArchitecture, editorialDifferentiation }
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

export async function POST(request: NextRequest) {
  let body: { clientId: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId } = body
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  try {
    const supabase = createAdminClient()

    // Leer datos necesarios en paralelo
    const [{ data: cliente }, { data: platforms }, { data: synthesis }] = await Promise.all([
      supabase.from('clientes').select('nombre, sector, descripcion, identidad_corporativa').eq('id', clientId).single(),
      supabase.from('social_platforms').select('platform, followers, posts_per_week, avg_engagement, score_brand_consistency, score_editorial_quality, score_activity, score_community, strategic_priority, strategic_conclusion').eq('client_id', clientId).order('platform'),
      supabase.from('social_audit_synthesis').select('main_strengths, main_weaknesses').eq('client_id', clientId).maybeSingle(),
    ])

    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    const clienteContext = [
      cliente.sector             ? `Sector: ${cliente.sector}` : '',
      (cliente as any).descripcion          ? `Contexto: ${String((cliente as any).descripcion).substring(0, 300)}` : '',
      (cliente as any).identidad_corporativa ? `Identidad de marca: ${String((cliente as any).identidad_corporativa).substring(0, 300)}` : '',
    ].filter(Boolean).join('\n')

    // Construir resumen de plataformas
    const platformsSummary = (platforms ?? []).map((p) => {
      const name   = PLATFORM_LABELS[p.platform] ?? p.platform
      const scores = [p.score_brand_consistency, p.score_editorial_quality, p.score_activity, p.score_community].filter((v) => v != null) as number[]
      const avg    = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A'
      return `${name.toUpperCase()}:
  Seguidores: ${p.followers ?? 'N/D'} | Posts/semana: ${p.posts_per_week ?? 'N/D'} | Engagement: ${p.avg_engagement ? `${p.avg_engagement}%` : 'N/D'}
  Puntuación media: ${avg}/5 (marca: ${p.score_brand_consistency ?? '-'}, calidad: ${p.score_editorial_quality ?? '-'}, actividad: ${p.score_activity ?? '-'}, comunidad: ${p.score_community ?? '-'})
  Conclusión: ${p.strategic_conclusion ?? '(sin conclusión)'}
  Prioridad asignada: ${p.strategic_priority ?? 'sin asignar'}`
    }).join('\n\n')

    const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (sector: ${cliente.sector})` : ''}

AUDITORÍA POR PLATAFORMAS:
${platformsSummary || '(Sin plataformas auditadas)'}

SÍNTESIS DE AUDITORÍA:
Fortalezas: ${synthesis?.main_strengths ?? '(no disponible)'}
Debilidades: ${synthesis?.main_weaknesses ?? '(no disponible)'}

Genera la estrategia de plataformas en tres bloques:

BLOQUE 1 — DECISIONES POR PLATAFORMA
Para cada plataforma auditada, incluir:
- Veredicto claro (ej: "ACTIVACIÓN PLENA", "RECALIBRACIÓN", "MODO RESIDUAL", "DESCARTAR")
- Rol específico que cumple en el ecosistema de marca
- Nivel de inversión editorial recomendado
- 2-3 acciones concretas inmediatas

BLOQUE 2 — ARQUITECTURA DEL ECOSISTEMA
Cómo se relacionan las plataformas entre sí.
Qué plataforma lidera, cuáles amplifican, cuáles distribuyen.
Flujo de contenido entre canales.

BLOQUE 3 — DIFERENCIACIÓN EDITORIAL
Qué hace diferente el contenido en cada plataforma activa.
Tono, formato y enfoque específico de cada una.

Extensión: 150-200 palabras por bloque. Texto continuo, sin bullets excesivos. Lenguaje directo y profesional.

Responde SOLO con JSON sin markdown:
{
  "platformDecisions": "...",
  "channelArchitecture": "...",
  "editorialDifferentiation": "..."
}`

    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model     : 'claude-sonnet-4-5',
      max_tokens: 4096,
      system    : `Eres un consultor senior de social media y estrategia de contenidos digitales.

Cliente: ${cliente.nombre}
${clienteContext}

Tu trabajo es tomar los resultados de una auditoría de redes sociales y convertirlos en decisiones estratégicas claras y accionables, adaptadas específicamente al sector, audiencia y contexto de este cliente. Nunca uses enfoques genéricos.

Las decisiones deben ser razonadas. Cada plataforma recibe un veredicto claro: qué hacer, por qué y con qué nivel de inversión editorial. Evita recomendaciones vagas. Si una plataforma no vale la pena, dilo.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude no devolvió JSON válido')

    const result = JSON.parse(jsonMatch[0]) as {
      platformDecisions      : string
      channelArchitecture    : string
      editorialDifferentiation: string
    }

    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-generate-strategy',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
    }).catch(console.error)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-strategy] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
