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
import { composeCreativeCanvas } from '@/lib/ad-creatives/compose-canvas'
import { ensureAdCreativesBucket, uploadAdCreative } from '@/lib/ad-creatives/storage'
import { guardarRegistroCoste } from '@/lib/costes'

export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type PublicationIntent = 'organic_informative' | 'organic_brand' | 'paid_campaign'
type AdFormat          = '1x1' | '9x16' | '1.91x1'

interface GenerateBody {
  client_id:           string
  brief:               string
  publication_intent:  PublicationIntent
  formats:             AdFormat[]
  source_content?:     string
  campaign_name?:      string
  variation_count?:    number
  source_creative_id?: string
  contenido_id?:       string
}

/** Copy de una variación adaptado a un formato concreto (CAMBIO 4). */
interface FormatCopy {
  headline:     string
  subheadline?: string | null
  body?:        string | null
  cta?:         string | null
}

/** Concepto creativo enriquecido de una variación (CAMBIO 1). */
interface CopyVariation {
  angulo:             string
  concepto_visual_es: string
  prompt_en:          string
  caption:            string
  /** Copy por formato — solo los formatos solicitados. */
  copy_por_formato:   Partial<Record<AdFormat, FormatCopy>>
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

const COPY_SYSTEM_PROMPT = `Eres director creativo y copywriter senior de una agencia española de publicidad, experto en dirección de arte fotográfica y en piezas para redes sociales.

JERARQUÍA DE CONTEXTO (obligatoria):
- MARCA (cliente): gobierna el tono verbal y el estilo VISUAL global. Es la capa dominante — nada puede contradecirla.
- PROYECTO: marca el enfoque editorial y el ángulo temático.
- CONTENIDO (artículo): es la FUENTE del mensaje. No inventes datos que no estén en el contenido o el brief.

Para el estilo visual RESPETA ESTRICTAMENTE el brand_context: si la marca tiene una estética natural/documental/sin gloss, NO generes composiciones artificiales, posadas ni con acabado publicitario brillante. Si prohíbe algo, es inviolable.

Responde EXCLUSIVAMENTE con un array JSON válido (sin comentarios, sin markdown, sin texto adicional). Empieza con [ y termina con ].`

/** Guía de longitud de copy por formato (CAMBIO 4). */
const FORMAT_COPY_GUIDE: Record<AdFormat, string> = {
  '9x16':   'VERTICAL (mucho espacio): headline potente (≤7 palabras), subheadline opcional, body de 1-2 frases si aporta, cta si aplica.',
  '1x1':    'CUADRADO (espacio medio): headline (≤7 palabras), subheadline breve opcional, body corto de 1 frase como máximo, cta si aplica.',
  '1.91x1': 'HORIZONTAL APAISADO (poco alto): MUY breve. Solo headline corto (≤5 palabras) + cta si aplica. subheadline y body deben ser null — no cabe texto largo.',
}

/** Región de espacio negativo reservado para el texto, según ratio (CAMBIO 4). */
const FORMAT_NEGATIVE_SPACE: Record<AdFormat, string> = {
  '9x16':   'Reserve clear, uncluttered negative space in the LOWER THIRD of the vertical frame for a text overlay.',
  '1x1':    'Reserve clear, uncluttered negative space in the LOWER THIRD of the square frame for a text overlay.',
  '1.91x1': 'Reserve clear, uncluttered negative space on the LEFT THIRD of the horizontal frame for a short text overlay; keep the subject on the right.',
}

function buildCopyPrompt(params: {
  intent:          PublicationIntent
  brief:           string
  sourceContent:   string | undefined
  toneOfVoice:     string | null
  styleKeywords:   string[]
  restrictions:    string | null
  clientName:      string
  projectTone:     string | null
  projectDesc:     string | null
  formats:         AdFormat[]
  variationCount:  number
}): string {
  const {
    intent, brief, sourceContent, toneOfVoice,
    styleKeywords, restrictions, clientName, projectTone, projectDesc,
    formats, variationCount,
  } = params

  const intentDescription: Record<PublicationIntent, string> = {
    organic_informative: 'contenido orgánico informativo/educativo para redes sociales',
    organic_brand:       'contenido orgánico de marca/storytelling para redes sociales',
    paid_campaign:       'anuncio de pago (paid media) con objetivo de conversión',
  }

  const ctaRule = intent === 'paid_campaign'
    ? 'cta: OBLIGATORIO (2-4 palabras, ej. "Descúbrelo", "Empieza ahora").'
    : 'cta: null (esta intención no lleva CTA salvo que el brief lo pida).'

  const copyPorFormato = formats
    .map((f) => `    "${f}": { "headline": "...", "subheadline": null, "body": null, "cta": null }  // ${FORMAT_COPY_GUIDE[f]}`)
    .join('\n')

  const bloqueProyecto = (projectTone || projectDesc)
    ? `PROYECTO (enfoque editorial):
${projectDesc ? `- Descripción: ${projectDesc}` : ''}
${projectTone ? `- Tono editorial: ${projectTone}` : ''}`.trim()
    : 'PROYECTO: sin especificaciones — aplica solo marca y contenido.'

  return `Genera exactamente ${variationCount} variaciones para un creativo de tipo "${intentDescription[intent]}", CADA UNA CON UN ÁNGULO CREATIVO DISTINTO.

CLIENTE: ${clientName}
BRIEF: ${brief}${sourceContent ? `\n\nCONTENIDO FUENTE (artículo — fuente del mensaje):\n${sourceContent}` : ''}

MARCA (identidad — capa dominante):
- Tono de voz: ${toneOfVoice ?? 'Profesional y cercano'}
- Palabras clave de estilo: ${styleKeywords.length > 0 ? styleKeywords.join(', ') : 'no especificadas'}
- Restricciones: ${restrictions ?? 'ninguna'}

${bloqueProyecto}

Cada objeto del array debe tener EXACTAMENTE esta estructura:
{
  "angulo": "el ángulo creativo de esta variación en una frase (ej: 'el momento en que el dinero no puede esperar 48h')",
  "concepto_visual_es": "descripción en español clara de qué se ve en la imagen, para que el redactor valide sin leer inglés técnico. 2-3 frases.",
  "prompt_en": "prompt fotográfico ELABORADO en inglés para FLUX (ver requisitos abajo)",
  "caption": "texto del pie de publicación (DISTINTO del texto sobre la imagen), con el tono de la marca",
  "copy_por_formato": {
${copyPorFormato}
  }
}

REQUISITOS DEL prompt_en — orden de fotografía profesional detallada, NO una descripción genérica. Cubre SIEMPRE estas capas:
- COMPOSICIÓN Y ENCUADRE: tipo de plano (primer plano/detalle/plano medio/general), ángulo de cámara (nivel de ojos/picado/contrapicado/cenital), regla de composición, y espacio negativo genérico donde irá el texto.
- ILUMINACIÓN: tipo (natural/dorada/difusa), dirección (lateral/contraluz/frontal suave), mood lumínico.
- ESCENA: sujeto y entorno detallados, localización española/europea, atrezzo coherente con el mensaje.
- PROFUNDIDAD: shallow/deep focus, bokeh si aplica.
- ESTILO FOTOGRÁFICO: género (documental/editorial/lifestyle) coherente con el brand_context del cliente.
- Termina SIEMPRE con: reglas de localización (contexto español/europeo; si hay moneda, euro banknotes/coins, nunca 'ATM'/'dollar bills' sino 'cash machine'/'euro banknotes') y la instrucción anti-texto: 'no visible text, no signage, no labels, no letters or numbers anywhere in the image, no watermarks'.
Ejemplo del nivel esperado: "medium close-up shot at eye level of a person's hands holding a smartphone showing a banking app, warm golden afternoon light from a window on the left, shallow depth of field with a softly blurred Spanish home interior in the background, documentary editorial style, negative space in the lower third for text overlay, authentic candid feel, no gloss, ...".

REGLAS DE COPY:
- ${ctaRule}
- Adapta la longitud del copy a CADA formato según su guía (el apaisado 1.91x1 va MUY breve).
- Usa null (no string vacío) en subheadline/body/cta cuando no apliquen.
- El caption es para el pie del post, no se renderiza sobre la imagen.
- Respeta el tono de la marca y las restricciones; el enfoque editorial lo marca el proyecto; el mensaje sale del contenido.

Responde SOLO con el array JSON (${variationCount} objetos), sin texto antes ni después.`
}

async function generateCopyVariations(params: {
  intent:                  PublicationIntent
  brief:                   string
  sourceContent:           string | undefined
  toneOfVoice:             string | null
  styleKeywords:           string[]
  restrictions:            string | null
  clientName:              string
  projectTone:             string | null
  projectDesc:             string | null
  formats:                 AdFormat[]
  variationCountOverride?: number
}): Promise<CopyVariation[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const variationCount = params.variationCountOverride ?? VARIATION_COUNT[params.intent]

  const message = await anthropic.messages.create({
    model:      'claude-opus-4-5',
    max_tokens: 8192,
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
    angulo:             v.angulo             ?? '',
    concepto_visual_es: v.concepto_visual_es ?? '',
    prompt_en:          v.prompt_en          ?? '',
    caption:            v.caption            ?? '',
    copy_por_formato:   (v.copy_por_formato && typeof v.copy_por_formato === 'object')
      ? v.copy_por_formato
      : {},
  }))
}

