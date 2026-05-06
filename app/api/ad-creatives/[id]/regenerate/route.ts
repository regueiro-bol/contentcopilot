/**
 * POST /api/ad-creatives/[id]/regenerate
 *
 * Regenera la imagen de un creative manteniendo el copy.
 * Usa el mismo pipeline que generate:
 *   1. FLUX / Nano Banana genera el fondo (sin texto)
 *   2. sharp compone el PNG final con el copy guardado
 *   3. Sube a Supabase Storage y actualiza image_url
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFromDrive } from '@/lib/google-drive'
import { composeCreative } from '@/lib/ad-creatives/compose'
import { ensureAdCreativesBucket, uploadAdCreative } from '@/lib/ad-creatives/storage'

export const maxDuration = 120

type AdFormat = '1x1' | '9x16' | '1.91x1'

const FAL_MODELS = {
  flux:       'fal-ai/flux-pro/v1.1-ultra',
  nanoBanana: 'fal-ai/nano-banana-pro',
} as const

type FalModelKey = keyof typeof FAL_MODELS

const FLUX_ASPECT_RATIO: Record<AdFormat, string> = {
  '1x1': '1:1', '9x16': '9:16', '1.91x1': '16:9',
}
const NANO_BANANA_ASPECT_RATIO: Record<AdFormat, string> = {
  '1x1': '1:1', '9x16': '9:16', '1.91x1': '16:9',
}

interface StoredColor { name: string; hex: string; role?: string; usage?: string }
interface RgbColor    { r: number; g: number; b: number }
interface InstitutionColor { rgb: RgbColor; color_weight: number }
interface FalResult   { data?: { images?: Array<{ url: string }>; image?: { url: string } } }

function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function getCompositionColors(
  colors: StoredColor[],
  institutionPalette: InstitutionColor[] | null,
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

function detectInstitution(brief: string): InstitutionColor[] | null {
  const t = brief.toLowerCase()
  if (t.includes('policía nacional') || t.includes('policia nacional') || t.includes(' cnp '))
    return [
      { rgb: { r: 0,   g: 56,  b: 117 }, color_weight: 0.50 },
      { rgb: { r: 255, g: 255, b: 255 }, color_weight: 0.30 },
      { rgb: { r: 212, g: 175, b: 55  }, color_weight: 0.20 },
    ]
  if (t.includes('guardia civil') || t.includes('benemérita'))
    return [
      { rgb: { r: 34,  g: 85,  b: 34  }, color_weight: 0.50 },
      { rgb: { r: 255, g: 255, b: 255 }, color_weight: 0.30 },
      { rgb: { r: 212, g: 175, b: 55  }, color_weight: 0.20 },
    ]
  if (t.includes('bombero'))
    return [
      { rgb: { r: 180, g: 30,  b: 30  }, color_weight: 0.55 },
      { rgb: { r: 255, g: 165, b: 0   }, color_weight: 0.45 },
    ]
  return null
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = params
  fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY })
  const supabase = createAdminClient()

  await ensureAdCreativesBucket()

  // Cargar el creative existente
  const { data: creative, error: creativeError } = await supabase
    .from('ad_creatives')
    .select('*')
    .eq('id', id)
    .single()

  if (creativeError || !creative)
    return NextResponse.json({ error: 'Creative no encontrado' }, { status: 404 })

  // Cargar brand_context y assets
  const [{ data: context }, { data: assetsData }] = await Promise.all([
    supabase
      .from('brand_context')
      .select('colors, style_keywords')
      .eq('client_id', creative.client_id)
      .single(),
    supabase
      .from('brand_assets')
      .select('id, asset_type, drive_file_id, file_name')
      .eq('client_id', creative.client_id)
      .eq('approved', true)
      .eq('active', true)
      .in('asset_type', ['logo', 'font']),
  ])

  const colors        = (context?.colors as unknown as StoredColor[]) ?? []
  const styleKeywords = (context?.style_keywords as string[] | null) ?? []
  const institutionPalette = detectInstitution((creative.brief as string) ?? '')
  const { primaryHex, secondaryHex } = getCompositionColors(colors, institutionPalette)

  // Descargar logo y fuente
  const logoAsset = (assetsData ?? []).find((a) => a.asset_type === 'logo')
  const fontAsset = (assetsData ?? []).find((a) => a.asset_type === 'font')
  const [logoBuffer, fontBuffer] = await Promise.all([
    logoAsset?.drive_file_id ? downloadFromDrive(logoAsset.drive_file_id) : Promise.resolve(null),
    fontAsset?.drive_file_id ? downloadFromDrive(fontAsset.drive_file_id) : Promise.resolve(null),
  ])

  // Recuperar prompt de fondo del generation_meta
  const meta         = (creative.generation_meta ?? {}) as Record<string, unknown>
  const originalPrompt = (meta.image_prompt as string | undefined) ?? (creative.brief as string)
  const format       = creative.format as AdFormat

  // Recuperar copy del creative
  const copy = (creative.copy ?? {}) as {
    headline?: string; body?: string; cta?: string
    tagline?: string; caption?: string
  }
  const headline = copy.headline ?? (creative.brief as string)
  const body     = copy.body ?? copy.caption
  const cta      = copy.cta

  // Seleccionar modelo
  const modelKey: FalModelKey =
    creative.model_used === FAL_MODELS.nanoBanana ? 'nanoBanana' : 'flux'

  // Añadir sufijo no-text al prompt si no lo tiene ya
  const noTextSuffix = 'Clean background, no text, no words, no typography, no letters, no captions, no overlays. Photorealistic commercial photography.'
  const cleanPrompt  = originalPrompt.includes('no text')
    ? originalPrompt
    : `${originalPrompt}. ${noTextSuffix}`

  // Generar nuevo fondo
  let bgUrl: string | null = null
  let genError: string | undefined

  try {
    let result: FalResult

    if (modelKey === 'flux') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal as any).subscribe(FAL_MODELS.flux, {
        input: {
          prompt:           cleanPrompt,
          aspect_ratio:     FLUX_ASPECT_RATIO[format],
          num_images:       1,
          output_format:    'jpeg',
          safety_tolerance: '4',
          enhance_prompt:   true,
        },
      })
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal as any).subscribe(FAL_MODELS.nanoBanana, {
        input: {
          prompt:        cleanPrompt,
          aspect_ratio:  NANO_BANANA_ASPECT_RATIO[format],
          num_images:    1,
          resolution:    '2K',
          output_format: 'jpeg',
        },
      })
    }

    const output = result?.data ?? result
    bgUrl = (output as FalResult['data'])?.images?.[0]?.url
      ?? (output as FalResult['data'])?.image?.url
      ?? null
  } catch (err) {
    genError = err instanceof Error ? err.message : String(err)
  }

  if (!bgUrl) {
    return NextResponse.json(
      { error: genError ?? 'No se pudo generar la imagen de fondo' },
      { status: 500 },
    )
  }

  // Componer PNG final
  let finalImageUrl: string | null = bgUrl

  try {
    const composedBuffer = await composeCreative({
      backgroundImageUrl: bgUrl,
      headline,
      body,
      cta,
      logoBuffer,
      primaryHex,
      secondaryHex,
      format,
      fontBuffer,
    })

    const storageUrl = await uploadAdCreative({
      buffer:         composedBuffer,
      clientId:       creative.client_id as string,
      campaignName:   creative.campaign_name as string | null,
      format,
      variationIndex: (creative.variation_index as number) ?? 0,
    })

    if (storageUrl) finalImageUrl = storageUrl
  } catch (err) {
    console.error('[regenerate] Error componiendo:', err instanceof Error ? err.message : err)
  }

  // Actualizar en Supabase
  const { data: updated, error: updateError } = await supabase
    .from('ad_creatives')
    .update({
      image_url:  finalImageUrl,
      status:     'draft',
      updated_at: new Date().toISOString(),
      generation_meta: {
        ...meta,
        regenerated_at:       new Date().toISOString(),
        background_image_url: bgUrl,
        image_prompt:         cleanPrompt,
      },
    })
    .eq('id', id)
    .select()
    .single()

  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ creative: updated })
}
