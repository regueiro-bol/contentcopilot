/**
 * POST /api/visual/generate
 *
 * Unified visual generation endpoint.
 * Calls runVisualAgent, saves a visual_generations record, returns variations.
 *
 * Body:
 *   postId, clientId, platform, format, style, ratio,
 *   visualDescription (optional), includeLogo, overlayText,
 *   satoriTemplate?, satoriItems?, satoriDataPoint?, satoriDataLabel?
 *
 * Returns:
 *   { modelUsed, modelReason, generatedPrompt, variations: string[], generationId }
 */

import { NextRequest, NextResponse }  from 'next/server'
import { createAdminClient }          from '@/lib/supabase/admin'
import { runVisualAgent }             from '@/lib/visual/visual-agent'
import { guardarRegistroCoste }       from '@/lib/costes'
import type { VisualAgentInput }      from '@/lib/visual/visual-agent'
import type { SatoriTemplate }        from '@/lib/visual/generators/satori-renderer'

export const dynamic     = 'force-dynamic'
export const maxDuration = 120

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredColor { name?: string; hex: string; role?: string; usage?: string }

// ─── Cost estimates per model ─────────────────────────────────────────────────

const MODEL_COST: Record<string, number> = {
  'fal-ai/flux-pro/v1.1-ultra': 0.04,
  'fal-ai/recraft-v3'         : 0.022,
  'fal-ai/flux/dev'           : 0.012,
  'satori'                    : 0.001,
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: {
    postId           : string
    clientId         : string
    platform         : string
    format           : string
    style            : string
    ratio            : string
    visualDescription: string
    includeLogo      : boolean
    overlayText      : string | null
    satoriTemplate?  : SatoriTemplate
    satoriItems?     : Array<{ label: string; value?: number; text?: string }>
    satoriDataPoint? : string
    satoriDataLabel? : string
  }

  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const {
    postId, clientId, platform, format, style, ratio,
    visualDescription, includeLogo, overlayText,
    satoriTemplate, satoriItems, satoriDataPoint, satoriDataLabel,
  } = body

  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── Load brand context ────────────────────────────────────────────────────
  let primaryColor: string | undefined
  let logoAssets: Array<{ drive_file_id?: string | null; drive_url?: string | null }> | undefined

  try {
    // Brand colors
    const { data: brandCtx } = await supabase
      .from('brand_context')
      .select('colors')
      .eq('client_id', clientId)
      .maybeSingle()

    if (brandCtx?.colors) {
      const colors = brandCtx.colors as StoredColor[]
      const primary = colors.find(c => c.role === 'primary' || c.usage === 'primary') ?? colors[0]
      if (primary?.hex) primaryColor = primary.hex
    }

    // Logo assets
    const { data: assets } = await supabase
      .from('brand_assets')
      .select('drive_file_id, drive_url')
      .eq('client_id', clientId)
      .eq('asset_type', 'logo')
      .limit(1)

    if (assets && assets.length > 0) logoAssets = assets

  } catch (e) {
    console.warn('[api/visual/generate] brand context error:', e)
  }

  // ── Run visual agent ─────────────────────────────────────────────────────
  const agentInput: VisualAgentInput = {
    clientId, postId, platform, format, style, ratio,
    visualDescription: visualDescription ?? '',
    includeLogo, overlayText,
    primaryColor, logoAssets,
    satoriTemplate, satoriItems, satoriDataPoint, satoriDataLabel,
  }

  let result: Awaited<ReturnType<typeof runVisualAgent>>

  try {
    result = await runVisualAgent(agentInput)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/visual/generate] runVisualAgent error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (result.variations.length === 0) {
    return NextResponse.json({ error: 'No se generaron imágenes' }, { status: 502 })
  }

  // ── Save visual_generations record ────────────────────────────────────────
  const { data: genRecord, error: genError } = await supabase
    .from('visual_generations')
    .insert({
      client_id               : clientId,
      source_type             : 'social_post',
      source_id               : postId ?? null,
      model_used              : result.modelUsed,
      model_reason            : result.modelReason,
      visual_description_input: visualDescription || null,
      generated_prompt        : result.generatedPrompt,
      variations_urls         : result.variations,
      selected_url            : null,
      was_approved            : null,
      was_regenerated         : false,
    })
    .select('id')
    .single()

  if (genError) {
    console.warn('[api/visual/generate] visual_generations insert error:', genError.message)
  }

  // ── Register cost ─────────────────────────────────────────────────────────
  const costPerImage = MODEL_COST[result.modelUsed] ?? 0.02
  guardarRegistroCoste({
    cliente_id    : clientId,
    tipo_operacion: 'copiloto',
    agente        : 'visual-generate',
    modelo        : result.modelUsed,
    tokens_input  : 0,
    tokens_output : 0,
    coste_usd     : costPerImage * result.variations.length,
    metadatos     : { ratio, style, platform, format, variationCount: result.variations.length },
  }).catch(console.error)

  return NextResponse.json({
    modelUsed      : result.modelUsed,
    modelReason    : result.modelReason,
    generatedPrompt: result.generatedPrompt,
    variations     : result.variations,
    generationId   : genRecord?.id ?? null,
  })
}

// ─── PATCH — save selected variation ─────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  let body: { generationId: string; selectedUrl: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const supabase = createAdminClient()
  await supabase
    .from('visual_generations')
    .update({ selected_url: body.selectedUrl, was_approved: true })
    .eq('id', body.generationId)

  return NextResponse.json({ ok: true })
}
