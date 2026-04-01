/**
 * POST /api/ad-creatives/[id]/regenerate
 *
 * Regenera la imagen de un creative existente manteniendo el mismo copy.
 * Útil cuando la imagen generada no es satisfactoria.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

type AdFormat = '1x1' | '9x16' | '1.91x1'

const FAL_MODELS = {
  ideogram:   'fal-ai/ideogram/v3',
  flux:       'fal-ai/flux-pro/v1.1-ultra',
  nanoBanana: 'fal-ai/nano-banana-pro',
} as const

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

interface StoredColor { name: string; hex: string; role?: string; usage?: string }
interface FalResult   { data?: { images?: Array<{ url: string }>; image?: { url: string } } }

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = params
  fal.config({ credentials: process.env.FAL_API_KEY })
  const supabase = createAdminClient()

  // Cargar el creative existente
  const { data: creative, error: creativeError } = await supabase
    .from('ad_creatives')
    .select('*')
    .eq('id', id)
    .single()

  if (creativeError || !creative) {
    return NextResponse.json({ error: 'Creative no encontrado' }, { status: 404 })
  }

  // Cargar brand_context del cliente
  const { data: context } = await supabase
    .from('brand_context')
    .select('colors, style_keywords')
    .eq('client_id', creative.client_id)
    .single()

  const colors        = (context?.colors as unknown as StoredColor[]) ?? []
  const styleKeywords = (context?.style_keywords as string[] | null) ?? []

  // Recuperar el prompt original de generation_meta
  const meta = creative.generation_meta as Record<string, unknown>
  const originalPrompt = (meta?.image_prompt as string) ?? creative.brief

  const format    = creative.format as AdFormat
  const modelUsed = creative.model_used as string

  // Determinar modelKey desde model_used
  const modelKey =
    modelUsed === FAL_MODELS.ideogram   ? 'ideogram'   :
    modelUsed === FAL_MODELS.nanoBanana ? 'nanoBanana' : 'flux'

  // Generar nueva imagen
  let newUrl: string | null = null
  let genError: string | undefined

  try {
    let result: FalResult

    if (modelKey === 'ideogram') {
      const members = colors
        .slice(0, 5)
        .map((c) => { const rgb = hexToRgb(c.hex); return rgb ? { rgb, color_weight: 0.2 } : null })
        .filter((m): m is NonNullable<typeof m> => m !== null)
      const colorPalette = members.length > 0 ? { members } : undefined

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal as any).subscribe(FAL_MODELS.ideogram, {
        input: {
          prompt:          originalPrompt,
          image_size:      IDEOGRAM_IMAGE_SIZE[format],
          style:           'DESIGN',
          rendering_speed: 'BALANCED',
          num_images:      1,
          expand_prompt:   false,
          ...(colorPalette ? { color_palette: colorPalette } : {}),
        },
      })
    } else if (modelKey === 'flux') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (fal as any).subscribe(FAL_MODELS.flux, {
        input: {
          prompt:           originalPrompt,
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
          prompt:        originalPrompt,
          aspect_ratio:  NANO_BANANA_ASPECT_RATIO[format],
          num_images:    1,
          resolution:    '2K',
          output_format: 'jpeg',
        },
      })
    }

    const output = result?.data ?? result
    newUrl = (output as FalResult['data'])?.images?.[0]?.url
      ?? (output as FalResult['data'])?.image?.url
      ?? null
  } catch (err) {
    genError = err instanceof Error ? err.message : String(err)
  }

  if (!newUrl) {
    return NextResponse.json(
      { error: genError ?? 'No se pudo generar la imagen' },
      { status: 500 },
    )
  }

  // Actualizar en Supabase
  const { data: updated, error: updateError } = await supabase
    .from('ad_creatives')
    .update({
      image_url:  newUrl,
      status:     'draft',
      updated_at: new Date().toISOString(),
      generation_meta: { ...meta, regenerated_at: new Date().toISOString() },
    })
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ creative: updated })
}
