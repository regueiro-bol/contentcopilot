import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fal } from '@fal-ai/client'
import path from 'path'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste } from '@/lib/costes'
import { aplicarOverlayTextoCanvas, type PosicionTexto } from '@/lib/video/text-overlay'
import { familiaDeFuente, FUENTE_DEFAULT_ID } from '@/lib/video/fonts'

// ── Configuración Vercel ──────────────────────────────────────────────────────
export const maxDuration = 120

const FAL_MODEL = 'fal-ai/flux-pro/v1.1-ultra'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Slide {
  imagen_prompt    : string
  texto_principal  : string
  texto_secundario?: string
  posicion_texto?  : PosicionTexto   // default 'centro'
}

interface RequestBody {
  contenido_id  : string
  cliente_id    : string
  tipo          : 'reel' | 'story'
  slides        : Slide[]
  duracion_slide: number
  fuente_id?    : string   // id del catálogo lib/video/fonts.ts — default 'dejavu'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// La composición de texto vive en lib/video/text-overlay.ts (@napi-rs/canvas).
// La versión anterior (Sharp + SVG) está en aplicarOverlayTexto.sharp.ts.bak
// para comparar durante la migración.

/**
 * Compone el vídeo MP4 a partir de imágenes PNG con transiciones xfade.
 * Usa child_process.exec con el binario de @ffmpeg-installer/ffmpeg.
 */
function composeVideo(
  slidePaths : string[],
  duration   : number,
  outputPath : string,
  ffmpegBin  : string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fadeD = 0.5
    const N     = slidePaths.length

    const inputs = slidePaths
      .map((p) => `-loop 1 -t ${(duration + fadeD).toFixed(2)} -i "${p}"`)
      .join(' ')

    let filterAndMap: string

    // Resolución de salida: 720×1280 (9:16) — equilibrio calidad/tamaño
    const SCALE = 'scale=720:1280'

    if (N === 1) {
      // Un solo slide: -vf permite combinar scale + pad directamente
      filterAndMap = [
        `-vf "${SCALE}:force_original_aspect_ratio=decrease,pad=720:1280:-1:-1:color=black"`,
        `-t ${duration}`,
      ].join(' ')
    } else {
      // Múltiples slides: encadenar xfade y luego scale dentro del mismo filter_complex
      const parts: string[] = []
      let prevLabel = '[0:v]'
      for (let i = 1; i < N; i++) {
        const offset   = parseFloat((i * (duration - fadeD)).toFixed(3))
        const outLabel = i === N - 1 ? '[xout]' : `[v${i}]`
        parts.push(
          `${prevLabel}[${i}:v]xfade=transition=fade:duration=${fadeD}:offset=${offset}${outLabel}`,
        )
        prevLabel = outLabel
      }
      // Aplicar scale al output final del xfade
      parts.push(`[xout]${SCALE}[vout]`)
      filterAndMap = `-filter_complex "${parts.join(';')}" -map "[vout]"`
    }

    const cmd = [
      `"${ffmpegBin}"`,
      inputs,
      filterAndMap,
      '-c:v libx264',
      '-crf 28',          // calidad/tamaño: 28 ≈ ~500KB–1MB para un reel típico
      '-preset fast',     // codificación rápida en Vercel Lambda
      '-pix_fmt yuv420p',
      '-r 30',
      '-movflags +faststart',
      '-y',
      `"${outputPath}"`,
    ].join(' ')

    console.log('[VIDEO] FFmpeg cmd:', cmd.substring(0, 300))

    exec(cmd, { timeout: 90_000 }, (err, _stdout, stderr) => {
      if (err) {
        console.error('[VIDEO] FFmpeg stderr:', stderr?.slice(-1000))
        reject(new Error(`FFmpeg falló: ${err.message}`))
      } else {
        resolve()
      }
    })
  })
}

/** Garantiza que el bucket 'videos' existe (público, 50 MB por archivo). */
async function ensureVideosBucket(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  // getBucket es más directo que listar todos los buckets
  const { data: existing } = await supabase.storage.getBucket('videos')
  if (existing) {
    console.log('[VIDEO] Bucket "videos" ya existe')
    return
  }
  console.log('[VIDEO] Bucket "videos" no encontrado, creando…')
  const { error } = await supabase.storage.createBucket('videos', {
    public       : true,
    fileSizeLimit: 52_428_800, // 50 MB
  })
  if (error) {
    console.error('[VIDEO] Error creando bucket "videos":', error.message)
    throw new Error(`No se pudo crear el bucket de vídeos: ${error.message}`)
  }
  console.log('[VIDEO] Bucket "videos" creado correctamente')
}

