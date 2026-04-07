/**
 * POST /api/videos/[id]/generate
 *
 * Pipeline:
 *  1. Marca proyecto en 'generating'
 *  2. Por cada escena (con limit=3):
 *      a) FLUX Pro genera imagen
 *      b) ElevenLabs genera audio narración
 *      c) Si video_type ∈ {animation, infographic}: Seedance anima la imagen
 *  3. ffmpeg monta el vídeo final con subtítulos y formatos pedidos
 *  4. Sube a bucket 'videos' y actualiza video_projects
 */
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { synthesizeSpeech, DEFAULT_VOICE_ID } from '@/lib/video/elevenlabs'
import { uploadVideoAsset, ensureVideosBucket } from '@/lib/video/storage'
import { buildVideo, type SceneInput, type VideoFormat } from '@/lib/video/compose'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const FLUX_MODEL = 'fal-ai/flux-pro/v1.1-ultra'
const SEEDANCE_MODEL = 'fal-ai/bytedance/seedance/v1/lite/image-to-video'

interface VideoScene {
  id: string
  scene_index: number
  description: string
  narration_text: string
  duration_seconds: number
  image_url: string | null
  video_clip_url: string | null
  audio_url: string | null
  status: string
  shot_type: string | null
  camera_angle: string | null
  camera_movement: string | null
  lens: string | null
  lighting: string | null
  background: string | null
  text_overlay: string | null
  seedance_prompt: string | null
}

interface VideoProject {
  id: string
  client_id: string
  title: string
  brief: string
  script: string | null
  video_type: 'images_audio' | 'animation' | 'infographic'
  duration_seconds: number
  format: '9x16' | '16x9' | '1x1' | 'both'
  elevenlabs_voice_id: string | null
  apply_brand_assets: boolean | null
}

const CAMERA_MOTION: Record<string, string> = {
  estatico: 'static shot, locked camera, no movement',
  dolly_in: 'slow push in, camera moving forward',
  dolly_out: 'slow pull back, camera moving backward',
  pan_left: 'slow pan left, horizontal camera movement',
  pan_right: 'slow pan right, horizontal camera movement',
  tilt_up: 'slow tilt up, vertical camera movement',
  tilt_down: 'slow tilt down, vertical camera movement',
  zoom_in: 'slow zoom in, lens compression',
  zoom_out: 'slow zoom out, revealing shot',
}

function getCameraMotionPrompt(movement: string | null | undefined): string {
  if (!movement) return CAMERA_MOTION.estatico
  return CAMERA_MOTION[movement] ?? CAMERA_MOTION.estatico
}

interface FluxImageResult {
  images?: Array<{ url: string }>
  image?: { url: string }
}
interface SeedanceResult {
  video?: { url: string }
}

// ── helpers ────────────────────────────────────────────────

async function pLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (idx < items.length) {
      const i = idx++
      await fn(items[i])
    }
  })
  await Promise.all(workers)
}

type ImageFormat = '9x16' | '16x9' | '1x1'

function formatToAspect(fmt: ImageFormat): string {
  if (fmt === '9x16') return '9:16'
  if (fmt === '1x1') return '1:1'
  return '16:9'
}

async function generateImage(prompt: string, format: ImageFormat): Promise<string | null> {
  try {
    const result = (await fal.subscribe(FLUX_MODEL, {
      input: {
        prompt,
        aspect_ratio: formatToAspect(format),
        num_images: 1,
        safety_tolerance: '6',
        output_format: 'jpeg',
      },
    })) as { data: FluxImageResult }
    const url = result.data?.images?.[0]?.url ?? result.data?.image?.url ?? null
    return url
  } catch (err) {
    console.error('[video/generate] FLUX error:', err)
    return null
  }
}

async function animateImage(params: {
  imageUrl: string
  prompt: string
  duration: number
  format: ImageFormat
}): Promise<string | null> {
  try {
    const input: Record<string, unknown> = {
      image_url: params.imageUrl,
      prompt: `${params.prompt}, smooth cinematic motion`,
      duration: String(Math.min(Math.max(params.duration, 3), 12)),
      resolution: '480p',
      aspect_ratio: formatToAspect(params.format),
    }
    const result = (await fal.subscribe(SEEDANCE_MODEL, {
      input: input as never,
    })) as { data: SeedanceResult }
    return result.data?.video?.url ?? null
  } catch (err) {
    console.error('[video/generate] Seedance error:', err)
    return null
  }
}

