/**
 * POST /api/videos/generate-script
 *
 * Body: { client_id, content_id?, brief, video_type?, duration_seconds?, format? }
 *
 * Genera con Claude un guión + escenas y persiste video_projects + video_scenes.
 */
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

type VideoType = 'images_audio' | 'animation' | 'infographic'
type VideoFormat = '9x16' | '16x9' | 'both'

interface Body {
  client_id: string
  content_id?: string
  brief: string
  video_type?: VideoType
  duration_seconds?: number
  format?: VideoFormat
}

interface GeneratedScene {
  scene_index: number
  description: string
  narration_text: string
  duration_seconds: number
}

interface GeneratedScript {
  title: string
  script: string
  recommended_type: VideoType
  scenes: GeneratedScene[]
}

const SYSTEM_PROMPT = `Eres un guionista experto en vídeo corto para redes sociales.
Devuelves SIEMPRE un objeto JSON válido (sin markdown, sin comentarios).`

function buildPrompt(args: {
  brief: string
  videoType: VideoType
  duration: number
  format: VideoFormat
  brand: string
  contenido: string | null
}): string {
  const sceneSeconds = 6
  const numScenes = Math.max(2, Math.round(args.duration / sceneSeconds))

  return `Crea un guión de vídeo en ESPAÑOL.

Brief: ${args.brief}

${args.contenido ? `Contenido base existente:\n${args.contenido.slice(0, 4000)}\n` : ''}
Contexto de marca: ${args.brand || 'sin contexto adicional'}

Parámetros:
- Tipología solicitada: ${args.videoType}
- Duración total: ${args.duration} segundos
- Formato: ${args.format}
- Número aproximado de escenas: ${numScenes} (entre 5 y 7 segundos cada una)

Devuelve SOLO un objeto JSON con esta forma exacta:
{
  "title": "Título corto (max 80 chars)",
  "script": "Guión narrado completo en un solo bloque, sin marcas de escena",
  "recommended_type": "images_audio" | "animation" | "infographic",
  "scenes": [
    {
      "scene_index": 0,
      "description": "Descripción visual concreta de la escena (para generar imagen con IA)",
      "narration_text": "Texto exacto que se narrará en esta escena",
      "duration_seconds": 6
    }
  ]
}

Importante:
- La suma de duration_seconds debe acercarse a ${args.duration}.
- description debe ser visual, concreta, sin texto en pantalla.
- narration_text debe ser fluido y locutable en ${sceneSeconds}s aprox.`
}

function parseJson(raw: string): GeneratedScript {
  const cleaned = raw.replace(/```json\s*|```\s*/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Sin JSON en respuesta de Claude')
  return JSON.parse(cleaned.slice(start, end + 1))
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = (await req.json()) as Body
    if (!body?.client_id || !body?.brief) {
      return NextResponse.json({ error: 'client_id y brief son obligatorios' }, { status: 400 })
    }

    const videoType: VideoType = body.video_type ?? 'images_audio'
    const duration = body.duration_seconds ?? 30
    const format: VideoFormat = body.format ?? '9x16'

    const supabase = createAdminClient()

    // Brand context
    const { data: brand } = await supabase
      .from('brand_context')
      .select('tone_of_voice, style_keywords, raw_summary')
      .eq('client_id', body.client_id)
      .maybeSingle()

    const brandText = [
      brand?.tone_of_voice ? `Tono: ${brand.tone_of_voice}` : '',
      brand?.style_keywords?.length ? `Estilo: ${brand.style_keywords.join(', ')}` : '',
      brand?.raw_summary ? `Resumen: ${brand.raw_summary.slice(0, 600)}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    // Contenido existente (opcional)
    let contenidoText: string | null = null
    if (body.content_id) {
      const { data: c } = await supabase
        .from('contenidos')
        .select('titulo, brief')
        .eq('id', body.content_id)
        .maybeSingle()
      if (c) {
        contenidoText = `${c.titulo}\n${typeof c.brief === 'string' ? c.brief : JSON.stringify(c.brief ?? {})}`
      }
    }

    // Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildPrompt({
            brief: body.brief,
            videoType,
            duration,
            format,
            brand: brandText,
            contenido: contenidoText,
          }),
        },
      ],
    })

    const text = msg.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('\n')

    const parsed = parseJson(text)

    // Persist project
    const { data: project, error: pErr } = await supabase
      .from('video_projects')
      .insert({
        client_id: body.client_id,
        content_id: body.content_id ?? null,
        title: parsed.title?.slice(0, 200) || 'Vídeo sin título',
        brief: body.brief,
        script: parsed.script,
        video_type: parsed.recommended_type ?? videoType,
        duration_seconds: duration,
        format,
        status: 'draft_script',
        generation_meta: { model: 'claude-sonnet-4-6' },
      })
      .select('*')
      .single()
    if (pErr || !project) {
      console.error('[generate-script] insert project error:', pErr)
      return NextResponse.json({ error: 'No se pudo crear el proyecto' }, { status: 500 })
    }

    // Persist scenes
    const sceneRows = (parsed.scenes ?? []).map((s, i) => ({
      video_project_id: project.id,
      scene_index: s.scene_index ?? i,
      description: s.description,
      narration_text: s.narration_text ?? '',
      duration_seconds: s.duration_seconds || 5,
      status: 'pending' as const,
    }))
    if (sceneRows.length > 0) {
      const { error: sErr } = await supabase.from('video_scenes').insert(sceneRows)
      if (sErr) console.error('[generate-script] insert scenes error:', sErr)
    }

    const { data: scenes } = await supabase
      .from('video_scenes')
      .select('*')
      .eq('video_project_id', project.id)
      .order('scene_index', { ascending: true })

    return NextResponse.json({ project, scenes: scenes ?? [] })
  } catch (err) {
    console.error('[videos/generate-script] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}
