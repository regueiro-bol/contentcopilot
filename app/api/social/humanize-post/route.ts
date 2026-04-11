/**
 * POST /api/social/humanize-post
 *
 * Humaniza el copy de una pieza social eliminando patrones de IA.
 * Versión ligera del agente humanizador, adaptada para copy social.
 *
 * Body: { postId, copy, platform, clientId? }
 * Returns: { copy: string }
 * Updates social_posts.humanized = true
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste, calcularCosteClaudeUSD } from '@/lib/costes'

export const maxDuration = 30

const PLATFORM_LABELS: Record<string, string> = {
  linkedin  : 'LinkedIn',
  twitter_x : 'Twitter/X',
  instagram : 'Instagram',
  facebook  : 'Facebook',
  tiktok    : 'TikTok',
  youtube   : 'YouTube',
}

export async function POST(request: NextRequest) {
  let body: { postId: string; copy: string; platform?: string; clientId?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { postId, copy, platform, clientId } = body
  if (!postId || !copy) {
    return NextResponse.json({ error: 'postId y copy son obligatorios' }, { status: 400 })
  }

  try {
    const platformLabel = platform ? (PLATFORM_LABELS[platform] ?? platform) : 'redes sociales'

    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model     : 'claude-sonnet-4-5',
      max_tokens: 512,
      system    : `Eres un editor de copy social media especializado en hacer que los textos suenen genuinamente humanos en español.

Tu trabajo es reescribir el texto eliminando todos los patrones típicos de IA:
- No uses palabras de relleno como "fundamental", "crucial", "esencial", "en el vertiginoso", "en el panorama actual"
- No empieces con afirmaciones triviales ni generalidades
- Elimina la estructura de lista cuando no es natural en la plataforma
- Evita la voz pasiva y las frases subordinadas largas
- Mantén exactamente el mismo mensaje, tono y longitud aproximada
- Conserva los emojis y hashtags que estaban en el original
- El resultado debe ser SOLO el copy reescrito, sin explicaciones`,
      messages: [{
        role   : 'user',
        content: `Humaniza este copy de ${platformLabel}. Devuelve SOLO el texto reescrito, sin comentarios ni formato extra.\n\n${copy}`,
      }],
    })

    const humanized = response.content[0].type === 'text' ? response.content[0].text.trim() : copy

    // Actualizar en DB
    const supabase = createAdminClient()
    await supabase
      .from('social_posts')
      .update({
        copy_draft : humanized,
        humanized  : true,
        updated_at : new Date().toISOString(),
      })
      .eq('id', postId)

    if (clientId) {
      guardarRegistroCoste({
        cliente_id    : clientId,
        tipo_operacion: 'copiloto',
        agente        : 'social-humanize-post',
        modelo        : 'claude-sonnet-4-5',
        tokens_input  : response.usage.input_tokens,
        tokens_output : response.usage.output_tokens,
        coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
        metadatos     : { platform },
      }).catch(console.error)
    }

    return NextResponse.json({ copy: humanized })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/humanize-post] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