/** Copy del formato pedido, con fallback a cualquier otro formato disponible. */
function resolverCopyFormato(variation: CopyVariation, format: AdFormat): FormatCopy {
  const exacto = variation.copy_por_formato[format]
  if (exacto?.headline) return exacto
  // Fallback: primer formato con headline
  const alguno = Object.values(variation.copy_por_formato).find((c) => c?.headline)
  return alguno ?? { headline: variation.angulo || '', subheadline: null, body: null, cta: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt de imagen (solo fondo, sin texto)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prompt final de fondo. Parte del prompt_en elaborado que devuelve Claude
 * (ya cubre composición/luz/escena/estilo + localización + anti-texto) y le
 * añade el ratio y la reserva de espacio negativo específica del formato.
 */
function buildImagePrompt(params: {
  variation:     CopyVariation
  styleKeywords: string[]
  format:        AdFormat
}): string {
  const { variation, styleKeywords, format } = params

  const formatDesc: Record<AdFormat, string> = {
    '1x1':    'square 1:1 composition',
    '9x16':   'vertical 9:16 composition for Stories/Reels, full bleed, edge to edge, no borders',
    '1.91x1': 'horizontal panoramic 1.91:1 composition for display ads',
  }

  // Base: el prompt elaborado de Claude; fallback al concepto si viniera vacío
  let prompt = variation.prompt_en?.trim() || variation.concepto_visual_es?.trim() || ''

  const styleRef = styleKeywords.slice(0, 6).join(', ')
  if (styleRef && !prompt.toLowerCase().includes(styleRef.toLowerCase().split(',')[0]))
    prompt += `. Brand visual style: ${styleRef}`

  prompt += `. ${formatDesc[format]}. ${FORMAT_NEGATIVE_SPACE[format]}`

  // Refuerzo de seguridad por si el prompt_en no cerró con anti-texto/localización
  prompt += '. European/Spanish setting; any currency must be euro banknotes or coins. No visible text, no signage, no labels, no letters or numbers anywhere in the image, no watermarks. Photorealistic commercial photography.'

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
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
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
    contenido_id,
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

  // ── Obtener proyecto (para costes + contexto editorial: CAMBIO 3) ─────────
  let proyectoId: string | null = null
  let projectTone: string | null = null
  let projectDesc: string | null = null
  if (contenido_id) {
    const { data: contData } = await supabase
      .from('contenidos')
      .select('proyecto_id')
      .eq('id', contenido_id)
      .maybeSingle()
    proyectoId = contData?.proyecto_id ?? null
    if (proyectoId) {
      const { data: projData } = await supabase
        .from('proyectos')
        .select('tono_voz, descripcion')
        .eq('id', proyectoId)
        .maybeSingle()
      projectTone = (projData?.tono_voz as string | null) ?? null
      projectDesc = (projData?.descripcion as string | null) ?? null
    }
  }

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
      projectTone,
      projectDesc,
      formats:                formats as AdFormat[],
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
          // Copy adaptado a este formato (CAMBIO 4)
          const fmtCopy = resolverCopyFormato(variation, format)

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
              const composedBuffer = await composeCreativeCanvas({
                backgroundImageUrl: bgUrl,
                headline:           fmtCopy.headline,
                subheadline:        fmtCopy.subheadline,
                body:               fmtCopy.body,
                cta:                fmtCopy.cta,
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

          // 5. Copy payload (por formato + metadatos del concepto)
          const copyPayload: Record<string, string | undefined> = {
            headline: fmtCopy.headline,
          }
          if (fmtCopy.subheadline)      copyPayload.subheadline = fmtCopy.subheadline
          if (fmtCopy.body)             copyPayload.body        = fmtCopy.body
          if (fmtCopy.cta)              copyPayload.cta         = fmtCopy.cta
          if (variation.caption)        copyPayload.caption     = variation.caption
          if (variation.angulo)         copyPayload.angulo      = variation.angulo
          if (variation.concepto_visual_es) copyPayload.concepto_visual_es = variation.concepto_visual_es

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
              contenido_id:      contenido_id ?? null,
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

  // ── Registrar costes FLUX (fire & forget, una entrada por imagen) ─────────
  const modelKey = selectModel(publication_intent)
  const creativosConImagen = allCreatives.filter((c) => c.image_url !== null)
  if (creativosConImagen.length > 0) {
    Promise.all(
      creativosConImagen.map((c) =>
        guardarRegistroCoste({
          contenido_id   : contenido_id ?? null,
          proyecto_id    : proyectoId,
          tipo_operacion : 'ad_creative',
          agente         : 'flux_pro',
          modelo         : FAL_MODELS[modelKey],
          unidades       : 1,
          coste_usd      : 0.055,
          metadatos      : {
            formato           : c.format,
            campaign_name     : campaign_name ?? null,
            publication_intent,
          },
        }),
      ),
    ).catch((e) => console.error('[Costes] Error registrando costes ad_creative:', e))
  }

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
