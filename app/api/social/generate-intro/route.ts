/**
 * POST /api/social/generate-intro
 *
 * Claude genera la introducción estratégica y el análisis DAFO
 * para la primera sección del informe Word exportable.
 *
 * Body: { clientId }
 * Returns: { intro: string, dafo: { fortalezas, debilidades, oportunidades, amenazas } }
 * Saves to: social_audit_synthesis (intro_text, dafo_* columns)
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

    const [{ data: cliente }, { data: platforms }, { data: auditSynth }] = await Promise.all([
      supabase.from('clientes').select('nombre, sector, descripcion, identidad_corporativa').eq('id', clientId).single(),
      supabase.from('social_platforms').select('platform, followers, avg_engagement, posts_per_week, strategic_priority, strategic_conclusion').eq('client_id', clientId).order('platform'),
      supabase.from('social_audit_synthesis').select('main_strengths, main_weaknesses').eq('client_id', clientId).maybeSingle(),
    ])

    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    const clienteContext = [
      cliente.sector             ? `Sector: ${cliente.sector}` : '',
      (cliente as any).descripcion          ? `Contexto: ${String((cliente as any).descripcion).substring(0, 300)}` : '',
      (cliente as any).identidad_corporativa ? `Identidad de marca: ${String((cliente as any).identidad_corporativa).substring(0, 200)}` : '',
    ].filter(Boolean).join('\n')

    const platformsSummary = (platforms ?? [])
      .map((p) => {
        const name = PLATFORM_LABELS[p.platform] ?? p.platform
        return `${name}: ${p.followers ?? 0} seguidores, engagement ${p.avg_engagement ? `${p.avg_engagement}%` : 'N/D'}, ${p.posts_per_week ?? 0} posts/sem, prioridad: ${p.strategic_priority ?? 'sin asignar'}`
      }).join('\n')

    const userPrompt = `CLIENTE: ${cliente.nombre}${cliente.sector ? ` (${cliente.sector})` : ''}

PLATAFORMAS ANALIZADAS:
${platformsSummary || '(sin datos de plataformas)'}

SÍNTESIS DE AUDITORÍA:
Fortalezas: ${auditSynth?.main_strengths?.substring(0, 400) ?? '(no disponible)'}
Debilidades: ${auditSynth?.main_weaknesses?.substring(0, 400) ?? '(no disponible)'}

Genera el contenido introductorio del informe en dos partes:

PARTE 1 — INTRODUCCIÓN ESTRATÉGICA (120-150 palabras)
Executive summary del punto de partida de esta marca en social media. Por qué este análisis es relevante ahora para este cliente concreto. Qué oportunidad estratégica tiene en su sector digital. Tono directo, consultivo, sin adornos. Sin citar los datos numéricos literalmente — interpreta qué significan para la marca.

PARTE 2 — ANÁLISIS DAFO SOCIAL MEDIA
Para cada cuadrante, exactamente 3 bullets concretos (una línea cada uno, sin guiones ni asteriscos al inicio).
Los bullets deben ser específicos para este cliente, no genéricos de la industria.

Responde SOLO con JSON sin markdown:
{
  "intro": "...",
  "dafo": {
    "fortalezas": "bullet1\\nbullet2\\nbullet3",
    "debilidades": "bullet1\\nbullet2\\nbullet3",
    "oportunidades": "bullet1\\nbullet2\\nbullet3",
    "amenazas": "bullet1\\nbullet2\\nbullet3"
  }
}`

    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model     : 'claude-sonnet-4-5',
      max_tokens: 2048,
      system    : `Eres un consultor senior de social media y estrategia de contenidos digitales.

Cliente: ${cliente.nombre}
${clienteContext}

Tu trabajo es redactar el análisis introductorio de un informe estratégico de social media de alto nivel. Debe sonar como un consultor que conoce profundamente el sector del cliente. Adapta los insights al sector y contexto específico — nunca texto genérico que podría aplicarse a cualquier marca.`,
      messages  : [{ role: 'user', content: userPrompt }],
    })

    const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude no devolvió JSON válido')

    const result = JSON.parse(jsonMatch[0]) as {
      intro: string
      dafo : { fortalezas: string; debilidades: string; oportunidades: string; amenazas: string }
    }

    // Guardar en social_audit_synthesis
    await supabase.from('social_audit_synthesis').upsert(
      {
        client_id        : clientId,
        intro_text       : result.intro,
        dafo_fortalezas  : result.dafo.fortalezas,
        dafo_debilidades : result.dafo.debilidades,
        dafo_oportunidades: result.dafo.oportunidades,
        dafo_amenazas    : result.dafo.amenazas,
      },
      { onConflict: 'client_id' },
    )

    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-generate-intro',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
    }).catch(console.error)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-intro] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
