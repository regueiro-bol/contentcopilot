/**
 * Test script: genera ad creatives para Serás Formación
 * Ejecutar: npx tsx scripts/test-ad-creatives.ts
 *
 * Llama a la lógica de generación directamente (sin HTTP ni Clerk).
 */

import { readFileSync } from 'fs'
import path from 'path'

// Cargar variables de entorno desde .env.local manualmente
const envPath = path.resolve(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  const val = trimmed.slice(eq + 1).trim().replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1')
  process.env[key] = val
}

import { fal } from '@fal-ai/client'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// ─── Configuración ────────────────────────────────────────────────────────────

const CLIENT_ID     = '376bb392-7c8c-4e35-a7e6-b268521d172a'
const BRIEF         = 'Campaña para oposiciones a la Policía Nacional, jóvenes 18-30 años, destacar método de estudio personalizado'
const INTENT        = 'paid_campaign' as const
const FORMATS       = ['1x1'] as const

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PublicationIntent = 'organic_informative' | 'organic_brand' | 'paid_campaign'
type AdFormat = '1x1' | '9x16' | '1.91x1'

interface CopyVariation {
  headline: string
  tagline?: string
  caption?: string
  body?: string
  cta?: string
  visual_description: string
  needs_text_overlay: boolean
}

interface StoredColor {
  name: string
  hex: string
  role?: string
  usage?: string
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b }
}

interface InstitutionPaletteMember {
  rgb:          { r: number; g: number; b: number }
  color_weight: number
}

