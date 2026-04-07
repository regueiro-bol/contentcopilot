/**
 * POST /api/videos/generate-script — v2 Director de arte
 *
 * Body: {
 *   client_id, content_id?, brief?,
 *   platform, format, duration_seconds, tone, intention,
 *   apply_brand_assets, show_logo, video_type?
 * }
 */
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

type Platform = 'tiktok' | 'instagram_reels' | 'youtube_shorts' | 'linkedin'
type Format = '9x16' | '16x9' | '1x1' | 'both'
type Tone = 'divulgativo' | 'periodistico' | 'cercano' | 'tecnico'
type Intention = 'informativo' | 'educativo' | 'promocional'
type VideoType = 'images_audio' | 'animation' | 'infographic'

interface Body {
  client_id: string
  content_id?: string
  brief?: string
  platform: Platform
  format: Format
  duration_seconds: number
  tone: Tone
  intention: Intention
  apply_brand_assets?: boolean
  show_logo?: boolean
  video_type?: VideoType
}

interface GeneratedScene {
  scene_index: number
  duration_seconds: number
  narration_text: string
  shot_type: string
  camera_angle: string
  camera_movement: string
  lens: string
  lighting: string
  background: string
  text_overlay: string
  seedance_prompt: string
  visual_description: string
}

interface GeneratedScript {
  title: string
  narrative_hook: string
  scenes: GeneratedScene[]
}

const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram_reels: 'Instagram Reels',
  youtube_shorts: 'YouTube Shorts',
  linkedin: 'LinkedIn',
}

const SYSTEM_PROMPT = `Eres un director de arte y vídeo experto en contenido para redes sociales.
Tu trabajo es transformar un artículo o texto en un vídeo corto e impactante para la plataforma indicada.
NO leas el artículo en el vídeo — crea un RELATO NARRATIVO que explique los mismos conceptos de forma
visual y dinámica.

Para cada escena especificas: narración (voz en off, máximo 2 frases cortas), plano, ángulo, movimiento
de cámara, objetivo, descripción visual detallada del fondo y ambiente, texto en pantalla si aplica,
y un seedance_prompt optimizado para generar exactamente ese plano con Seedance.

Reglas de dirección:
- TikTok/Reels/Shorts: ritmo rápido, planos variados, text_overlay grande y conciso
- LinkedIn: tono más sobrio, planos más largos, menos movimiento
- Escenas de 5-7 segundos cada una
- Alternar planos para crear dinamismo (no repetir el mismo shot_type consecutivamente)
- Los seedance_prompt deben incluir: tipo de plano en inglés, movimiento de cámara,
  iluminación, ambiente, estilo cinematográfico. NUNCA incluyas texto, letras, logos
  ni subtítulos dentro del seedance_prompt.
- Si apply_brand_assets=true: menciona paleta y tono del brand_context en el prompt visual

Respondes SIEMPRE con un objeto JSON válido, sin markdown, sin comentarios.`

