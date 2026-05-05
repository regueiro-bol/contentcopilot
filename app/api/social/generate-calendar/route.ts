/**
 * POST /api/social/generate-calendar
 *
 * Genera un borrador de calendario editorial con IA basándose en la
 * estrategia del cliente, artículos del blog, historial y métricas.
 *
 * Body: { clientId, startDate, endDate, mode: 'initial' | 'maintenance' }
 * Returns: { draftId, entries, stats }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste, calcularCosteClaudeUSD } from '@/lib/costes'

export const dynamic   = 'force-dynamic'
export const maxDuration = 120

const PLATFORM_LABELS: Record<string, string> = {
  linkedin : 'LinkedIn', twitter_x: 'Twitter/X', instagram: 'Instagram',
  facebook : 'Facebook', tiktok   : 'TikTok',    youtube  : 'YouTube',
}

// Default weekly cadence per platform
const DEFAULT_CADENCE: Record<string, number> = {
  linkedin: 5, twitter_x: 4, instagram: 3,
  facebook: 2, tiktok: 4,   youtube: 1,
}

// Priority multiplier for cadence reduction
const PRIORITY_FACTOR: Record<string, number> = {
  alta     : 1,
  mantener : 0.5,
  evaluar  : 0.25,
  descartar: 0,
}

/** Extract text from JSONB { content: "..." } or plain string */
function jsonbText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && 'content' in val) {
    return String((val as { content: unknown }).content)
  }
  return ''
}

/** Calculate expected entry range for the period */
function calcularEntradasEsperadas(
  platforms: Array<{ platform: string; strategic_priority: string | null }>,
  startDate: string,
  endDate  : string,
): string {
  const days  = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
  ) + 1
  const weeks = days / 7

  let total = 0
  for (const p of platforms) {
    const factor   = PRIORITY_FACTOR[p.strategic_priority ?? 'alta'] ?? 1
    const cadence  = DEFAULT_CADENCE[p.platform] ?? 3
    total += Math.round(cadence * factor * weeks)
  }

  const lo = Math.max(days, Math.round(total * 0.8))
  const hi = Math.round(total * 1.2)
  return `${lo} a ${hi}`
}

/** Validate that a blog ID from Claude actually exists in our list */
function validateBlogIds(
  entries: Array<{ blogContenidoId?: string | null }>,
  validIds: Set<string>,
): void {
  for (const e of entries) {
    if (e.blogContenidoId && !validIds.has(e.blogContenidoId)) {
      e.blogContenidoId = null
    }
  }
}

