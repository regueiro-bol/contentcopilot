/**
 * POST /api/ad-creatives/generate
 *
 * Pipeline de generación de ad creatives:
 *   1. Carga brand_context + brand_assets del cliente
 *   2. Genera variaciones de copy con Claude
 *   3. Genera imagen de FONDO con Fal.ai (sin texto, sin overlays)
 *   4. Compone el PNG final con sharp:
 *        — Imagen de fondo en el área superior/izquierda
 *        — Bloque de color sólido (color del cliente) en el área inferior/derecha
 *        — Headline, body, CTA y logo renderizados como SVG overlay
 *   5. Sube el PNG compuesto al bucket 'ad-creatives' de Supabase Storage
 *   6. Guarda la URL permanente en ad_creatives
 *
 * Modelos Fal.ai (SOLO fondo, sin texto):
 *   paid_campaign + organic_informative → fal-ai/flux-pro/v1.1-ultra
 *   organic_brand                       → fal-ai/nano-banana-pro
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFromDrive } from '@/lib/google-drive'
import { composeCreative } from '@/lib/ad-creatives/compose'
import { ensureAdCreativesBucket, uploadAdCreative } from '@/lib/ad-creatives/storage'

export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type PublicationIntent = 'organic_informative' | 'organic_brand' | 'paid_campaign'
type AdFormat          = '1x1' | '9x16' | '1.91x1'

interface GenerateBody {
  client_id:          string
  brief:              string
  publication_intent: PublicationIntent
  formats:            AdFormat[]
  source_content?:    string
  campaign_name?:     string
  variation_count?:   number
  source_creative_id?: string
}

interface CopyVariation {
  headline:           string
  tagline?:           string
  caption?:           string
  body?:              string
  cta?:               string
  visual_description: string
  needs_text_overlay: boolean  // ignorado para selección de modelo — siempre usamos sharp
}

interface StoredColor {
  name:    string
  hex:     string
  role?:   string
  usage?:  string
}

interface FalImageResult {
  images?: Array<{ url: string }>
  image?:  { url: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modelos y formatos
// ─────────────────────────────────────────────────────────────────────────────

const FAL_MODELS = {
  flux:       'fal-ai/flux-pro/v1.1-ultra',
  nanoBanana: 'fal-ai/nano-banana-pro',
} as const

type FalModelKey = keyof typeof FAL_MODELS

const FLUX_ASPECT_RATIO: Record<AdFormat, string> = {
  '1x1':    '1:1',
  '9x16':   '9:16',
  '1.91x1': '16:9',
}

const NANO_BANANA_ASPECT_RATIO: Record<AdFormat, string> = {
  '1x1':    '1:1',
  '9x16':   '9:16',
  '1.91x1': '16:9',
}

const VARIATION_COUNT: Record<PublicationIntent, number> = {
  organic_informative: 3,
  organic_brand:       3,
  paid_campaign:       5,
}

/** Selecciona modelo según intent. Ideogram eliminado — usamos sharp para el texto. */
function selectModel(intent: PublicationIntent): FalModelKey {
  if (intent === 'organic_brand') return 'nanoBanana'
  return 'flux'
}

// ─────────────────────────────────────────────────────────────────────────────
// Colores de composición
// ─────────────────────────────────────────────────────────────────────────────

interface RgbColor { r: number; g: number; b: number }
interface InstitutionPaletteColor { rgb: RgbColor; color_weight: number }

function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function hexToRgb(hex: string): RgbColor | null {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b }
}

