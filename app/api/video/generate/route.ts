import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardarRegistroCoste } from '@/lib/costes'

// ── Configuración Vercel ──────────────────────────────────────────────────────
export const maxDuration = 120

const FAL_MODEL = 'fal-ai/flux-pro/v1.1-ultra'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Slide {
  imagen_prompt    : string
  texto_principal  : string
  texto_secundario?: string
}

interface RequestBody {
  contenido_id  : string
  cliente_id    : string
  tipo          : 'reel' | 'story'
  slides        : Slide[]
  duracion_slide: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Aplica gradiente oscuro inferior + texto superpuesto sobre una imagen 9:16.
 * Usa Sharp con SVG composite — no requiere fuentes del sistema.
 */
/**
 * Aplica gradiente + textos sobre la imagen usando PNGs intermedios por capa.
 *
 * Enfoque por capas independientes en lugar de un único SVG con coordenadas
 * absolutas, que tiene bugs de posicionamiento en librsvg/Sharp en macOS ARM64:
 *
 *   1. gradiente PNG (1080×1920, transparente arriba, opaco abajo)
 *   2. textoPrincipal PNG (1080×200, texto relativo dentro del tile)
 *   3. textoSecundario PNG (1080×80, texto relativo dentro del tile)  ← opcional
 *
 * Cada tile SVG usa coordenadas RELATIVAS a su propio canvas pequeño
 * (y=150 dentro de un 200px de alto = 75% desde arriba), y luego Sharp
 * los posiciona con `top` en la imagen 1920px.
 */
async function aplicarOverlayTexto(
  imageBuf       : Buffer,
  textoPrincipal : string,
  textoSecundario?: string,
  slideIndex     : number = 0,
): Promise<Buffer> {
  const W = 1080
  const H = 1920

  const palabras          = textoPrincipal.trim().split(/\s+/).length
  const fontSizePrincipal = palabras > 6 ? 56 : 76

  const principal  = escapeXml(textoPrincipal.trim())
  const secundario = textoSecundario ? escapeXml(textoSecundario.trim()) : ''

  // ── 1. Gradiente oscuro inferior (sin texto — evita el bug de coordenadas) ─
  const gradienteSVG = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000" stop-opacity="0"/>
      <stop offset="38%"  stop-color="#000" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.90"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${Math.round(H * 0.38)}" width="${W}" height="${Math.round(H * 0.62)}" fill="url(#g)"/>
</svg>`
  const gradienteBuffer = Buffer.from(gradienteSVG)

  // ── 2. Tile PNG para texto_principal (1080×200) ───────────────────────────
  //    Texto posicionado en y=150 dentro del tile (baseline a 50px del fondo)
  const TILE_P_H = 200
  const TILE_P_Y = 150    // baseline dentro del tile

  const tilePrincipalSVG = `<svg width="${W}" height="${TILE_P_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="s">
      <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.95"/>
    </filter>
  </defs>
  <text
    x="540" y="${TILE_P_Y}"
    font-family="Arial,Helvetica,sans-serif"
    font-size="${fontSizePrincipal}"
    font-weight="bold"
    fill="#ffffff"
    text-anchor="middle"
    filter="url(#s)"
  >${principal}</text>
</svg>`

  const textoPrincipalImg = await sharp({
    create: { width: W, height: TILE_P_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: Buffer.from(tilePrincipalSVG), top: 0, left: 0 }])
    .png()
    .toBuffer()

  // ── 3. Tile PNG para texto_secundario (1080×80), opcional ─────────────────
  //    Texto posicionado en y=55 dentro del tile
  const TILE_S_H = 80
  const TILE_S_Y = 55     // baseline dentro del tile

  let textoSecundarioImg: Buffer | null = null
  if (secundario) {
    const tileSecSVG = `<svg width="${W}" height="${TILE_S_H}" xmlns="http://www.w3.org/2000/svg">
  <text
    x="540" y="${TILE_S_Y}"
    font-family="Arial,Helvetica,sans-serif"
    font-size="38"
    font-weight="400"
    fill="#dde0e8"
    text-anchor="middle"
  >${secundario}</text>
</svg>`

    textoSecundarioImg = await sharp({
      create: { width: W, height: TILE_S_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: Buffer.from(tileSecSVG), top: 0, left: 0 }])
      .png()
      .toBuffer()
  }

  // ── 4. Composite final ────────────────────────────────────────────────────
  //
  //  Posición `top` de cada tile en la imagen 1920px:
  //    texto_principal:  1920 - 200 - 40 = 1680  (tile de 200px termina a 40px del fondo)
  //    texto_secundario: 1920 - 80       = 1840  (tile de 80px termina pegado al fondo)
  //
  const topPrincipal   = H - TILE_P_H - 40   // 1680
  const topSecundario  = H - TILE_S_H         // 1840

  console.log(
    `[VIDEO SVG] Slide ${slideIndex} — principal: top=${topPrincipal} fs=${fontSizePrincipal}px "${principal}"`,
    secundario ? `| sec: top=${topSecundario} "${secundario}"` : '| sin secundario',
  )

  const composites: Parameters<ReturnType<typeof sharp>['composite']>[0] = [
    { input: gradienteBuffer,   top: 0,            left: 0 },
    { input: textoPrincipalImg, top: topPrincipal, left: 0 },
  ]
  if (textoSecundarioImg) {
    composites.push({ input: textoSecundarioImg, top: topSecundario, left: 0 })
  }

  return sharp(imageBuf)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .composite(composites)
    .png()
    .toBuffer()
}

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

  const { contenido_id, cliente_id, tipo, slides, duracion_slide } = body

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
    console.log('[VIDEO] Aplicando overlays de texto con Sharp…')

    for (const { slide, imageUrl, index } of imageResults) {
      const imgRes   = await fetch(imageUrl)
      const imgBuf   = Buffer.from(await imgRes.arrayBuffer())
      console.log(`[VIDEO] Slide ${index + 1} descargada (${imgBuf.byteLength} bytes), aplicando overlay…`)
      const composed = await aplicarOverlayTexto(imgBuf, slide.texto_principal, slide.texto_secundario, index)
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
          })),
          duracion_slide,
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
