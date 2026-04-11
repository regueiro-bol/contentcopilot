/**
 * POST /api/social/generate-platform-conclusion
 *
 * Claude genera una conclusión estratégica de 80-120 palabras
 * para una plataforma específica de un cliente basándose en los datos auditados.
 *
 * Body: { clientId, platform, platformData: SocialPlatformData }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste, calcularCosteClaudeUSD } from '@/lib/costes'

export const maxDuration = 60

interface PlatformData {
  platform             : string
  is_active?           : boolean
  followers?           : number | null
  following?           : number | null
  posts_per_week?      : number | null
  avg_engagement?      : number | null
  last_post_date?      : string | null
  formats_used?        : string[]
  main_topics?         : string | null
  top_post_example?    : string | null
  score_brand_consistency? : number | null
  score_editorial_quality? : number | null
  score_activity?          : number | null
  score_community?         : number | null
  observations?            : string | null
}

const PLATFORM_NAMES: Record<string, string> = {
  linkedin  : 'LinkedIn',
  twitter_x : 'Twitter/X',
  instagram : 'Instagram',
  facebook  : 'Facebook',
  tiktok    : 'TikTok',
  youtube   : 'YouTube',
}

export async function POST(request: NextRequest) {

  let body: { clientId: string; platform: string; platformData: PlatformData }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId, platform, platformData } = body
  if (!clientId || !platform || !platformData) {
    return NextResponse.json({ error: 'clientId, platform y platformData son obligatorios' }, { status: 400 })
  }

  try {
    // Cargar nombre del cliente
    const supabase = createAdminClient()
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, sector')
      .eq('id', clientId)
      .single()

    const platformDisplayName = PLATFORM_NAMES[platform] ?? platform

    const scores = [
      platformData.score_brand_consistency,
      platformData.score_editorial_quality,
      platformData.score_activity,
      platformData.score_community,
    ].filter((v) => v != null) as number[]

    const avgScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null

    const prompt = `Eres un estratega de social media. Analiza los datos de auditoría de ${platformDisplayName} para el cliente "${cliente?.nombre ?? 'este cliente'}" (sector: ${cliente?.sector ?? 'no especificado'}) y escribe una conclusión estratégica concisa.

DATOS DE ${platformDisplayName.toUpperCase()}:
- Presencia activa: ${platformData.is_active ? 'Sí' : 'No'}
- Seguidores: ${platformData.followers ?? 'No especificado'}
- Posts por semana: ${platformData.posts_per_week ?? 'No especificado'}
- Engagement medio: ${platformData.avg_engagement ? `${platformData.avg_engagement}%` : 'No especificado'}
- Último post: ${platformData.last_post_date ?? 'No especificado'}
- Formatos usados: ${(platformData.formats_used ?? []).join(', ') || 'No especificado'}
- Temas principales: ${platformData.main_topics ?? 'No especificado'}
- Puntuación media (1-5): ${avgScore !== null ? avgScore.toFixed(1) : 'Sin valorar'}
  · Consistencia de marca: ${platformData.score_brand_consistency ?? '-'}/5
  · Calidad editorial: ${platformData.score_editorial_quality ?? '-'}/5
  · Actividad: ${platformData.score_activity ?? '-'}/5
  · Comunidad: ${platformData.score_community ?? '-'}/5
- Observaciones del auditor: ${platformData.observations ?? 'Sin observaciones'}

Escribe una conclusión estratégica de 80-120 palabras que:
1. Evalúe el rendimiento actual en ${platformDisplayName}
2. Identifique el principal punto fuerte y el principal punto de mejora
3. Indique si la plataforma tiene potencial estratégico para este cliente

Responde SOLO con el texto de la conclusión, sin títulos ni formato extra.`

    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model     : 'claude-sonnet-4-5',
      max_tokens: 512,
      messages  : [{ role: 'user', content: prompt }],
    })

    const conclusion = response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : ''

    // Registrar coste (fire-and-forget)
    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-platform-conclusion',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
      metadatos     : { platform },
    }).catch(console.error)

    return NextResponse.json({ conclusion })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-platform-conclusion] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