/** Devuelve los HEX de colores primario/secundario para el bloque de sharp */
function getCompositionColors(
  colors: StoredColor[],
  institutionPalette: InstitutionPaletteColor[] | null,
): { primaryHex: string; secondaryHex: string } {
  if (institutionPalette && institutionPalette.length >= 1) {
    return {
      primaryHex:   rgbToHex(institutionPalette[0].rgb),
      secondaryHex: institutionPalette.length >= 3
        ? rgbToHex(institutionPalette[2].rgb)
        : rgbToHex(institutionPalette[institutionPalette.length - 1].rgb),
    }
  }

  const primary   = colors.find((c) => c.role === 'primary'   || c.usage === 'primary')   ?? colors[0]
  const secondary = colors.find((c) => c.role === 'secondary' || c.usage === 'secondary') ?? colors[1] ?? colors[0]

  return {
    primaryHex:   primary?.hex   ?? '#1a1a2e',
    secondaryHex: secondary?.hex ?? '#e94560',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detección de institución → paleta override
// ─────────────────────────────────────────────────────────────────────────────

function detectInstitution(brief: string): InstitutionPaletteColor[] | null {
  const text = brief.toLowerCase()

  if (
    text.includes('policía nacional') || text.includes('policia nacional') ||
    text.includes(' cnp ') || text.startsWith('cnp ') || text.includes(' cnp,')
  ) {
    return [
      { rgb: { r: 0,   g: 56,  b: 117 }, color_weight: 0.50 },
      { rgb: { r: 255, g: 255, b: 255 }, color_weight: 0.30 },
      { rgb: { r: 212, g: 175, b: 55  }, color_weight: 0.20 },
    ]
  }

  if (
    text.includes('guardia civil') || text.includes('benemérita') || text.includes('benemerita')
  ) {
    return [
      { rgb: { r: 34,  g: 85,  b: 34  }, color_weight: 0.50 },
      { rgb: { r: 255, g: 255, b: 255 }, color_weight: 0.30 },
      { rgb: { r: 212, g: 175, b: 55  }, color_weight: 0.20 },
    ]
  }

  if (text.includes('bombero')) {
    return [
      { rgb: { r: 180, g: 30,  b: 30  }, color_weight: 0.55 },
      { rgb: { r: 255, g: 165, b: 0   }, color_weight: 0.45 },
    ]
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy con Claude
// ─────────────────────────────────────────────────────────────────────────────

const COPY_SYSTEM_PROMPT = `Eres un experto copywriter especializado en marketing digital y publicidad.
Tu tarea es generar variaciones de copy para creativos publicitarios.
Responde EXCLUSIVAMENTE con un array JSON válido (sin comentarios, sin markdown, sin texto adicional).`

function buildCopyPrompt(params: {
  intent:          PublicationIntent
  brief:           string
  sourceContent:   string | undefined
  toneOfVoice:     string | null
  styleKeywords:   string[]
  restrictions:    string | null
  clientName:      string
  variationCount:  number
}): string {
  const {
    intent, brief, sourceContent, toneOfVoice,
    styleKeywords, restrictions, clientName, variationCount,
  } = params

  const intentDescription: Record<PublicationIntent, string> = {
    organic_informative: 'contenido orgánico informativo/educativo para redes sociales',
    organic_brand:       'contenido orgánico de marca/storytelling para redes sociales',
    paid_campaign:       'anuncio de pago (paid media) con objetivo de conversión',
  }

  const copyStructure: Record<PublicationIntent, string> = {
    organic_informative: `{
  "headline": "Titular principal (max 10 palabras, impactante)",
  "caption": "Texto del post (2-4 frases, informativo y enganchante)",
  "visual_description": "Descripción detallada de la escena/fondo ideal (50-100 palabras): qué muestra, estilo, composición, iluminación. NO mencionar texto, letras ni tipografía.",
  "needs_text_overlay": false
}`,
    organic_brand: `{
  "headline": "Titular emocional de marca (max 8 palabras)",
  "tagline": "Frase de marca corta y memorable (max 6 palabras)",
  "visual_description": "Descripción detallada de la escena/fondo ideal (50-100 palabras): estilo lifestyle, mood, composición. NO mencionar texto ni tipografía.",
  "needs_text_overlay": false
}`,
    paid_campaign: `{
  "headline": "Titular del anuncio (max 40 chars, llamada a la atención)",
  "body": "Cuerpo del anuncio (1-2 frases, beneficio claro)",
  "cta": "Call to action (2-4 palabras: 'Empieza ahora', 'Descubre más'...)",
  "visual_description": "Descripción detallada de la escena/fondo ideal (50-100 palabras). Solo la imagen, sin texto ni overlays.",
  "needs_text_overlay": false
}`,
  }

  return `Genera exactamente ${variationCount} variaciones de copy para un creativo de tipo "${intentDescription[intent]}".

CLIENTE: ${clientName}
BRIEF: ${brief}${sourceContent ? `\nCONTENIDO FUENTE: ${sourceContent}` : ''}

IDENTIDAD DE MARCA:
- Tono de voz: ${toneOfVoice ?? 'Profesional y cercano'}
- Palabras clave de estilo: ${styleKeywords.length > 0 ? styleKeywords.join(', ') : 'no especificadas'}
- Restricciones: ${restrictions ?? 'ninguna'}

Devuelve un array JSON con exactamente ${variationCount} objetos, cada uno con esta estructura:
${copyStructure[intent]}

Reglas:
- Cada variación debe ser distinta en enfoque y ángulo creativo
- Respeta el tono de voz y las restricciones de la marca
- La visual_description describe SOLO la imagen de fondo (sin texto, sin overlays)
- Responde SOLO con el array JSON, sin texto antes ni después`
}

async function generateCopyVariations(params: {
  intent:                  PublicationIntent
  brief:                   string
  sourceContent:           string | undefined
  toneOfVoice:             string | null
  styleKeywords:           string[]
  restrictions:            string | null
  clientName:              string
  variationCountOverride?: number
}): Promise<CopyVariation[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const variationCount = params.variationCountOverride ?? VARIATION_COUNT[params.intent]

  const message = await anthropic.messages.create({
    model:      'claude-opus-4-5',
    max_tokens: 4096,
    system:     COPY_SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: buildCopyPrompt({ ...params, variationCount }) }],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Claude no devolvió texto para el copy')

  const raw      = textBlock.text.trim()
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr  = jsonMatch ? jsonMatch[1].trim() : raw

  let variations: CopyVariation[]
  try {
    variations = JSON.parse(jsonStr) as CopyVariation[]
  } catch {
    throw new Error(`JSON inválido del copy: ${jsonStr.slice(0, 300)}`)
  }

  if (!Array.isArray(variations)) throw new Error('Claude devolvió un objeto en lugar de un array')

  return variations.map((v) => ({
    headline:           v.headline          ?? '',
    tagline:            v.tagline,
    caption:            v.caption,
    body:               v.body,
    cta:                v.cta,
    visual_description: v.visual_description ?? '',
    needs_text_overlay: false,  // siempre false — el texto va en sharp
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt de imagen (solo fondo, sin texto)
// ─────────────────────────────────────────────────────────────────────────────

function buildImagePrompt(params: {
  variation:     CopyVariation
  styleKeywords: string[]
  format:        AdFormat
}): string {
  const { variation, styleKeywords, format } = params

  const formatDesc: Record<AdFormat, string> = {
    '1x1':    'square 1:1 composition',
    '9x16':   'vertical 9:16 composition for Stories/Reels',
    '1.91x1': 'horizontal panoramic 1.91:1 composition for display ads',
  }

  const styleRef = styleKeywords.length > 0
    ? styleKeywords.slice(0, 6).join(', ')
    : 'professional, modern'

  let prompt = variation.visual_description

  if (styleRef) prompt += `. Visual style: ${styleRef}`
  prompt += `. Optimized ${formatDesc[format]}`

  if (format === '9x16') {
    prompt += '. Full bleed, edge to edge composition, no borders, no padding'
  }

  // Sufijo obligatorio: sin texto, fotorrealismo
  prompt += '. Clean background, no text, no words, no typography, no letters, no captions, no overlays. Photorealistic commercial photography.'

  return prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Generación de imagen con Fal.ai (solo fondo)
// ─────────────────────────────────────────────────────────────────────────────

async function callFalai(params: {
  prompt:            string
  modelKey:          FalModelKey
  format:            AdFormat
  referenceImageUrl?: string | null
}): Promise<FalImageResult> {
  const { prompt, modelKey, format, referenceImageUrl } = params
  const endpoint = FAL_MODELS[modelKey]

  if (modelKey === 'flux') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await (fal as any).subscribe(endpoint, {
      input: {
        prompt,
        aspect_ratio:     FLUX_ASPECT_RATIO[format],
        num_images:       1,
        output_format:    'jpeg',
        safety_tolerance: '4',
        enhance_prompt:   true,
        ...(referenceImageUrl ? { image_url: referenceImageUrl, strength: 0.2 } : {}),
      },
    })) as FalImageResult
  } else {
    // Nano Banana Pro
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await (fal as any).subscribe(endpoint, {
      input: {
        prompt,
        aspect_ratio:  NANO_BANANA_ASPECT_RATIO[format],
        num_images:    1,
        resolution:    '2K',
        output_format: 'jpeg',
        ...(referenceImageUrl ? { image_url: referenceImageUrl } : {}),
      },
    })) as FalImageResult
  }
}

async function generateBackgroundImage(params: {
  prompt:            string
  modelKey:          FalModelKey
  format:            AdFormat
  referenceImageUrl?: string | null
}): Promise<{ url: string | null; meta: Record<string, unknown> }> {
  const { prompt, modelKey, format, referenceImageUrl } = params
  const endpoint = FAL_MODELS[modelKey]

  // Intento 1: con imagen de referencia (si existe)
  if (referenceImageUrl) {
    try {
      const result = await callFalai(params)
      const output   = (result as unknown as { data: FalImageResult })?.data ?? result
      const imageUrl = output?.images?.[0]?.url ?? output?.image?.url ?? null
      if (imageUrl) {
        console.log(`[ad-creatives] Fal.ai OK con referencia (${format})`)
        return { url: imageUrl, meta: { model: endpoint, format } }
      }
    } catch (err) {
      // La URL de referencia puede ser inaccesible (auth, timeout…) — reintentar sin ella
      console.warn(
        `[ad-creatives] Fal.ai falló con referencia (${format}), reintentando sin ella:`,
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  // Intento 2: sin imagen de referencia
  try {
    const result   = await callFalai({ prompt, modelKey, format, referenceImageUrl: null })
    const output   = (result as unknown as { data: FalImageResult })?.data ?? result
    const imageUrl = output?.images?.[0]?.url ?? output?.image?.url ?? null

    if (!imageUrl) {
      console.error(`[ad-creatives] Fal.ai devolvió respuesta vacía (${endpoint}, ${format})`)
    } else {
      console.log(`[ad-creatives] Fal.ai OK sin referencia (${format})`)
    }
    return { url: imageUrl, meta: { model: endpoint, format } }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[ad-creatives] Fal.ai error definitivo (${endpoint}, ${format}):`, errorMsg)
    return { url: null, meta: { model: endpoint, format, error: errorMsg } }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: Partial<GenerateBody>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const {
    client_id, brief, publication_intent, formats,
    source_content, campaign_name, variation_count, source_creative_id,
  } = body

  const batchId = crypto.randomUUID()

  if (!client_id || typeof client_id !== 'string')
    return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 })
  if (!brief || typeof brief !== 'string' || !brief.trim())
    return NextResponse.json({ error: 'brief es requerido' }, { status: 400 })
  if (!publication_intent || !['organic_informative', 'organic_brand', 'paid_campaign'].includes(publication_intent))
    return NextResponse.json({ error: 'publication_intent inválido' }, { status: 400 })
  if (!Array.isArray(formats) || formats.length === 0)
    return NextResponse.json({ error: 'formats es requerido' }, { status: 400 })

  const validFormats: AdFormat[] = ['1x1', '9x16', '1.91x1']
  const invalidFormat = formats.find((f) => !validFormats.includes(f as AdFormat))
  if (invalidFormat)
    return NextResponse.json({ error: `Formato inválido: ${invalidFormat}` }, { status: 400 })

  fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY })

  const supabase = createAdminClient()

  // ── Asegurar bucket de Storage ─────────────────────────────────────────────
  await ensureAdCreativesBucket()

  // ── Cargar datos del cliente ───────────────────────────────────────────────
  const [
    { data: clienteData, error: clienteError },
    { data: contextData },
    { data: assetsData },
  ] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('id', client_id).single(),
    supabase
      .from('brand_context')
      .select('colors, typography, tone_of_voice, style_keywords, restrictions')
      .eq('client_id', client_id)
      .single(),
    supabase
      .from('brand_assets')
      .select('id, asset_type, drive_file_id, drive_url, file_name, mime_type')
      .eq('client_id', client_id)
      .eq('approved', true)
      .eq('active', true)
      .in('asset_type', ['logo', 'product_image', 'font']),
  ])

  if (clienteError || !clienteData)
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const colors        = (contextData?.colors         as unknown as StoredColor[]) ?? []
  const toneOfVoice   = (contextData?.tone_of_voice  as string | null)             ?? null
  const styleKeywords = (contextData?.style_keywords as string[] | null)            ?? []
  const restrictions  = (contextData?.restrictions   as string | null)              ?? null

  // Logging defensivo — siempre visible en producción para diagnosticar fallos
  console.log(
    `[ad-creatives] Cliente: "${clienteData.nombre}" | brand_context: ${contextData ? 'sí' : 'NO (usando defaults)'} | colores: ${colors.length} | assets: ${(assetsData ?? []).length}`,
  )

  // ── Descargar logo y fuente desde Drive ───────────────────────────────────
  const logoAsset    = (assetsData ?? []).find((a) => a.asset_type === 'logo')
  const fontAsset    = (assetsData ?? []).find((a) => a.asset_type === 'font')
  const productAsset = (assetsData ?? []).find((a) => a.asset_type === 'product_image')

  const [logoBuffer, fontBuffer] = await Promise.all([
    logoAsset?.drive_file_id  ? downloadFromDrive(logoAsset.drive_file_id)  : Promise.resolve(null),
    fontAsset?.drive_file_id  ? downloadFromDrive(fontAsset.drive_file_id)  : Promise.resolve(null),
  ])

  if (logoBuffer)  console.log(`[ad-creatives] Logo descargado: ${logoAsset?.file_name}`)
  if (fontBuffer)  console.log(`[ad-creatives] Fuente descargada: ${fontAsset?.file_name}`)

  // ── Imagen de referencia para Fal.ai ──────────────────────────────────────
  const referenceImageUrl: string | null = (() => {
    if (!productAsset?.drive_file_id) return null
    // Usamos la URL pública de producción para que Fal.ai pueda acceder a la imagen
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    if (!appUrl) return null
    return `${appUrl.replace(/\/$/, '')}/api/brand-assets/image/${productAsset.drive_file_id}`
  })()

  // ── Detección de institución ───────────────────────────────────────────────
  const institutionPalette = detectInstitution(brief.trim())
  const { primaryHex, secondaryHex } = getCompositionColors(colors, institutionPalette)

  if (process.env.NODE_ENV === 'development') {
    console.log('[AD-GEN] primaryHex para sharp:', primaryHex, '| secondaryHex:', secondaryHex)
    console.log('[AD-GEN] Institución detectada:', institutionPalette !== null)
  }

  console.log(
    `[ad-creatives] Cliente "${clienteData.nombre}" | intent: ${publication_intent} | formatos: ${formats.join(', ')}`,
  )

  // ── Generar copy ──────────────────────────────────────────────────────────
  let variations: CopyVariation[]
  try {
    variations = await generateCopyVariations({
      intent:                 publication_intent,
      brief:                  brief.trim(),
      sourceContent:          source_content,
      toneOfVoice,
      styleKeywords,
      restrictions,
      clientName:             clienteData.nombre,
      variationCountOverride: variation_count
        ? Math.min(Math.max(1, variation_count), 10)
        : undefined,
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Error generando copy: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    )
  }

  console.log(`[ad-creatives] ${variations.length} variaciones de copy generadas`)

  // ── Generar imágenes + componer + guardar ─────────────────────────────────
  const allCreatives: Array<{
    id:                 string
    client_id:          string
    brief:              string
    publication_intent: string
    copy:               Record<string, unknown>
    image_url:          string | null
    format:             AdFormat
    model_used:         string
    variation_index:    number
    status:             string
    batch_id:           string
    campaign_name:      string | null
    created_at:         string
  }> = []

  await Promise.all(
    variations.map(async (variation, variationIdx) => {
      const modelKey = selectModel(publication_intent)

      await Promise.all(
        (formats as AdFormat[]).map(async (format) => {
          // 1. Prompt de fondo (sin texto)
          const imagePrompt = buildImagePrompt({ variation, styleKeywords, format })

          if (process.env.NODE_ENV === 'development') {
            console.log(`[AD-GEN] Prompt v${variationIdx} ${format}:`, imagePrompt.slice(0, 200))
          }

          // 2. Generar fondo con Fal.ai
          const { url: bgUrl, meta: imageMeta } = await generateBackgroundImage({
            prompt: imagePrompt,
            modelKey,
            format,
            referenceImageUrl,
          })

          // 3. Componer PNG final con sharp
          let finalImageUrl: string | null = null

          if (!bgUrl) {
            console.error(`[ad-creatives] bgUrl null — Fal.ai no generó imagen para v${variationIdx} ${format}. Creativo guardado sin imagen.`)
          }

          if (bgUrl) {
            try {
              const composedBuffer = await composeCreative({
                backgroundImageUrl: bgUrl,
                headline:           variation.headline,
                body:               variation.body ?? variation.caption,
                cta:                variation.cta,
                logoBuffer,
                primaryHex,
                secondaryHex,
                format,
                fontBuffer,
              })

              // 4. Subir a Supabase Storage
              const storageUrl = await uploadAdCreative({
                buffer:         composedBuffer,
                clientId:       client_id,
                campaignName:   campaign_name,
                format,
                variationIndex: variationIdx,
              })

              if (storageUrl) {
                finalImageUrl = storageUrl
                console.log(`[ad-creatives] Subido a Storage: v${variationIdx} ${format}`)
              } else {
                // Upload falló — usar URL de Fal.ai como fallback (expira, pero muestra algo)
                finalImageUrl = bgUrl
                console.warn(`[ad-creatives] Upload Storage falló v${variationIdx} ${format} — usando URL Fal.ai`)
              }
            } catch (composeErr) {
              console.error(
                `[ad-creatives] Error sharp v${variationIdx} ${format}:`,
                composeErr instanceof Error ? composeErr.message : String(composeErr),
              )
              finalImageUrl = bgUrl  // fallback: URL de Fal.ai
            }
          }

          // 5. Copy payload
          const copyPayload: Record<string, string | undefined> = {
            headline: variation.headline,
          }
          if (variation.tagline) copyPayload.tagline = variation.tagline
          if (variation.caption) copyPayload.caption = variation.caption
          if (variation.body)    copyPayload.body    = variation.body
          if (variation.cta)     copyPayload.cta     = variation.cta

          // 6. Guardar en Supabase
          const { data: saved, error: saveError } = await supabase
            .from('ad_creatives')
            .insert({
              client_id,
              brief:             brief.trim(),
              publication_intent,
              source_content:    source_content ?? null,
              copy:              copyPayload,
              image_url:         finalImageUrl,
              format,
              model_used:        FAL_MODELS[modelKey],
              variation_index:   variationIdx,
              status:            'draft',
              batch_id:          batchId,
              campaign_name:     campaign_name ?? null,
              generation_meta: {
                ...imageMeta,
                image_prompt:         imagePrompt,
                variation_index:      variationIdx,
                background_image_url: bgUrl,
                reference_image_url:  referenceImageUrl ?? undefined,
                source_creative_id:   source_creative_id ?? undefined,
                institution_detected: institutionPalette !== null,
              },
            })
            .select('id, client_id, brief, publication_intent, copy, image_url, format, model_used, variation_index, status, batch_id, campaign_name, created_at')
            .single()

          if (saveError) {
            console.error(`[ad-creatives] Error guardando creativo v${variationIdx} ${format}:`, saveError.message)
            return
          }

          allCreatives.push({
            id:                 saved.id,
            client_id:          saved.client_id,
            brief:              saved.brief,
            publication_intent: saved.publication_intent,
            copy:               saved.copy,
            image_url:          saved.image_url,
            format:             saved.format as AdFormat,
            model_used:         saved.model_used,
            variation_index:    saved.variation_index,
            status:             saved.status,
            batch_id:           saved.batch_id,
            campaign_name:      saved.campaign_name,
            created_at:         saved.created_at,
          })
        }),
      )
    }),
  )

  allCreatives.sort(
    (a, b) =>
      a.variation_index - b.variation_index ||
      validFormats.indexOf(a.format) - validFormats.indexOf(b.format),
  )

  console.log(`[ad-creatives] ${allCreatives.length} creativos generados y guardados`)

  return NextResponse.json({
    success:   true,
    client_id,
    intent:    publication_intent,
    creatives: allCreatives,
    stats: {
      total:         allCreatives.length,
      with_image:    allCreatives.filter((c) => c.image_url !== null).length,
      without_image: allCreatives.filter((c) => c.image_url === null).length,
      variations:    variations.length,
      formats:       formats.length,
    },
  })
}
