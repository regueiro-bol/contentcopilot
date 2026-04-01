/**
 * POST /api/ad-creatives/generate
 *
 * Pipeline completo de generación de ad creatives:
 *   1. Carga brand_context + brand_assets del cliente
 *   2. Genera variaciones de copy con Claude
 *   3. Genera imágenes con Fal.ai (Ideogram V3 / FLUX Pro / Nano Banana Pro)
 *   4. Guarda cada creativo en ad_creatives (Supabase)
 *   5. Devuelve el array de creativos generados
 *
 * Modelos Fal.ai:
 *   paid_campaign    → fal-ai/ideogram/v3        (texto sobre imagen)
 *   organic_brand    → fal-ai/nano-banana-pro     (lifestyle/aesthetic)
 *   organic_informative → fal-ai/flux-pro/v1.1-ultra  (fotografía editorial)
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

// Next.js: ampliar el timeout para operaciones de larga duración (Vercel Pro)
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type PublicationIntent = 'organic_informative' | 'organic_brand' | 'paid_campaign'
type AdFormat = '1x1' | '9x16' | '1.91x1'

interface GenerateBody {
  client_id: string
  brief: string
  publication_intent: PublicationIntent
  formats: AdFormat[]
  source_content?: string
  campaign_name?: string
  variation_count?: number          // Override del número de variaciones (1-10); default según intent
  source_creative_id?: string       // ID del creative base cuando se generan variantes desde el drawer
}

interface CopyVariation {
  headline: string
  tagline?: string      // organic_brand
  caption?: string      // organic_informative
  body?: string         // paid_campaign
  cta?: string          // paid_campaign
  visual_description: string   // descripción visual para el prompt de imagen
  needs_text_overlay: boolean  // true → Ideogram (texto en imagen)
}

interface StoredColor {
  name: string
  hex: string
  role?: string
  usage?: string
}

interface FalImageResult {
  images?: Array<{ url: string }>
  image?: { url: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuración de modelos y formatos
// ─────────────────────────────────────────────────────────────────────────────

const FAL_MODELS = {
  ideogram:   'fal-ai/ideogram/v3',
  flux:       'fal-ai/flux-pro/v1.1-ultra',
  nanoBanana: 'fal-ai/nano-banana-pro',
} as const

type FalModelKey = keyof typeof FAL_MODELS

/** Selecciona el modelo según intent y si la variación lleva texto encima */
function selectModel(intent: PublicationIntent, needsTextOverlay: boolean): FalModelKey {
  if (needsTextOverlay || intent === 'paid_campaign') return 'ideogram'
  if (intent === 'organic_brand') return 'nanoBanana'
  return 'flux'
}

/** Aspect ratio para FLUX Pro y Nano Banana */
const FLUX_ASPECT_RATIO: Record<AdFormat, string> = {
  '1x1':    '1:1',
  '9x16':   '9:16',
  '1.91x1': '16:9',   // más cercano a 1.91:1 disponible en FLUX
}

/** image_size para Ideogram V3 */
const IDEOGRAM_IMAGE_SIZE: Record<AdFormat, string | { width: number; height: number }> = {
  '1x1':    'square_hd',
  '9x16':   { width: 1080, height: 1920 },  // Tamaño exacto para Stories/Reels — full bleed
  '1.91x1': { width: 1200, height: 628 },   // ratio exacto para Meta/Display ads
}

/** aspect_ratio para Nano Banana Pro */
const NANO_BANANA_ASPECT_RATIO: Record<AdFormat, string> = {
  '1x1':    '1:1',
  '9x16':   '9:16',
  '1.91x1': '16:9',
}

/** Número de variaciones de copy por intent */
const VARIATION_COUNT: Record<PublicationIntent, number> = {
  organic_informative: 3,
  organic_brand:       3,
  paid_campaign:       5,
}

// ─────────────────────────────────────────────────────────────────────────────
// Generación de copy con Claude
// ─────────────────────────────────────────────────────────────────────────────