/** Sube el buffer MP4 y devuelve su URL pública. */
async function uploadVideo(
  supabase    : ReturnType<typeof createAdminClient>,
  buffer      : Buffer,
  contenidoId : string,
  tipo        : string,
): Promise<string | null> {
  await ensureVideosBucket(supabase)
  const filePath = `${contenidoId}/${tipo}_${Date.now()}.mp4`
  const { error } = await supabase.storage.from('videos').upload(filePath, buffer, {
    contentType: 'video/mp4',
    upsert     : true,
  })
  if (error) {
    console.error('[VIDEO] Error subiendo vídeo al storage:', error.message)
    return null
  }
  const { data } = supabase.storage.from('videos').getPublicUrl(filePath)
  return data.publicUrl
}

// ── Handler principal ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  console.log('[VIDEO] Request recibida')

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string | null
  try {
    const session = await auth()
    userId = session.userId
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.log('[VIDEO] Error capturado (auth):', err.message)
    console.error('[VIDEO] Stack:', err.stack)
    const r = { error: 'Error de autenticación' }
    console.log('[VIDEO] Devolviendo respuesta:', JSON.stringify(r))
    return NextResponse.json(r, { status: 500 })
  }

  if (!userId) {
    const r = { error: 'No autorizado' }
    console.log('[VIDEO] Devolviendo respuesta:', JSON.stringify(r))
    return NextResponse.json(r, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: RequestBody
  try {
    body = await req.json()
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.log('[VIDEO] Error capturado (parse body):', err.message)
    const r = { error: 'Body JSON inválido' }
    console.log('[VIDEO] Devolviendo respuesta:', JSON.stringify(r))
    return NextResponse.json(r, { status: 400 })
  }

  console.log('[VIDEO] Body:', JSON.stringify(body).substring(0, 200))

  const { contenido_id, cliente_id, tipo, slides, duracion_slide, fuente_id } = body
  // Familia canvas de la fuente pedida — familiaDeFuente cae a DejaVu si el id
  // no existe en el catálogo, y el overlay tiene su propio fallback si el
  // registro de la fuente falló
  const fontFamily = familiaDeFuente(fuente_id ?? FUENTE_DEFAULT_ID)

  // ── Validaciones ──────────────────────────────────────────────────────────
  if (!contenido_id || !cliente_id) {
    const r = { error: 'contenido_id y cliente_id son obligatorios' }
    console.log('[VIDEO] Devolviendo respuesta:', JSON.stringify(r))
    return NextResponse.json(r, { status: 400 })
  }
  if (!['reel', 'story'].includes(tipo)) {
    const r = { error: 'tipo debe ser "reel" o "story"' }
    console.log('[VIDEO] Devolviendo respuesta:', JSON.stringify(r))
    return NextResponse.json(r, { status: 400 })
  }
  if (!Array.isArray(slides) || slides.length < 1 || slides.length > 5) {
    const r = { error: 'slides debe tener entre 1 y 5 elementos' }
    console.log('[VIDEO] Devolviendo respuesta:', JSON.stringify(r))
    return NextResponse.json(r, { status: 400 })
  }
  if (!duracion_slide || duracion_slide < 3 || duracion_slide > 8) {
    const r = { error: 'duracion_slide debe estar entre 3 y 8 segundos' }
    console.log('[VIDEO] Devolviendo respuesta:', JSON.stringify(r))
    return NextResponse.json(r, { status: 400 })
  }

  // ── Inicializar clientes (nunca a nivel de módulo) ────────────────────────
  fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? '' })

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg') as { path: string }
  const ffmpegBin = ffmpegInstaller.path
  console.log('[VIDEO] FFmpeg bin:', ffmpegBin)

  // ── Directorio temporal ───────────────────────────────────────────────────
  const tmpDir     = `/tmp/video_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const slidePaths : string[] = []

  try {
    await fs.mkdir(tmpDir, { recursive: true })

    // ── 1. Generar imágenes FLUX en paralelo ────────────────────────────────
    console.log(`[VIDEO] Generando ${slides.length} imágenes FLUX para ${tipo}…`)

    const imageResults = await Promise.all(
      slides.map(async (slide, i) => {
        console.log(`[VIDEO] FLUX slide ${i + 1}: prompt="${slide.imagen_prompt.substring(0, 80)}"`)
        const result = await fal.subscribe(FAL_MODEL, {
          input: {
            prompt          : slide.imagen_prompt.trim(),
            aspect_ratio    : '9:16',
            num_images      : 1,
            output_format   : 'jpeg',
            safety_tolerance: '4',
            enhance_prompt  : true,
          },
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const imageUrl = (result.data as any)?.images?.[0]?.url as string | undefined
        if (!imageUrl) throw new Error(`No se generó imagen para el slide ${i + 1}`)
        console.log(`[VIDEO] FLUX slide ${i + 1} OK: ${imageUrl.substring(0, 60)}…`)
        return { slide, imageUrl, index: i }
      }),
    )

    // ── 2. Descargar + overlay de texto → PNG ───────────────────────────────
    console.log('[VIDEO] Aplicando overlays de texto con canvas…')

    for (const { slide, imageUrl, index } of imageResults) {
      const imgRes   = await fetch(imageUrl)
      const imgBuf   = Buffer.from(await imgRes.arrayBuffer())
      console.log(`[VIDEO] Slide ${index + 1} descargada (${imgBuf.byteLength} bytes), aplicando overlay…`)
      const composed = await aplicarOverlayTextoCanvas(
        imgBuf,
        slide.texto_principal,
        slide.texto_secundario,
        slide.posicion_texto ?? 'centro',
        index,
        fontFamily,
      )
      const slidePath = path.join(tmpDir, `slide_${index}.png`)
      await fs.writeFile(slidePath, composed)
      slidePaths.push(slidePath)
      console.log(`[VIDEO] Slide ${index + 1} guardada en ${slidePath}`)
    }

    // ── 3. Componer vídeo con FFmpeg ────────────────────────────────────────
    console.log('[VIDEO] Componiendo vídeo MP4 con FFmpeg…')
    const outputPath = path.join(tmpDir, 'output.mp4')
    await composeVideo(slidePaths, duracion_slide, outputPath, ffmpegBin)

    const stats = await fs.stat(outputPath)
    console.log(`[VIDEO] MP4 generado: ${outputPath} (${stats.size} bytes)`)

    // ── 4. Leer el MP4 generado ─────────────────────────────────────────────
    const videoBuffer = await fs.readFile(outputPath)

    // ── 5. Subir a Supabase Storage ─────────────────────────────────────────
    console.log('[VIDEO] Subiendo a Supabase Storage…')
    const supabase = createAdminClient()
    const videoUrl = await uploadVideo(supabase, videoBuffer, contenido_id, tipo)
    if (!videoUrl) throw new Error('Error al subir el vídeo al storage')
    console.log('[VIDEO] Subido a Storage:', videoUrl)

    // ── 6. Insertar en videos_generados ────────────────────────────────────
    const duracionTotal = slides.length * duracion_slide
    const { data: videoRecord, error: dbError } = await supabase
      .from('videos_generados')
      .insert({
        contenido_id,
        cliente_id,
        tipo,
        video_url        : videoUrl,
        duracion_segundos: duracionTotal,
        num_slides       : slides.length,
        status           : 'draft',
        metadatos        : {
          slides: slides.map((s) => ({
            texto_principal : s.texto_principal,
            texto_secundario: s.texto_secundario ?? null,
            posicion_texto  : s.posicion_texto ?? 'centro',
          })),
          duracion_slide,
          fuente_id: fuente_id ?? FUENTE_DEFAULT_ID,
        },
      })
      .select('id')
      .single()

    if (dbError) {
      console.error('[VIDEO] Error insertando en BD:', dbError.message)
      // Continuamos — el vídeo ya está en Storage, devolvemos la URL
    } else {
      console.log('[VIDEO] Registro BD insertado, id:', videoRecord?.id)
    }

    // ── 7. Registrar coste (fire & forget) ─────────────────────────────────
    guardarRegistroCoste({
      contenido_id,
      tipo_operacion: tipo === 'reel' ? 'video_reel' : 'video_story',
      agente        : 'fal_flux',
      modelo        : FAL_MODEL,
      unidades      : slides.length,
      coste_usd     : 0.055 * slides.length,
      metadatos     : { tipo, num_slides: slides.length, duracion_slide },
    }).catch((e) => console.error('[VIDEO] Error registrando coste:', e))

    const resultado = {
      id       : videoRecord?.id ?? null,
      video_url: videoUrl,
      duracion : duracionTotal,
    }
    console.log('[VIDEO] Devolviendo respuesta:', JSON.stringify(resultado))
    return NextResponse.json(resultado)

  } catch (e) {
    // ── CATCH: TODOS los errores terminan aquí con una respuesta JSON ────────
    const err = e instanceof Error ? e : new Error(String(e))
    console.log('[VIDEO] Error capturado:', err.message)
    console.error('[VIDEO] Stack:', err.stack)
    const r = { error: err.message }
    console.log('[VIDEO] Devolviendo respuesta:', JSON.stringify(r))
    return NextResponse.json(r, { status: 500 })

  } finally {
    // ── FINALLY: limpieza garantizada de /tmp/ ───────────────────────────────
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