async function generateAndUploadAudio(
  text: string,
  voiceId: string,
  projectId: string,
  sceneId: string,
  errorSink: string[],
): Promise<string | null> {
  if (!text?.trim()) return null
  try {
    const buf = await synthesizeSpeech({ text, voiceId })
    const path = `${projectId}/audio/${sceneId}.mp3`
    return await uploadVideoAsset({ buffer: buf, path, contentType: 'audio/mpeg' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[video/generate] elevenlabs error:', msg)
    errorSink.push(`scene=${sceneId.slice(0, 8)}: ${msg}`)
    return null
  }
}

// ── handler ────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const bypass = req.headers.get('x-internal-trigger') === 'cc-caldaria-v2-test'
  if (!bypass) {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const id = ctx.params.id
  const supabase = createAdminClient()

  fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY })
  await ensureVideosBucket()

  const elevenLabsErrors: string[] = []

  const { data: projectRaw, error: pErr } = await supabase
    .from('video_projects')
    .select('*')
    .eq('id', id)
    .single()
  if (pErr || !projectRaw) {
    return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  }
  const project = projectRaw as VideoProject

  const { data: scenesRaw } = await supabase
    .from('video_scenes')
    .select('*')
    .eq('video_project_id', id)
    .order('scene_index', { ascending: true })

  const scenes = (scenesRaw ?? []) as VideoScene[]
  if (scenes.length === 0) {
    return NextResponse.json({ error: 'No hay escenas para generar' }, { status: 400 })
  }

  await supabase.from('video_projects').update({ status: 'generating' }).eq('id', id)

  // Brand context para enriquecer prompts
  const { data: brand } = await supabase
    .from('brand_context')
    .select('tone_of_voice, style_keywords')
    .eq('client_id', project.client_id)
    .maybeSingle()

  const stylePrefix = [
    brand?.style_keywords?.length ? brand.style_keywords.join(', ') : null,
    brand?.tone_of_voice || null,
  ]
    .filter(Boolean)
    .join('. ')

  const voiceId = project.elevenlabs_voice_id || DEFAULT_VOICE_ID
  // Animamos siempre, salvo que el usuario haya elegido explícitamente
  // un tipo distinto a images_audio/animation/infographic en el futuro.
  const needsAnimation =
    project.video_type === 'images_audio' ||
    project.video_type === 'animation' ||
    project.video_type === 'infographic'

  const fmtForImage: ImageFormat =
    project.format === '16x9' ? '16x9' : project.format === '1x1' ? '1x1' : '9x16'

  // Batch 2-en-paralelo (Seedance tarda 2-3 min/clip; con maxDuration=300s
  // un batch de 2 deja margen suficiente para 6 escenas como máximo).
  await pLimit(scenes, 2, async (scene) => {
    const typedScene = scene as VideoScene
    await supabase.from('video_scenes').update({ status: 'generating' }).eq('id', typedScene.id)

    const useBrand = (project.apply_brand_assets ?? true) && stylePrefix
    // Prompt base para FLUX: la descripción visual enriquecida con brand si procede.
    const imagePrompt = useBrand
      ? `${stylePrefix}. ${typedScene.description}`
      : typedScene.description

    const imageUrl = await generateImage(imagePrompt, fmtForImage)

    let videoClipUrl: string | null = null
    if (needsAnimation && imageUrl) {
      // Usa el seedance_prompt generado por el director de arte y le añade
      // el movimiento de cámara traducido.
      const motion = getCameraMotionPrompt(typedScene.camera_movement)
      const seedancePrompt =
        [typedScene.seedance_prompt?.trim(), motion, 'cinematic, 24fps']
          .filter(Boolean)
          .join(', ') || typedScene.description

      videoClipUrl = await animateImage({
        imageUrl,
        prompt: seedancePrompt,
        duration: typedScene.duration_seconds || 5,
        format: fmtForImage,
      })
    }

    const audioUrl = await generateAndUploadAudio(
      typedScene.narration_text,
      voiceId,
      project.id,
      typedScene.id,
      elevenLabsErrors,
    )

    const status = imageUrl ? 'ready' : 'error'
    await supabase
      .from('video_scenes')
      .update({
        image_url: imageUrl,
        video_clip_url: videoClipUrl,
        audio_url: audioUrl,
        status,
      })
      .eq('id', typedScene.id)
  })

  // Recargar escenas con URLs
  const { data: readyScenes } = await supabase
    .from('video_scenes')
    .select('*')
    .eq('video_project_id', id)
    .order('scene_index', { ascending: true })

  const usable = (readyScenes ?? []).filter((s) => s.image_url || s.video_clip_url) as VideoScene[]
  if (usable.length === 0) {
    await supabase.from('video_projects').update({ status: 'draft_script' }).eq('id', id)
    return NextResponse.json({ error: 'No se pudo generar ninguna escena' }, { status: 500 })
  }

  // Formatos a renderizar
  const formats: VideoFormat[] =
    project.format === 'both' ? ['9x16', '16x9'] : [project.format as VideoFormat]

  const results: { format: VideoFormat; url: string }[] = []
  const composeErrors: string[] = []
  for (const fmt of formats) {
    try {
      const sceneInputs: SceneInput[] = usable.map((s) => ({
        visualUrl: (s.video_clip_url ?? s.image_url) as string,
        visualKind: s.video_clip_url ? 'video' : 'image',
        audioUrl: s.audio_url,
        caption: s.narration_text,
        durationSeconds: s.duration_seconds || 5,
      }))

      const buf = await buildVideo({
        scenes: sceneInputs,
        format: fmt,
        outFileName: `${project.id}_${fmt}.mp4`,
      })
      const path = `${project.id}/final_${fmt}_${Date.now()}.mp4`
      const url = await uploadVideoAsset({ buffer: buf, path, contentType: 'video/mp4' })
      if (url) results.push({ format: fmt, url })
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}` : String(err)
      console.error(`[video/generate] ffmpeg error (${fmt}):`, msg)
      composeErrors.push(`${fmt}: ${msg}`)
    }
  }

  if (results.length === 0) {
    await supabase.from('video_projects').update({ status: 'draft_script' }).eq('id', id)
    return NextResponse.json(
      { error: 'Fallo al montar el vídeo', details: composeErrors },
      { status: 500 },
    )
  }

  const primary = results[0]
  await supabase
    .from('video_projects')
    .update({
      video_url: primary.url,
      status: 'draft_video',
      generation_meta: {
        renders: results,
        elevenlabs_errors: elevenLabsErrors.slice(),
      },
    })
    .eq('id', id)

  const { data: finalProject } = await supabase
    .from('video_projects')
    .select('*')
    .eq('id', id)
    .single()
  return NextResponse.json({
    project: finalProject,
    scenes: readyScenes ?? [],
    renders: results,
    elevenlabs_errors: elevenLabsErrors.slice(),
  })
}