function detectInstitution(brief: string): InstitutionPaletteMember[] | null {
  const text = brief.toLowerCase()
  if (
    text.includes('policía nacional') || text.includes('policia nacional') ||
    text.includes(' cnp ') || text.startsWith('cnp ') || text.includes(' cnp,')
  ) {
    return [
      { rgb: { r: 0,   g: 56,  b: 117 }, color_weight: 0.50 }, // #003875 azul
      { rgb: { r: 255, g: 255, b: 255 }, color_weight: 0.30 }, // #FFFFFF blanco
      { rgb: { r: 212, g: 175, b: 55  }, color_weight: 0.20 }, // #D4AF37 dorado
    ]
  }
  if (text.includes('guardia civil') || text.includes('benemérita') || text.includes('benemerita')) {
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

interface FalImageResult {
  images?: Array<{ url: string }>
  image?:  { url: string }
}

// ─── Modelos y formatos ───────────────────────────────────────────────────────

const FAL_MODELS = {
  ideogram:   'fal-ai/ideogram/v3',
  flux:       'fal-ai/flux-pro/v1.1-ultra',
  nanoBanana: 'fal-ai/nano-banana-pro',
} as const
type FalModelKey = keyof typeof FAL_MODELS

const IDEOGRAM_IMAGE_SIZE: Record<AdFormat, string | { width: number; height: number }> = {
  '1x1':    'square_hd',
  '9x16':   'portrait_16_9',
  '1.91x1': { width: 1200, height: 628 },
}
const FLUX_ASPECT_RATIO: Record<AdFormat, string> = {
  '1x1': '1:1', '9x16': '9:16', '1.91x1': '16:9',
}
const NANO_BANANA_ASPECT_RATIO: Record<AdFormat, string> = {
  '1x1': '1:1', '9x16': '9:16', '1.91x1': '16:9',
}

function selectModel(intent: PublicationIntent, needsTextOverlay: boolean): FalModelKey {
  if (needsTextOverlay || intent === 'paid_campaign') return 'ideogram'
  if (intent === 'organic_brand') return 'nanoBanana'
  return 'flux'
}

// ─── Supabase admin ──────────────────────────────────────────────────────────

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─── Copy con Claude ──────────────────────────────────────────────────────────

async function generateCopy(params: {
  intent: PublicationIntent
  brief: string
  toneOfVoice: string | null
  styleKeywords: string[]
  restrictions: string | null
  clientName: string
}): Promise<CopyVariation[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `Genera exactamente 5 variaciones de copy para un anuncio de pago (paid media) con objetivo de conversión.

CLIENTE: ${params.clientName}
BRIEF: ${params.brief}

IDENTIDAD DE MARCA:
- Tono de voz: ${params.toneOfVoice ?? 'Profesional y motivador'}
- Palabras clave de estilo: ${params.styleKeywords.join(', ') || 'no especificadas'}
- Restricciones: ${params.restrictions ?? 'ninguna'}

Devuelve un array JSON con exactamente 5 objetos, cada uno con:
{
  "headline": "Titular del anuncio (max 40 chars)",
  "body": "Cuerpo del anuncio (1-2 frases, beneficio claro)",
  "cta": "Call to action (2-4 palabras)",
  "visual_description": "Descripción detallada de la imagen ideal (50-100 palabras)",
  "needs_text_overlay": true
}

Responde SOLO con el array JSON.`

  const message = await anthropic.messages.create({
    model:      'claude-opus-4-5',
    max_tokens: 4096,
    system:     'Eres un experto copywriter especializado en marketing digital. Responde EXCLUSIVAMENTE con un array JSON válido.',
    messages:   [{ role: 'user', content: prompt }],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Claude no devolvió texto')

  const raw = textBlock.text.trim()
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw

  return JSON.parse(jsonStr) as CopyVariation[]
}

// ─── Imagen con Fal.ai ────────────────────────────────────────────────────────

async function generateImage(params: {
  prompt:                     string
  modelKey:                   FalModelKey
  format:                     AdFormat
  colors:                     StoredColor[]
  referenceImageUrl?:         string | null
  institutionPaletteOverride?: InstitutionPaletteMember[] | null
}): Promise<{ url: string | null; error?: string }> {
  const { prompt, modelKey, format, colors, referenceImageUrl, institutionPaletteOverride } = params
  const endpoint = FAL_MODELS[modelKey]

  try {
    let result: FalImageResult

    if (modelKey === 'ideogram') {
      // Prioridad: paleta institucional > colores de brand_context
      const colorPaletteMembers: InstitutionPaletteMember[] = institutionPaletteOverride
        ?? colors
          .slice(0, 5)
          .map((c) => {
            const rgb = hexToRgb(c.hex)
            if (!rgb) return null
            return { rgb, color_weight: c.role === 'primary' || c.usage === 'primary' ? 0.4 : 0.15 }
          })
          .filter((m): m is NonNullable<typeof m> => m !== null)

      const colorPalette = colorPaletteMembers.length > 0 ? { members: colorPaletteMembers } : undefined

      const input = {
        prompt,
        image_size:      IDEOGRAM_IMAGE_SIZE[format],
        style:           'REALISTIC',
        rendering_speed: 'BALANCED',
        num_images:      1,
        expand_prompt:   false,
        ...(colorPalette      ? { color_palette: colorPalette }                       : {}),
        ...(referenceImageUrl ? { image_url: referenceImageUrl, image_strength: 0.25 } : {}),
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = (await (fal as any).subscribe(endpoint, { input })) as FalImageResult

    } else if (modelKey === 'flux') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = (await (fal as any).subscribe(endpoint, {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = (await (fal as any).subscribe(endpoint, {
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

    // fal.subscribe devuelve { data: <model_output>, requestId }
    const output = (result as unknown as { data: FalImageResult })?.data ?? result
    const url = output?.images?.[0]?.url ?? output?.image?.url ?? null
    return { url }
  } catch (err: unknown) {
    // Log completo para depuración
    console.error('\n  [DEBUG] Error raw:', JSON.stringify(err, null, 2))
    console.error('  [DEBUG] Error type:', typeof err)
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>
      console.error('  [DEBUG] Error keys:', Object.keys(e))
      if (e.status) console.error('  [DEBUG] status:', e.status)
      if (e.body)   console.error('  [DEBUG] body:',   JSON.stringify(e.body))
    }
    const msg = err instanceof Error
      ? err.message
      : (err as Record<string, unknown>)?.message as string
        ?? (err as Record<string, unknown>)?.error as string
        ?? JSON.stringify(err)
    return { url: null, error: msg ?? 'Unknown error' }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║      TEST: Ad Creatives Generate                     ║')
  console.log('╚══════════════════════════════════════════════════════╝\n')

  // Configurar Fal.ai
  fal.config({ credentials: process.env.FAL_API_KEY })
  const supabase = createAdminClient()

  // ── 1. Cargar contexto de marca + assets ────────────────────────────────
  console.log('→ Cargando contexto de marca de Supabase…')
  const [
    { data: cliente },
    { data: context },
    { data: assets },
  ] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('id', CLIENT_ID).single(),
    supabase.from('brand_context').select('colors, tone_of_voice, style_keywords, restrictions').eq('client_id', CLIENT_ID).single(),
    supabase.from('brand_assets').select('id, asset_type, drive_url, file_name').eq('client_id', CLIENT_ID).eq('approved', true).eq('active', true).eq('asset_type', 'product_image'),
  ])

  if (!cliente) { console.error('✗ Cliente no encontrado'); process.exit(1) }

  const colors        = (context?.colors as unknown as StoredColor[]) ?? []
  const toneOfVoice   = (context?.tone_of_voice as string | null) ?? null
  const styleKeywords = (context?.style_keywords as string[] | null) ?? []
  const restrictions  = (context?.restrictions as string | null) ?? null

  const productImageAsset = (assets ?? []).find((a) => a.asset_type === 'product_image')
  const referenceImageUrl: string | null = productImageAsset?.drive_url ?? null

  // Detectar institución en el brief
  const institutionPalette = detectInstitution(BRIEF)

  console.log(`  Cliente          : ${cliente.nombre}`)
  console.log(`  Colores          : ${colors.length} colores de marca`)
  console.log(`  Style keywords   : ${styleKeywords.join(', ') || '(no definidos)'}`)
  console.log(`  Tono             : ${toneOfVoice?.slice(0, 80) ?? '(no definido)'}…`)
  console.log(`  Imagen referencia: ${referenceImageUrl ? (productImageAsset?.file_name ?? referenceImageUrl) : '(ninguna)'}`)
  console.log(`  Institución      : ${institutionPalette ? `detectada (${institutionPalette.length} colores override)` : 'no detectada'}`)
  console.log()

  // ── 2. Generar copy ──────────────────────────────────────────────────────
  console.log('→ Generando 5 variaciones de copy con Claude…')
  const t0 = Date.now()
  const variations = await generateCopy({
    intent:        INTENT,
    brief:         BRIEF,
    toneOfVoice,
    styleKeywords,
    restrictions,
    clientName:    cliente.nombre,
  })
  console.log(`  ✓ ${variations.length} variaciones generadas (${Date.now() - t0}ms)\n`)

  // Mostrar copy generado
  variations.forEach((v, i) => {
    console.log(`  Variación ${i + 1}:`)
    console.log(`    Headline : "${v.headline}"`)
    console.log(`    Body     : "${v.body}"`)
    console.log(`    CTA      : "${v.cta}"`)
    console.log(`    Visual   : ${v.visual_description?.slice(0, 80)}…`)
    console.log()
  })

  // ── 3. Generar imágenes — 1 variación × formato 1x1 (test mínimo) ─────────
  const testVariations = variations.slice(0, 1)
  const testFormats    = FORMATS as unknown as AdFormat[]

  console.log(`→ Generando imágenes con Ideogram V3 (${testVariations.length} variación × ${testFormats.length} formato = ${testVariations.length * testFormats.length} imagen)…`)
  console.log(`  Brief: "${BRIEF}"`)
  if (institutionPalette) {
    console.log(`  Paleta override: Policía Nacional (azul #003875, blanco, dorado #D4AF37)`)
  }
  console.log('  (puede tardar 30-60 segundos)\n')

  const results: Array<{
    variationIdx: number
    format:       AdFormat
    imageUrl:     string | null
    error?:       string
    savedId?:     string
  }> = []

  for (let vi = 0; vi < testVariations.length; vi++) {
    const variation = testVariations[vi]
    const modelKey = selectModel(INTENT, variation.needs_text_overlay)
    for (const format of testFormats) {
      // Nota: los colores NO van en texto del prompt — van como color_palette RGB en Ideogram
      const imagePrompt = [
        variation.visual_description,
        styleKeywords.length > 0 ? `Estilo visual: ${styleKeywords.slice(0, 6).join(', ')}` : '',
        `Formato ${format}. Texto en imagen: "${variation.headline} | ${variation.cta}"`,
        'Photorealistic commercial photography style. Real people, real environments. No illustration, no vector art, no flat design.',
      ].filter(Boolean).join('. ')

      const t1 = Date.now()
      process.stdout.write(`  Generando v${vi + 1} / ${format} (${FAL_MODELS[modelKey]})… `)
      const { url, error } = await generateImage({
        prompt: imagePrompt, modelKey, format, colors, referenceImageUrl,
        institutionPaletteOverride: institutionPalette,
      })
      console.log(url ? `✓ (${Date.now() - t1}ms)` : `✗ ERROR: ${error}`)

      // Guardar en Supabase
      let savedId: string | undefined
      if (true) {  // siempre guardar, aunque image_url sea null
        const copyPayload: Record<string, string | undefined> = {
          headline: variation.headline,
          body:     variation.body,
          cta:      variation.cta,
        }
        const { data: saved } = await supabase
          .from('ad_creatives')
          .insert({
            client_id:          CLIENT_ID,
            brief:              BRIEF,
            publication_intent: INTENT,
            copy:               copyPayload,
            image_url:          url,
            format,
            model_used:         FAL_MODELS[modelKey],
            variation_index:    vi,
            status:             'draft',
            generation_meta:    { error: error ?? null },
          })
          .select('id')
          .single()
        savedId = saved?.id
      }

      results.push({ variationIdx: vi, format, imageUrl: url, error, savedId })
    }
  }

  // ── 4. Resumen ───────────────────────────────────────────────────────────
  const withImage    = results.filter(r => r.imageUrl).length
  const withoutImage = results.filter(r => !r.imageUrl).length

  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║  RESULTADO                                           ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log(`\n  Total generados : ${results.length}`)
  console.log(`  Con imagen      : ${withImage}`)
  console.log(`  Sin imagen      : ${withoutImage}`)
  console.log()

  console.log('  CREATIVOS GENERADOS:')
  results.forEach((r, i) => {
    console.log(`\n  [${i + 1}] Variación ${r.variationIdx + 1} — Formato ${r.format}`)
    console.log(`      ID        : ${r.savedId ?? '(no guardado)'}`)
    console.log(`      image_url : ${r.imageUrl ?? '(null — error de generación)'}`)
    if (r.error) console.log(`      error     : ${r.error}`)
  })

  console.log('\n  Copy de los primeros 2 creativos:')
  testVariations.slice(0, 2).forEach((v, i) => {
    console.log(`\n  Variación ${i + 1}:`)
    console.log(`    Headline : "${v.headline}"`)
    console.log(`    Body     : "${v.body}"`)
    console.log(`    CTA      : "${v.cta}"`)
  })

  console.log('\n✓ Test completado\n')
}

main().catch((err) => {
  console.error('\n✗ Error fatal:', err)
  process.exit(1)
})