export async function POST(request: NextRequest) {
  let body: { clientId: string; startDate: string; endDate: string; mode: 'initial' | 'maintenance' }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId, startDate, endDate, mode } = body
  if (!clientId || !startDate || !endDate || !mode) {
    return NextResponse.json({ error: 'clientId, startDate, endDate y mode son obligatorios' }, { status: 400 })
  }

  try {
    const supabase  = createAdminClient()
    const sixtyAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const ninetyAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // ── PASO 1: Cargar todo el contexto en paralelo ──
    const [
      { data: cliente },
      { data: platforms },
      { data: architecture },
      { data: synthesis },
      { data: blogArticles },
      { data: publishedPosts },
      { data: metrics },
      { data: existingCalendar },
    ] = await Promise.all([
      supabase.from('clientes').select('nombre, sector, descripcion').eq('id', clientId).single(),
      supabase.from('social_platforms').select('platform, strategic_priority, followers, avg_engagement')
        .eq('client_id', clientId).not('strategic_priority', 'is', null),
      supabase.from('social_content_architecture')
        .select('editorial_pillars, formats_by_platform, publishing_cadence, calendar_template')
        .eq('client_id', clientId).maybeSingle(),
      supabase.from('social_audit_synthesis')
        .select('main_strengths, platform_context').eq('client_id', clientId).maybeSingle(),
      supabase.from('calendario_editorial')
        .select('id, contenido_id, titulo, keyword, fecha_publicacion, status')
        .eq('client_id', clientId)
        .gte('fecha_publicacion', startDate)
        .lte('fecha_publicacion', endDate)
        .in('status', ['planificado', 'en_redaccion', 'revision', 'publicado']),
      mode === 'maintenance'
        ? supabase.from('social_posts').select('platform, format, content_pillar, hook')
            .eq('client_id', clientId).eq('status', 'publicado')
            .gte('created_at', sixtyAgo).order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [] as any[] }),
      mode === 'maintenance'
        ? supabase.from('social_metrics').select('platform, month, avg_engagement, total_impressions, posts_published')
            .eq('client_id', clientId).gte('month', ninetyAgo).order('month', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('social_calendar')
        .select('scheduled_date, platform, format, content_type')
        .eq('client_id', clientId)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate),
    ])

    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    const activePlatforms = (platforms ?? []).filter(
      (p) => (PRIORITY_FACTOR[p.strategic_priority ?? ''] ?? -1) > 0,
    )

    // ── PASO 2: Construir el prompt ──
    const entryRange = calcularEntradasEsperadas(activePlatforms, startDate, endDate)

    const blogIds = new Set((blogArticles ?? []).map((a) => a.contenido_id ?? a.id))

    const platformsSection = activePlatforms.length > 0
      ? activePlatforms.map((p) =>
          `${PLATFORM_LABELS[p.platform] ?? p.platform}: prioridad ${p.strategic_priority}, ` +
          `${p.followers?.toLocaleString('es-ES') ?? 0} seguidores, ` +
          `engagement ${p.avg_engagement ?? 0}%`,
        ).join('\n')
      : '(sin plataformas activas definidas)'

    const cadenceText  = jsonbText(architecture?.publishing_cadence)
    const pillarsText  = jsonbText(architecture?.editorial_pillars)
    const formatsText  = jsonbText(architecture?.formats_by_platform)
    const templateText = jsonbText(architecture?.calendar_template)

    const blogSection = (blogArticles ?? []).length > 0
      ? `\nARTÍCULOS DEL BLOG EN EL PERÍODO:\n` +
        (blogArticles ?? []).map((a) =>
          `- ${a.fecha_publicacion}: "${a.keyword ?? a.titulo}" (estado: ${a.status}, id: ${a.contenido_id ?? a.id})`,
        ).join('\n') +
        `\nPara cada artículo relevante, incluir al menos una pieza social derivada en la plataforma más adecuada.`
      : `\nNo hay artículos del blog en este período.`

    const existingSection = (existingCalendar ?? []).length > 0
      ? `\nENTRADAS YA EXISTENTES EN EL CALENDARIO (NO DUPLICAR):\n` +
        (existingCalendar ?? []).map((e) =>
          `- ${e.scheduled_date}: ${e.platform} — ${e.format ?? e.content_type ?? ''}`,
        ).join('\n')
      : ''

    const historySection = mode === 'maintenance' && (publishedPosts ?? []).length > 0
      ? `\nHISTORIAL RECIENTE (últimas piezas publicadas):\n` +
        (publishedPosts ?? []).slice(0, 15).map((p) =>
          `- ${PLATFORM_LABELS[p.platform] ?? p.platform}: ${p.format ?? ''} — "${p.content_pillar ?? ''}"`,
        ).join('\n') +
        `\nEvitar repetir los mismos formatos y pilares de forma consecutiva. Buscar variedad.`
      : ''

    const metricsSection = mode === 'maintenance' && (metrics ?? []).length > 0
      ? `\nMÉTRICAS RECIENTES POR PLATAFORMA:\n` +
        (metrics ?? []).map((m) =>
          `${PLATFORM_LABELS[m.platform] ?? m.platform} (${String(m.month).substring(0, 7)}): ` +
          `engagement ${m.avg_engagement}%, ${m.posts_published} piezas publicadas`,
        ).join('\n') +
        `\nPriorizar las plataformas con mejor engagement. Ajustar cadencia según rendimiento real.`
      : ''

    const systemPrompt = `Eres un estratega de social media y community manager senior.

Cliente: ${cliente.nombre}${cliente.sector ? `\nSector: ${cliente.sector}` : ''}${(cliente as any).descripcion ? `\nContexto: ${String((cliente as any).descripcion).substring(0, 200)}` : ''}

Tu trabajo es generar un borrador de calendario editorial para redes sociales. El calendario debe ser realista, ejecutable y coherente con la estrategia definida. Cada entrada debe tener un propósito claro y contribuir a los pilares editoriales de la marca.`

    const userPrompt = `PERÍODO: ${startDate} al ${endDate}
MODO: ${mode === 'initial' ? 'Arranque inicial de la estrategia' : 'Mantenimiento — el sistema ya está en marcha'}

PLATAFORMAS ACTIVAS Y PRIORIDAD:
${platformsSection}

${cadenceText ? `CADENCIA PLANIFICADA EN ESTRATEGIA:\n${cadenceText.substring(0, 600)}\n` : ''}
${pillarsText ? `PILARES EDITORIALES:\n${pillarsText.substring(0, 600)}\n` : ''}
${formatsText ? `FORMATOS POR PLATAFORMA:\n${formatsText.substring(0, 600)}\n` : ''}
${templateText ? `CALENDARIO TIPO SEMANAL (referencia):\n${templateText.substring(0, 500)}\n` : ''}
${blogSection}${existingSection}${historySection}${metricsSection}

INSTRUCCIONES PARA LA GENERACIÓN:
1. Distribuir las publicaciones según la cadencia definida en la estrategia. Respetar los días y horarios tipo.
2. Asignar cada entrada a un pilar editorial específico.
3. Variar los formatos dentro de cada plataforma.
4. Para plataformas de PRIORIDAD ALTA: cadencia completa. Para MANTENER: cadencia reducida. Para EVALUAR: mínima. Para DESCARTAR: no incluir.
5. Los fines de semana: máximo 1 entrada por día si la cadencia de la plataforma lo requiere.
6. Cada entrada debe tener un título y briefing concretos, no genéricos. Deben ser accionables.

Responde SOLO con un array JSON válido, sin texto adicional ni markdown:
[
  {
    "scheduledDate": "2026-04-14",
    "platform": "linkedin",
    "format": "Nombre del formato",
    "contentType": "PILAR N — Nombre del pilar",
    "title": "Título concreto y específico de la pieza",
    "description": "Briefing de 2-3 frases: qué debe transmitir esta pieza, qué ángulo tomar, qué datos incluir.",
    "blogContenidoId": null,
    "reasoning": "Por qué esta pieza este día en esta plataforma. 1 frase."
  }
]

Genera entre ${entryRange} entradas. Cubre todos los días del período con al menos una plataforma de prioridad alta.`

    // ── PASO 3: Llamar a Claude ──
    const anthropic = new Anthropic()

    let rawJSON = ''
    let retried = false

    const callClaude = (extraInstruction = ''): Promise<Anthropic.Message> =>
      anthropic.messages.create({
        model     : 'claude-sonnet-4-5',
        max_tokens: 2000,
        system    : systemPrompt,
        messages  : [{
          role   : 'user',
          content: extraInstruction ? `${userPrompt}\n\n${extraInstruction}` : userPrompt,
        }],
      })

    let response = await callClaude()
    rawJSON = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    // ── PASO 4: Parsear el JSON (con un reintento si falla) ──
    let entries: Array<{
      scheduledDate   : string
      platform        : string
      format?         : string
      contentType?    : string
      title?          : string
      description?    : string
      blogContenidoId?: string | null
      reasoning?      : string
    }> = []

    const tryParse = (text: string) => {
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) return null
      return JSON.parse(match[0])
    }

    try {
      entries = tryParse(rawJSON) ?? []
    } catch {
      if (!retried) {
        retried = true
        response = await callClaude('Responde SOLO con el array JSON válido, sin texto antes ni después, sin markdown ni ```.')
        rawJSON  = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
        try { entries = tryParse(rawJSON) ?? [] } catch {
          return NextResponse.json({ error: 'No se pudo parsear la respuesta del agente. Inténtalo de nuevo.' }, { status: 500 })
        }
      }
    }

    // Validate blog IDs
    validateBlogIds(entries, blogIds)

    // Filter out entries outside the period
    entries = entries.filter((e) => e.scheduledDate >= startDate && e.scheduledDate <= endDate)

    guardarRegistroCoste({
      cliente_id    : clientId,
      tipo_operacion: 'copiloto',
      agente        : 'social-generate-calendar',
      modelo        : 'claude-sonnet-4-5',
      tokens_input  : response.usage.input_tokens,
      tokens_output : response.usage.output_tokens,
      coste_usd     : calcularCosteClaudeUSD(response.usage.input_tokens, response.usage.output_tokens),
      metadatos     : { mode, entries: entries.length, retried },
    }).catch(console.error)

    // ── PASO 5: Guardar el borrador ──
    const byPlatform: Record<string, number> = {}
    for (const e of entries) {
      byPlatform[e.platform] = (byPlatform[e.platform] ?? 0) + 1
    }

    const blogDerived = entries.filter((e) => e.blogContenidoId).length
    const days        = new Set(entries.map((e) => e.scheduledDate)).size

    const { data: draft, error: draftError } = await supabase
      .from('social_calendar_drafts')
      .insert({
        client_id        : clientId,
        start_date       : startDate,
        end_date         : endDate,
        mode,
        status           : 'pending',
        proposed_entries : entries,
        generation_context: {
          platformCount     : activePlatforms.length,
          blogArticleCount  : (blogArticles ?? []).length,
          existingEntryCount: (existingCalendar ?? []).length,
          metricsAvailable  : (metrics ?? []).length > 0,
          retried,
        },
      })
      .select('id')
      .single()

    if (draftError || !draft) {
      console.error('[generate-calendar] Draft save error:', draftError?.message)
      return NextResponse.json({ error: 'Error al guardar el borrador' }, { status: 500 })
    }

    return NextResponse.json({
      draftId: draft.id,
      entries,
      stats  : {
        totalEntries: entries.length,
        byPlatform,
        blogDerived,
        daysCount   : days,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[social/generate-calendar] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
