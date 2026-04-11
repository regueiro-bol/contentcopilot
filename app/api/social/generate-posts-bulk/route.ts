/**
 * POST /api/social/generate-posts-bulk
 *
 * Genera y guarda copys para múltiples piezas de una vez.
 *
 * Modo A — desde el calendario:
 *   Body: { clientId, calendarEntryIds: string[] }
 *   Reads social_calendar entries, generates posts, links social_post_id back.
 *
 * Modo B — manual:
 *   Body: { clientId, posts: Array<{ platform, format?, contentPillar?, scheduledDate?, context? }> }
 *
 * Returns: { created: number, ids: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste, calcularCosteClaudeUSD } from '@/lib/costes'

export const maxDuration = 300

const PLATFORM_LABELS: Record<string, string> = {
  linkedin  : 'LinkedIn',
  twitter_x : 'Twitter/X',
  instagram : 'Instagram',
  facebook  : 'Facebook',
  tiktok    : 'TikTok',
  youtube   : 'YouTube',
}

const PLATFORM_COPY_RULES: Record<string, string> = {
  linkedin  : 'Hasta 1.300 caracteres. Párrafos cortos. Gancho fuerte al inicio. Máx. 3 hashtags al final.',
  twitter_x : 'Máx. 280 caracteres. Directo, impactante. 1-2 hashtags si aportan.',
  instagram : '125-200 palabras. Primeras 2 líneas clave. 8-15 hashtags al final.',
  facebook  : '50-150 palabras. Conversacional. Pregunta o CTA claro.',
  tiktok    : 'Máx. 100 caracteres. 3-5 hashtags incluidos. Fresco y directo.',
  youtube   : 'Título SEO (60-70 chars) + descripción 100-150 palabras con CTA.',
}

interface PostSpec {
  platform     : string
  format?      : string
  contentPillar?: string
  scheduledDate?: string
  context?     : string
}

export async function POST(request: NextRequest) {
  let body: { clientId: string; posts?: PostSpec[]; calendarEntryIds?: string[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId, calendarEntryIds } = body
  if (!clientId) {
    return NextResponse.json({ error: 'clientId es obligatorio' }, { status: 400 })
  }
  if (!calendarEntryIds?.length && !body.posts?.length) {
    return NextResponse.json({ error: 'posts o calendarEntryIds son obligatorios' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    // ── Resolve specs from calendar entries if needed ──
    let posts: PostSpec[] = body.posts ?? []
    // Parallel array: calendarIds[i] is the social_calendar.id for posts[i], or null
    let calendarIds: Array<string | null> = posts.map(() => null)

    if (calendarEntryIds?.length) {
      const { data: calEntries, error: calError } = await supabase
        .from('social_calendar')
        .select('id, platform, format, title, description, scheduled_date, content_type')
        .in('id', calendarEntryIds)

      if (calError) {
        console.error('[generate-posts-bulk] Calendar fetch error:', calError.message)
        return NextResponse.json({ error: calError.message }, { status: 500 })
      }

      posts = (calEntries ?? []).map((e) => ({
        platform     : e.platform,
        format       : e.format       ?? undefined,
        contentPillar: e.content_type ?? undefined,
        scheduledDate: e.scheduled_date ?? undefined,
        context      : [e.title, e.description].filter(Boolean).join(' — ') || undefined,
      }))
      calendarIds = (calEntries ?? []).map((e) => e.id)
    }

    const [{ data: cliente }, { data: brandVoice }] = await Promise.all([
      supabase.from('clientes').select('nombre, sector, descripcion, identidad_corporativa').eq('id', clientId).single(),
      supabase.from('social_brand_voice').select('voice_manual, editorial_red_lines').eq('client_id', clientId).maybeSingle(),
    ])

    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    const clienteContext = [
      cliente.sector             ? `Sector: ${cliente.sector}` : '',
      (cliente as any).descripcion          ? `Contexto: ${String((cliente as any).descripcion).substring(0, 150)}` : '',
      (cliente as any).identidad_corporativa ? `Identidad: ${String((cliente as any).identidad_corporativa).substring(0, 100)}` : '',
    ].filter(Boolean).join('\n')

    const voiceManualText = brandVoice?.voice_manual
      ? (typeof brandVoice.voice_manual === 'object' && 'content' in (brandVoice.voice_manual as any)
          ? String((brandVoice.voice_manual as any).content)
          : String(brandVoice.voice_manual)
        ).substring(0, 300)
      : ''

    const redLinesText = brandVoice?.editorial_red_lines
      ? (typeof brandVoice.editorial_red_lines === 'object' && 'content' in (brandVoice.editorial_red_lines as any)
          ? String((brandVoice.editorial_red_lines as any).content)
          : String(brandVoice.editorial_red_lines)
        ).substring(0, 200)
      : ''

    const anthropic = new Anthropic()
    const createdIds: string[] = []
    let totalInputTokens  = 0
    let totalOutputTokens = 0

    if (posts.length > 20) {
      return NextResponse.json({ error: 'Máximo 20 piezas por llamada' }, { status: 400 })
    }

    // Generar secuencialmente para respetar rate limits
    for (let i = 0; i < posts.length; i++) {
      const spec          = posts[i]
      const calendarId    = calendarIds[i] ?? null
      const platformLabel = PLATFORM_LABELS[spec.platform] ?? spec.platform
      const copyRules     = PLATFORM_COPY_RULES[spec.platform] ?? ''

      const prompt = `Genera copy para ${platformLabel}${spec.format ? ` — ${spec.format}` : ''}.
Pilar: ${spec.contentPillar ?? 'general'}
Contexto: ${spec.context ?? 'ninguno'}

Reglas ${platformLabel}: ${copyRules}
${voiceManualText ? `Voz de marca: ${voiceManualText}` : ''}
${redLinesText ? `Prohibido: ${redLinesText}` : ''}

JSON sin markdown:
{
  "hook": "Gancho (máx 120 chars, sin emojis)",
  "copy_draft": "Copy completo",
  "visual_description": "Qué mostrar visualmente (2-3 frases)"
}`

      try {
        const response = await anthropic.messages.create({
          model     : 'claude-sonnet-4-5',
          max_tokens: 768,
          system    : `Eres un copy social media senior para ${cliente.nombre} (${cliente.sector ?? 'sin sector'}). ${clienteContext}. Escribe copy nativo y genuinamente humano, nunca genérico.`,
          messages  : [{ role: 'user', content: prompt }],
        })

        totalInputTokens  += response.usage.input_tokens
        totalOutputTokens += response.usage.output_tokens

        const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) continue

        const result = JSON.parse(jsonMatch[0]) as {
          hook: string; copy_draft: string; visual_description: string
        }

        const now = new Date().toISOString()
        const { data: created } = await supabase
          .from('social_posts')
          .insert({
            client_id        : clientId,
            platform         : spec.platform,
            format           : spec.format ?? null,
            content_pillar   : spec.contentPillar ?? null,
            scheduled_date   : spec.scheduledDate ?? null,
            hook             : result.hook,
            copy_draft       : result.copy_draft,
            visual_description: result.visual_description,
            status           : 'borrador',
            humanized        : false,
            created_at       : now,
            updated_at       : now,
          })
          .select('id')
          .single()

        if (created?.id) {
          createdIds.push(created.id)

          // Link the calendar entry back to the new post
          if (calendarId) {
            const { error: linkErr } = await supabase
              .from('social_calendar')
              .update({ social_post_id: created.id, updated_at: now })
              .eq('id', calendarId)
            if (linkErr) console.error('[generate-posts-bulk] calendar link error:', linkErr.message)
          }
        }
      } catch {
        // Continuar con el siguiente si hay error en una pieza
        continue
      }
    }

    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-generate-posts-bulk',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : totalInputTokens,
      tokens_output : totalOutputTokens,
      coste_usd     : calcularCosteClaudeUSD(totalInputTokens, totalOutputTokens),
      metadatos     : { requested: posts.length, created: createdIds.length },
    }).catch(console.error)

    return NextResponse.json({ created: createdIds.length, ids: createdIds })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-posts-bulk] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