function buildUserPrompt(args: {
  platform: Platform
  tone: Tone
  intention: Intention
  format: Format
  duration: number
  brief: string | null
  contenido: string | null
  brandText: string
  applyBrand: boolean
}): string {
  const sceneSeconds = 6
  const numScenes = Math.max(2, Math.round(args.duration / sceneSeconds))

  return `Crea un guión de vídeo en ESPAÑOL para ${PLATFORM_LABEL[args.platform]}.

Parámetros:
- Plataforma: ${PLATFORM_LABEL[args.platform]}
- Formato: ${args.format}
- Duración total: ${args.duration} segundos
- Número aproximado de escenas: ${numScenes} (entre 5 y 7 segundos cada una)
- Tono: ${args.tone}
- Intención: ${args.intention}
- Aplicar brand assets: ${args.applyBrand ? 'sí' : 'no'}

${args.contenido ? `Contenido fuente (no leer literal, usar como base para el relato):\n${args.contenido.slice(0, 6000)}\n` : ''}
${args.brief ? `Brief adicional: ${args.brief}\n` : ''}
${args.applyBrand && args.brandText ? `Brand context:\n${args.brandText}\n` : ''}

Devuelve SOLO un objeto JSON con esta forma exacta:
{
  "title": "Título corto (max 80 chars)",
  "narrative_hook": "Frase gancho para los primeros 3 segundos del vídeo",
  "scenes": [
    {
      "scene_index": 0,
      "duration_seconds": 6,
      "narration_text": "Voz en off, máximo 2 frases cortas",
      "shot_type": "primer_plano|plano_detalle|plano_medio|plano_general|plano_americano",
      "camera_angle": "normal|picado|contrapicado|cenital",
      "camera_movement": "estatico|dolly_in|dolly_out|pan_left|pan_right|tilt_up|tilt_down|zoom_in|zoom_out",
      "lens": "24mm|35mm|50mm|85mm|135mm",
      "lighting": "natural_calida|natural_fria|estudio|dramatica|suave",
      "background": "Descripción del fondo y ambiente",
      "text_overlay": "Texto en pantalla (o cadena vacía)",
      "seedance_prompt": "Prompt en inglés optimizado para Seedance, cinematográfico, sin texto en pantalla",
      "visual_description": "Descripción narrativa completa de la escena"
    }
  ]
}

Importante: la suma de duration_seconds debe acercarse a ${args.duration}. Alterna shot_type entre escenas.`
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
    if (!body?.client_id || !body?.platform || !body?.tone || !body?.intention) {
      return NextResponse.json(
        { error: 'Faltan parámetros obligatorios (client_id, platform, tone, intention)' },
        { status: 400 },
      )
    }

    const duration = body.duration_seconds ?? 30
    const format: Format = body.format ?? '9x16'
    const applyBrand = body.apply_brand_assets ?? true
    const showLogo = body.show_logo ?? true

    const supabase = createAdminClient()

    // Brand context
    let brandText = ''
    if (applyBrand) {
      const { data: brand } = await supabase
        .from('brand_context')
        .select('tone_of_voice, style_keywords, raw_summary, colors')
        .eq('client_id', body.client_id)
        .maybeSingle()

      const parts: string[] = []
      if (brand?.tone_of_voice) parts.push(`Tono: ${brand.tone_of_voice}`)
      if (brand?.style_keywords?.length)
        parts.push(`Estilo: ${brand.style_keywords.join(', ')}`)
      if (Array.isArray(brand?.colors) && brand.colors.length) {
        const hexes = brand.colors
          .map((c: { hex?: string }) => c.hex)
          .filter(Boolean)
          .slice(0, 4)
        if (hexes.length) parts.push(`Colores: ${hexes.join(', ')}`)
      }
      if (brand?.raw_summary) parts.push(`Resumen: ${brand.raw_summary.slice(0, 500)}`)
      brandText = parts.join('\n')
    }

    // Contenido fuente (opcional)
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
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserPrompt({
            platform: body.platform,
            tone: body.tone,
            intention: body.intention,
            format,
            duration,
            brief: body.brief ?? null,
            contenido: contenidoText,
            brandText,
            applyBrand,
          }),
        },
      ],
    })

    const text = msg.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('\n')

    const parsed = parseJson(text)

    const { data: project, error: pErr } = await supabase
      .from('video_projects')
      .insert({
        client_id: body.client_id,
        content_id: body.content_id ?? null,
        title: parsed.title?.slice(0, 200) || 'Vídeo sin título',
        brief: body.brief ?? (contenidoText ? `Contenido: ${body.content_id}` : ''),
        script: parsed.narrative_hook,
        narrative_hook: parsed.narrative_hook,
        video_type: body.video_type ?? 'images_audio',
        duration_seconds: duration,
        format,
        platform: body.platform,
        tone: body.tone,
        intention: body.intention,
        apply_brand_assets: applyBrand,
        show_logo: showLogo,
        status: 'draft_script',
        generation_meta: { model: 'claude-sonnet-4-5' },
      })
      .select('*')
      .single()

    if (pErr || !project) {
      console.error('[generate-script v2] insert project error:', pErr)
      return NextResponse.json({ error: 'No se pudo crear el proyecto' }, { status: 500 })
    }

    const sceneRows = (parsed.scenes ?? []).map((s, i) => ({
      video_project_id: project.id,
      scene_index: s.scene_index ?? i,
      description: s.visual_description || s.background || '',
      narration_text: s.narration_text ?? '',
      duration_seconds: s.duration_seconds || 6,
      shot_type: s.shot_type ?? null,
      camera_angle: s.camera_angle ?? null,
      camera_movement: s.camera_movement ?? 'estatico',
      lens: s.lens ?? null,
      lighting: s.lighting ?? null,
      background: s.background ?? null,
      text_overlay: s.text_overlay ?? null,
      seedance_prompt: s.seedance_prompt ?? null,
      status: 'pending' as const,
    }))

    if (sceneRows.length > 0) {
      const { error: sErr } = await supabase.from('video_scenes').insert(sceneRows)
      if (sErr) console.error('[generate-script v2] insert scenes error:', sErr)
    }

    const { data: scenes } = await supabase
      .from('video_scenes')
      .select('*')
      .eq('video_project_id', project.id)
      .order('scene_index', { ascending: true })

    return NextResponse.json({ project, scenes: scenes ?? [] })
  } catch (err) {
    console.error('[videos/generate-script v2] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}