const COPY_SYSTEM_PROMPT = `Eres un experto copywriter especializado en marketing digital y publicidad.
Tu tarea es generar variaciones de copy para creativos publicitarios.
Responde EXCLUSIVAMENTE con un array JSON válido (sin comentarios, sin markdown, sin texto adicional).`

function buildCopyPrompt(params: {
  intent: PublicationIntent
  brief: string
  sourceContent: string | undefined
  toneOfVoice: string | null
  styleKeywords: string[]
  restrictions: string | null
  clientName: string
  variationCount: number
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
  "visual_description": "Descripción detallada de la imagen ideal (qué muestra, estilo, composición, iluminación)",
  "needs_text_overlay": false
}`,
    organic_brand: `{
  "headline": "Titular emocional de marca (max 8 palabras)",
  "tagline": "Frase de marca corta y memorable (max 6 palabras)",
  "visual_description": "Descripción detallada de la imagen ideal (qué muestra, estilo lifestyle, mood, composición)",
  "needs_text_overlay": false
}`,
    paid_campaign: `{
  "headline": "Titular del anuncio (max 40 chars, llamada a la atención)",
  "body": "Cuerpo del anuncio (1-2 frases, beneficio claro)",
  "cta": "Call to action (2-4 palabras: 'Compra ahora', 'Descubre más'...)",
  "visual_description": "Descripción detallada de la imagen ideal para el anuncio",
  "needs_text_overlay": true
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
- La visual_description debe ser detallada (50-100 palabras) para guiar la generación de imagen
- Responde SOLO con el array JSON, sin texto antes ni después`
}

async function generateCopyVariations(params: {
  intent: PublicationIntent
  brief: string
  sourceContent: string | undefined
  toneOfVoice: string | null
  styleKeywords: string[]
  restrictions: string | null
  clientName: string
  variationCountOverride?: number
}): Promise<CopyVariation[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const variationCount = params.variationCountOverride ?? VARIATION_COUNT[params.intent]

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    system: COPY_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildCopyPrompt({ ...params, variationCount }),
      },
    ],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude no devolvió texto para el copy')
  }

  const raw = textBlock.text.trim()
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw

  let variations: CopyVariation[]
  try {
    variations = JSON.parse(jsonStr) as CopyVariation[]
  } catch {
    throw new Error(`JSON inválido del copy: ${jsonStr.slice(0, 300)}`)
  }

  if (!Array.isArray(variations)) {
    throw new Error('Claude devolvió un objeto en lugar de un array de variaciones')
  }

  // Normalizar campos
  return variations.map((v) => ({
    headline:          v.headline ?? '',
    tagline:           v.tagline,
    caption:           v.caption,
    body:              v.body,
    cta:               v.cta,
    visual_description: v.visual_description ?? '',
    needs_text_overlay: v.needs_text_overlay ?? (params.intent === 'paid_campaign'),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Construcción del prompt de imagen
// ─────────────────────────────────────────────────────────────────────────────

function buildImagePrompt(params: {
  variation: CopyVariation
  intent: PublicationIntent
  styleKeywords: string[]
  format: AdFormat
  modelKey: FalModelKey
}): string {
  const { variation, styleKeywords, format, modelKey } = params

  const formatDesc: Record<AdFormat, string> = {
    '1x1':    'formato cuadrado 1:1',
    '9x16':   'formato vertical 9:16 para Stories/Reels',
    '1.91x1': 'formato horizontal panorámico para feed/display',
  }

  // Nota: los colores de marca NO se incluyen como texto en el prompt.
  // Se pasan como objetos RGB en el parámetro color_palette de Ideogram V3
  // directamente en generateImage() — nunca como HEX en texto.

  const styleRef = styleKeywords.length > 0
    ? styleKeywords.slice(0, 6).join(', ')
    : 'profesional, moderno'

  let prompt = variation.visual_description

  if (styleRef) {
    prompt += `. Estilo visual: ${styleRef}`
  }
  prompt += `. Composición optimizada para ${formatDesc[format]}`

  // Para Stories/Reels: composición de borde a borde sin márgenes blancos
  if (format === '9x16') {
    prompt += '. Full bleed, edge to edge composition, no borders, no padding, no white margins'
  }

  // Para Ideogram con texto encima, incluir el copy en el prompt
  if (modelKey === 'ideogram' && variation.needs_text_overlay) {
    const textElements = [
      variation.headline,
      variation.body,
      variation.cta,
    ].filter(Boolean)
    if (textElements.length > 0) {
      prompt += `. Incluir texto: "${textElements.join(' | ')}"`
    }
  }

  // Sufijo fotorrealista obligatorio — siempre, sin importar el brief
  prompt += '. Photorealistic commercial photography style. Real people, real environments. No illustration, no vector art, no flat design.'

  return prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de color
// ─────────────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detección de institución pública → paleta de colores override
// ─────────────────────────────────────────────────────────────────────────────

interface RgbColor { r: number; g: number; b: number }

interface InstitutionPaletteMember {
  rgb:          RgbColor
  color_weight: number
}

/**
 * Analiza el texto del brief y devuelve una paleta override si detecta
 * una institución pública conocida. Devuelve null si no hay coincidencia,
 * en cuyo caso se usa la paleta del brand_context del cliente.
 */
function detectInstitution(brief: string): InstitutionPaletteMember[] | null {
  const text = brief.toLowerCase()

  // ── Policía Nacional / CNP ──────────────────────────────────────────────────
  if (
    text.includes('policía nacional') ||
    text.includes('policia nacional') ||
    text.includes(' cnp ')            ||
    text.startsWith('cnp ')           ||
    text.includes(' cnp,')
  ) {
    return [
      { rgb: { r: 0,   g: 56,  b: 117 }, color_weight: 0.50 }, // #003875 azul institucional
      { rgb: { r: 255, g: 255, b: 255 }, color_weight: 0.30 }, // #FFFFFF blanco
      { rgb: { r: 212, g: 175, b: 55  }, color_weight: 0.20 }, // #D4AF37 dorado
    ]
  }

  // ── Guardia Civil / Benemérita ──────────────────────────────────────────────
  if (
    text.includes('guardia civil')  ||
    text.includes('benemérita')     ||
    text.includes('benemerita')
  ) {
    return [
      { rgb: { r: 34,  g: 85,  b: 34  }, color_weight: 0.50 }, // #225522 verde institucional
      { rgb: { r: 255, g: 255, b: 255 }, color_weight: 0.30 }, // #FFFFFF blanco
      { rgb: { r: 212, g: 175, b: 55  }, color_weight: 0.20 }, // #D4AF37 dorado
    ]
  }

  // ── Bomberos ────────────────────────────────────────────────────────────────
  if (text.includes('bombero')) {
    return [
      { rgb: { r: 180, g: 30,  b: 30  }, color_weight: 0.55 }, // #B41E1E rojo
      { rgb: { r: 255, g: 165, b: 0   }, color_weight: 0.45 }, // #FFA500 naranja
    ]
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Generación de imagen con Fal.ai
// ─────────────────────────────────────────────────────────────────────────────

async function generateImage(params: {
  prompt: string
  modelKey: FalModelKey
  format: AdFormat
  colors: StoredColor[]
  referenceImageUrl?: string | null
  /** Si no es null, sobreescribe los colores del brand_context con una paleta institucional */
  institutionPaletteOverride?: InstitutionPaletteMember[] | null
}): Promise<{ url: string | null; meta: Record<string, unknown> }> {
  const { prompt, modelKey, format, colors, referenceImageUrl, institutionPaletteOverride } = params
  const endpoint = FAL_MODELS[modelKey]

  try {
    let result: FalImageResult

    if (modelKey === 'ideogram') {
      // Ideogram V3 — soporta color_palette nativo y style_type REALISTIC
      // Prioridad: paleta institucional detectada > paleta del brand_context
      const colorPaletteMembers: InstitutionPaletteMember[] = institutionPaletteOverride
        ?? colors
          .slice(0, 5)
          .map((c) => {
            const rgb = hexToRgb(c.hex)
            if (!rgb) return null
            return {
              rgb,
              color_weight: c.role === 'primary' || c.usage === 'primary' ? 0.4 : 0.15,
            }
          })
          .filter((m): m is NonNullable<typeof m> => m !== null)

      const colorPalette = colorPaletteMembers.length > 0
        ? { members: colorPaletteMembers }
        : undefined

      const ideogramInput = {
        prompt,
        image_size:      IDEOGRAM_IMAGE_SIZE[format],
        style:           'REALISTIC',   // Fotorrealismo por defecto
        rendering_speed: 'BALANCED',
        num_images:      1,
        expand_prompt:   false,
        ...(colorPalette       ? { color_palette:   colorPalette }                      : {}),
        // Imagen de producto de referencia — refuerza coherencia visual con los assets reales
        ...(referenceImageUrl  ? { image_url: referenceImageUrl, image_strength: 0.25 } : {}),
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = (await (fal as any).subscribe(endpoint, {
        input: ideogramInput,
      })) as FalImageResult

    } else if (modelKey === 'flux') {
      // FLUX Pro 1.1 Ultra
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = (await (fal as any).subscribe(endpoint, {
        input: {
          prompt,
          aspect_ratio:     FLUX_ASPECT_RATIO[format],
          num_images:       1,
          output_format:    'jpeg',
          safety_tolerance: '4',
          enhance_prompt:   true,
          // Imagen de producto como referencia visual (strength baja para no dominar)
          ...(referenceImageUrl ? { image_url: referenceImageUrl, strength: 0.2 } : {}),
        },
      })) as FalImageResult

    } else {
      // Nano Banana Pro
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = (await (fal as any).subscribe(endpoint, {
        input: {
          prompt,
          aspect_ratio:  NANO_BANANA_ASPECT_RATIO[format],
          num_images:    1,
          resolution:    '2K',
          output_format: 'jpeg',
          // Imagen de referencia si el modelo la soporta
          ...(referenceImageUrl ? { image_url: referenceImageUrl } : {}),
        },
      })) as FalImageResult
    }

    // fal.subscribe devuelve { data: <model_output>, requestId }
    const output = (result as unknown as { data: FalImageResult })?.data ?? result
    const imageUrl =
      output?.images?.[0]?.url ??
      output?.image?.url ??
      null

    return {
      url:  imageUrl,
      meta: { model: endpoint, format },
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[ad-creatives] Fal.ai error (${endpoint}, ${format}):`, errorMsg)
    return {
      url:  null,
      meta: { model: endpoint, format, error: errorMsg },
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // ── 2. Validar body ────────────────────────────────────────────────────────
  let body: Partial<GenerateBody>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { client_id, brief, publication_intent, formats, source_content, campaign_name, variation_count, source_creative_id } = body
  // Single batch_id for all creatives in this generation run
  const batchId = crypto.randomUUID()

  if (!client_id || typeof client_id !== 'string') {
    return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 })
  }
  if (!brief || typeof brief !== 'string' || brief.trim().length === 0) {
    return NextResponse.json({ error: 'brief es requerido' }, { status: 400 })
  }
  if (!publication_intent || !['organic_informative', 'organic_brand', 'paid_campaign'].includes(publication_intent)) {
    return NextResponse.json({ error: 'publication_intent inválido' }, { status: 400 })
  }
  if (!Array.isArray(formats) || formats.length === 0) {
    return NextResponse.json({ error: 'formats es requerido y debe ser un array no vacío' }, { status: 400 })
  }
  const validFormats: AdFormat[] = ['1x1', '9x16', '1.91x1']
  const invalidFormat = formats.find((f) => !validFormats.includes(f as AdFormat))
  if (invalidFormat) {
    return NextResponse.json({ error: `Formato inválido: ${invalidFormat}` }, { status: 400 })
  }

  // ── 3. Configurar Fal.ai ───────────────────────────────────────────────────
  fal.config({ credentials: process.env.FAL_API_KEY })

  const supabase = createAdminClient()

  // ── 4. Cargar datos del cliente ────────────────────────────────────────────
  const [
    { data: clienteData, error: clienteError },
    { data: contextData },
    { data: assetsData },
  ] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nombre')
      .eq('id', client_id)
      .single(),
    supabase
      .from('brand_context')
      .select('colors, typography, tone_of_voice, style_keywords, restrictions')
      .eq('client_id', client_id)
      .single(),
    supabase
      .from('brand_assets')
      .select('id, asset_type, drive_url, file_name, mime_type')
      .eq('client_id', client_id)
      .eq('approved', true)
      .eq('active', true)
      .in('asset_type', ['logo', 'product_image']),
  ])

  if (clienteError || !clienteData) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  // Extraer contexto de marca (opcional — funciona sin él)
  const colors        = (contextData?.colors         as unknown as StoredColor[]) ?? []
  const toneOfVoice   = (contextData?.tone_of_voice  as string | null)            ?? null
  const styleKeywords = (contextData?.style_keywords as string[] | null)           ?? []
  const restrictions  = (contextData?.restrictions   as string | null)             ?? null

  if (process.env.NODE_ENV === 'development') {
    console.log('[AD-GEN] Brand context colores:', contextData?.colors ?? '(sin brand_context)')
  }

  // Primera imagen de producto aprobada — se usará como referencia visual en Fal.ai
  // drive_url contiene el webViewLink de Google Drive, que no es descargable públicamente.
  // Usamos el endpoint interno de preview (/api/brand-assets/:id/preview) que sí es
  // accesible en producción (Vercel). En desarrollo Fal.ai no puede alcanzar localhost,
  // así que se omite la referencia para evitar errores fatales en FLUX/Nano Banana.
  const productImageAsset = (assetsData ?? []).find((a) => a.asset_type === 'product_image')
  const referenceImageUrl: string | null = (() => {
    if (!productImageAsset) return null
    const driveUrl = productImageAsset.drive_url ?? ''
    if (!driveUrl.includes('drive.google.com')) return driveUrl || null
    // Drive webViewLink → usar endpoint de preview si hay URL pública conocida
    const vercelUrl = process.env.VERCEL_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
    if (!vercelUrl) return null  // dev local: omitir para no bloquear a FLUX/Nano Banana
    return `https://${vercelUrl.replace(/^https?:\/\//, '')}/api/brand-assets/${productImageAsset.id}/preview`
  })()

  if (referenceImageUrl) {
    console.log(`[ad-creatives] Usando imagen de referencia: ${productImageAsset?.file_name ?? referenceImageUrl}`)
  } else if (productImageAsset) {
    console.log(`[ad-creatives] Imagen de referencia omitida (Drive URL no pública en este entorno)`)
  }

  // Detectar institución pública en el brief → paleta de colores override
  const institutionPalette = detectInstitution(brief.trim())
  if (institutionPalette) {
    console.log(`[ad-creatives] Paleta institucional detectada (${institutionPalette.length} colores)`)
  }

  console.log(`[ad-creatives] Generando para cliente "${clienteData.nombre}" | intent: ${publication_intent} | formatos: ${formats.join(', ')}`)

  // ── 5. Generar copy con Claude ─────────────────────────────────────────────
  let variations: CopyVariation[]
  try {
    variations = await generateCopyVariations({
      intent:           publication_intent,
      brief:            brief.trim(),
      sourceContent:    source_content,
      toneOfVoice,
      styleKeywords,
      restrictions,
      clientName:       clienteData.nombre,
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

  // ── 6. Generar imágenes y guardar creativos ────────────────────────────────
  // Estructura: variationIndex × format → 1 creativo
  // Se procesan todas las variaciones en paralelo; dentro de cada variación,
  // los formatos también van en paralelo. Si falla una imagen, se guarda con null.

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
      const modelKey = selectModel(publication_intent, variation.needs_text_overlay)

      await Promise.all(
        (formats as AdFormat[]).map(async (format) => {
          // Construir prompt de imagen
          const imagePrompt = buildImagePrompt({
            variation,
            intent: publication_intent,
            styleKeywords,
            format,
            modelKey,
          })

          if (process.env.NODE_ENV === 'development') {
            // Reconstruir la paleta que recibirá Ideogram para poder loguearla
            const devPaletteMembers = institutionPalette
              ?? colors
                .slice(0, 5)
                .map((c) => { const rgb = hexToRgb(c.hex); return rgb ? { rgb, hex: c.hex, name: c.name } : null })
                .filter(Boolean)
            console.log('[AD-GEN] Color palette enviada a Ideogram:', JSON.stringify(devPaletteMembers, null, 2))
            console.log('[AD-GEN] Prompt completo:', imagePrompt)
            console.log('[AD-GEN] Institución detectada:', institutionPalette !== null)
          }

          // Generar imagen (nunca lanza — devuelve null en error)
          const { url: imageUrl, meta: imageMeta } = await generateImage({
            prompt:                     imagePrompt,
            modelKey,
            format,
            colors,
            institutionPaletteOverride: institutionPalette,
            referenceImageUrl,
          })

          // Preparar objeto copy limpio (sin visual_description ni needs_text_overlay)
          const copyPayload: Record<string, string | undefined> = {
            headline: variation.headline,
          }
          if (variation.tagline)  copyPayload.tagline = variation.tagline
          if (variation.caption)  copyPayload.caption = variation.caption
          if (variation.body)     copyPayload.body     = variation.body
          if (variation.cta)      copyPayload.cta      = variation.cta

          // Guardar en Supabase
          const { data: savedCreative, error: saveError } = await supabase
            .from('ad_creatives')
            .insert({
              client_id,
              brief:             brief.trim(),
              publication_intent,
              source_content:    source_content ?? null,
              copy:              copyPayload,
              image_url:         imageUrl,
              format,
              model_used:        FAL_MODELS[modelKey],
              variation_index:   variationIdx,
              status:            'draft',
              batch_id:          batchId,
              campaign_name:     campaign_name ?? null,
              generation_meta:   {
                ...imageMeta,
                image_prompt:         imagePrompt,
                variation_index:      variationIdx,
                reference_image_url:  referenceImageUrl ?? undefined,
                source_creative_id:   source_creative_id ?? undefined,
                institution_detected: institutionPalette !== null,
              },
            })
            .select('id, client_id, brief, publication_intent, copy, image_url, format, model_used, variation_index, status, batch_id, campaign_name, created_at')
            .single()

          if (saveError) {
            console.error(`[ad-creatives] Error guardando creativo (v${variationIdx}, ${format}):`, saveError.message)
            return
          }

          allCreatives.push({
            id:                 savedCreative.id,
            client_id:          savedCreative.client_id,
            brief:              savedCreative.brief,
            publication_intent: savedCreative.publication_intent,
            copy:               savedCreative.copy,
            image_url:          savedCreative.image_url,
            format:             savedCreative.format as AdFormat,
            model_used:         savedCreative.model_used,
            variation_index:    savedCreative.variation_index,
            status:             savedCreative.status,
            batch_id:           savedCreative.batch_id,
            campaign_name:      savedCreative.campaign_name,
            created_at:         savedCreative.created_at,
          })
        }),
      )
    }),
  )

  // Ordenar por variación y formato para respuesta consistente
  allCreatives.sort((a, b) =>
    a.variation_index - b.variation_index ||
    validFormats.indexOf(a.format) - validFormats.indexOf(b.format),
  )

  console.log(`[ad-creatives] ${allCreatives.length} creativos generados y guardados`)

  return NextResponse.json({
    success:    true,
    client_id,
    intent:     publication_intent,
    creatives:  allCreatives,
    stats: {
      total:           allCreatives.length,
      with_image:      allCreatives.filter((c) => c.image_url !== null).length,
      without_image:   allCreatives.filter((c) => c.image_url === null).length,
      variations:      variations.length,
      formats:         formats.length,
    },
  })
}
