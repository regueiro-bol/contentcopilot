/**
 * POST /api/social/generate-synthesis
 *
 * Claude genera la síntesis completa de la Fase 1 (auditoría social):
 * - Fortalezas principales
 * - Debilidades principales
 * (benchmark_patterns y differentiation_opportunities se editan manualmente)
 *
 * Body: { clientId }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste, calcularCosteClaudeUSD } from '@/lib/costes'

export const maxDuration = 60

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

  // Cargar datos del cliente
  const { data: cliente } = await supabase
    .from('clientes')
    .select('nombre, sector, descripcion')
    .eq('id', clientId)
    .single()

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Cargar plataformas auditadas
  const { data: platforms } = await supabase
    .from('social_platforms')
    .select('*')
    .eq('client_id', clientId)
    .order('platform')

  // Cargar benchmark
  const { data: benchmark } = await supabase
    .from('social_benchmark')
    .select('*')
    .eq('client_id', clientId)
    .order('sort_order')

  if (!platforms || platforms.length === 0) {
    return NextResponse.json({ error: 'No hay plataformas auditadas para este cliente' }, { status: 422 })
  }

  // Construir resumen de plataformas para el prompt
  const platformsSummary = platforms.map((p) => {
    const scores = [p.score_brand_consistency, p.score_editorial_quality, p.score_activity, p.score_community].filter(Boolean)
    const avg = scores.length > 0 ? (scores.reduce((a: number, b: number) => a + (b ?? 0), 0) / scores.length).toFixed(1) : 'N/A'
    return `
PLATAFORMA: ${p.platform.toUpperCase()}
- Activa: ${p.is_active ? 'Sí' : 'No'} | Seguidores: ${p.followers ?? 'N/D'} | Posts/semana: ${p.posts_per_week ?? 'N/D'}
- Engagement: ${p.avg_engagement ? `${p.avg_engagement}%` : 'N/D'} | Puntuación media: ${avg}/5
- Formatos: ${(p.formats_used ?? []).join(', ') || 'N/D'}
- Temas: ${p.main_topics ?? 'N/D'}
- Conclusión estratégica: ${p.strategic_conclusion ?? '(sin conclusión)'}
- Prioridad: ${p.strategic_priority ?? 'sin asignar'}`.trim()
  }).join('\n\n')

  const benchmarkSummary = (benchmark ?? []).length > 0
    ? (benchmark ?? []).map((b) => `- ${b.name} (${b.platform}): ${b.what_they_do_well ?? 'sin descripción'}`).join('\n')
    : '(Sin referentes de benchmark configurados)'

  const prompt = `Eres un estratega de social media experto. Analiza la auditoría completa de redes sociales del cliente y genera la síntesis de la Fase 1.

CLIENTE: ${cliente.nombre}
SECTOR: ${cliente.sector ?? 'No especificado'}
DESCRIPCIÓN: ${cliente.descripcion ?? 'No especificada'}

═══ AUDITORÍA POR PLATAFORMAS ═══
${platformsSummary}

═══ REFERENTES DE BENCHMARK ═══
${benchmarkSummary}

Genera un JSON con esta estructura EXACTA (sin markdown, solo JSON):
{
  "main_strengths": "Texto de 100-150 palabras describiendo las 3-4 principales fortalezas actuales del cliente en redes. Sé específico y menciona plataformas concretas.",
  "main_weaknesses": "Texto de 100-150 palabras describiendo las 3-4 principales debilidades o gaps. Prioriza las más críticas para el negocio."
}

REGLAS:
- Basa el análisis en los datos reales, no en generalidades
- Las fortalezas deben ser aprovechables estratégicamente
- Las debilidades deben ser accionables (qué se puede mejorar)
- Tono profesional pero directo
- Responde SOLO con el JSON, sin texto adicional`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await anthropic.messages.create({
      model     : 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages  : [{ role: 'user', content: prompt }],
    })

    const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude no devolvió JSON válido')

    const result = JSON.parse(jsonMatch[0]) as {
      main_strengths : string
      main_weaknesses: string
    }

    // Registrar coste (fire-and-forget)
    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-synthesis',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
      metadatos     : { platforms_analyzed: platforms.length },
    }).catch(console.error)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-synthesis] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
