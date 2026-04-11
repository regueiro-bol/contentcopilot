/**
 * POST /api/social/generate-post
 *
 * Claude genera el copy para una pieza de contenido social individual.
 * Usa el contexto de estrategia (voz de marca, pilares, plataforma) para
 * generar copy adaptado al formato y plataforma específicos.
 *
 * Body: { clientId, postId?, platform, format, contentPillar?, hook?, context? }
 * Returns: { copy_draft, hook, visual_description }
 * Saves to social_posts if postId is provided.
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

const PLATFORM_COPY_RULES: Record<string, string> = {
  linkedin  : 'Texto hasta 1.300 caracteres. Párrafos cortos. Empieza con un gancho potente. Sin más de 3 hashtags al final. Evita emojis excesivos.',
  twitter_x : 'Máximo 280 caracteres. Directo, impactante. Un único mensaje claro. 1-2 hashtags si aportan. Sin floreos.',
  instagram : 'Caption de 125-200 palabras. Empieza fuerte (primeras 2 líneas son clave). Emojis con moderación. Hashtags (8-15) al final en bloque.',
  facebook  : 'Texto de 50-150 palabras. Conversacional, cercano. Pregunta o llamada a la acción clara. 1-2 hashtags opcional.',
  tiktok    : 'Caption muy corto (50-100 caracteres). 3-5 hashtags relevantes incluidos. Tono fresco, directo, sin formalidades.',
  youtube   : 'Título SEO-optimizado (60-70 chars). Descripción de 100-150 palabras con palabras clave naturales y CTA claro.',
}

export async function POST(request: NextRequest) {
  let body: {
    clientId     : string
    postId?      : string
    platform     : string
    format?      : string
    contentPillar?: string
    hook?        : string
    context?     : string
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId, postId, platform, format, contentPillar, context } = body
  if (!clientId || !platform) {
    return NextResponse.json({ error: 'clientId y platform son obligatorios' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    const [{ data: cliente }, { data: brandVoice }, { data: synthesis }] = await Promise.all([
      supabase.from('clientes').select('nombre, sector, descripcion, identidad_corporativa').eq('id', clientId).single(),
      supabase.from('social_brand_voice').select('voice_manual, register_by_platform, editorial_red_lines').eq('client_id', clientId).maybeSingle(),
      supabase.from('social_audit_synthesis').select('platform_context').eq('client_id', clientId).maybeSingle(),
    ])

    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    const clienteContext = [
      cliente.sector             ? `Sector: ${cliente.sector}` : '',
      (cliente as any).descripcion          ? `Contexto: ${String((cliente as any).descripcion).substring(0, 200)}` : '',
      (cliente as any).identidad_corporativa ? `Identidad: ${String((cliente as any).identidad_corporativa).substring(0, 150)}` : '',
    ].filter(Boolean).join('\n')

    const platformLabel = PLATFORM_LABELS[platform] ?? platform
    const copyRules     = PLATFORM_COPY_RULES[platform] ?? 'Adapta el texto a la plataforma.'

    // Extract register for this platform from brand voice
    let platformRegister = ''
    if (brandVoice?.register_by_platform) {
      const registerText = typeof brandVoice.register_by_platform === 'object' && brandVoice.register_by_platform !== null && 'content' in brandVoice.register_by_platform
        ? String((brandVoice.register_by_platform as any).content)
        : String(brandVoice.register_by_platform)
      const platformSection = registerText.split('\n\n').find((block) =>
        block.toLowerCase().includes(platform.replace('_', '')) ||
        block.toLowerCase().includes(platformLabel.toLowerCase()),
      )
      if (platformSection) platformRegister = platformSection.substring(0, 300)
    }

    const voiceManualText = brandVoice?.voice_manual
      ? (typeof brandVoice.voice_manual === 'object' && 'content' in (brandVoice.voice_manual as any)
          ? String((brandVoice.voice_manual as any).content)
          : String(brandVoice.voice_manual)
        ).substring(0, 400)
      : ''

    const redLinesText = brandVoice?.editorial_red_lines
      ? (typeof brandVoice.editorial_red_lines === 'object' && 'content' in (brandVoice.editorial_red_lines as any)
          ? String((brandVoice.editorial_red_lines as any).content)
          : String(brandVoice.editorial_red_lines)
        ).substring(0, 300)
      : ''

    const userPrompt = `Genera el copy para una pieza de ${platformLabel}${format ? ` (formato: ${format})` : ''}.

PLATAFORMA: ${platformLabel}
FORMATO: ${format ?? 'no especificado'}
PILAR DE CONTENIDO: ${contentPillar ?? 'no especificado'}
CONTEXTO ADICIONAL: ${context ?? 'ninguno'}

REGLAS ESPECÍFICAS DE ${platformLabel.toUpperCase()}:
${copyRules}

${platformRegister ? `REGISTRO Y TONO PARA ${platformLabel.toUpperCase()}:\n${platformRegister}\n` : ''}
${voiceManualText ? `VOZ DE MARCA:\n${voiceManualText}\n` : ''}
${redLinesText ? `LO QUE LA MARCA NUNCA DICE:\n${redLinesText}\n` : ''}

Genera el copy en JSON (sin markdown):
{
  "hook": "Gancho de apertura impactante (1-2 líneas, máx. 120 caracteres). Sin emojis en el hook.",
  "copy_draft": "Copy completo adaptado a las reglas de la plataforma. Usa saltos de línea donde sea natural.",
  "visual_description": "Descripción para el equipo creativo: qué debe mostrar la pieza visual/vídeo (2-3 frases concretas)."
}`

    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model     : 'claude-sonnet-4-5',
      max_tokens: 1024,
      system    : `Eres un copy social media senior especializado en marcas B2B y B2C en el mercado hispanohablante.

Cliente: ${cliente.nombre}
${clienteContext}

Tu trabajo es escribir copy que suene genuinamente humano, adaptado a la voz de la marca y a las reglas nativas de cada plataforma. No escribas copy genérico que podría ser de cualquier marca.`,
      messages  : [{ role: 'user', content: userPrompt }],
    })

    const rawText   = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude no devolvió JSON válido')

    const result = JSON.parse(jsonMatch[0]) as {
      hook              : string
      copy_draft        : string
      visual_description: string
    }

    // Guardar en social_posts si se proporcionó postId
    if (postId) {
      await supabase
        .from('social_posts')
        .update({
          hook              : result.hook,
          copy_draft        : result.copy_draft,
          visual_description: result.visual_description,
          updated_at        : new Date().toISOString(),
        })
        .eq('id', postId)
    }

    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-generate-post',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
      metadatos     : { platform, format },
    }).catch(console.error)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-post] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
