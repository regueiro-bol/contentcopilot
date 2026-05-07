/**
 * lib/context/client-context.ts
 *
 * Builds a structured ClientContext from Supabase in a single parallel
 * round-trip. Designed to be injected into AI generation prompts.
 *
 * Usage:
 *   const ctx = await buildClientContext(supabase, clientId)
 *   if (ctx) inject contextToPrompt(ctx) into your prompt
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ClientContext {
  client: {
    id                   : string
    name                 : string
    sector               : string | null
    descripcion          : string | null
    identidad_corporativa: string | null
    tono_voz             : string | null
    perfil_lector        : string | null
    web                  : string | null
    /** Text / JSONB field with editorial SEO competitors */
    competidores         : string | null
  }

  /** Null if no brand book has been processed yet */
  brand: {
    tone_of_voice  : string | null
    style_keywords : string[]
    restrictions   : string | null
    raw_summary    : string | null
  } | null

  /** Logo / visual assets — only populated when includeAssets = true */
  assets: Array<{
    asset_type: string
    drive_url : string
  }>

  /** Social-media competitor pages tracked in the competitors table */
  socialCompetitors: Array<{
    page_name: string
    platform : string
  }>

  /** Latest completed inspiracion session results — null if none */
  inspiracion: {
    oportunidades  : Array<{ tema: string; urgencia: string }>
    temas_trending : string[]
    ideas_contenido: Array<{ titulo: string; angulo: string; formato: string }>
  } | null

  /** Non-published content map items ordered by priority */
  pendingMapItems: Array<{
    title           : string
    main_keyword    : string
    cluster         : string | null
    funnel_stage    : string | null
    fase_recomendada: string | null
    priority        : number | null
  }>
}

export interface ClientContextOptions {
  /** Include inspiracion session data (default: true) */
  includeInspiracion?: boolean
  /** Include pending content map items (default: true) */
  includeMapItems?   : boolean
  /** Include brand_context data (default: true) */
  includeBrand?      : boolean
  /** Include brand_assets rows (default: false — usually not needed in text prompts) */
  includeAssets?     : boolean
  /** Max pending map items to include (default: 10) */
  maxMapItems?       : number
  /** Max oportunidades from inspiracion to include (default: 5) */
  maxOportunidades?  : number
}

// ─────────────────────────────────────────────────────────────
// Main function
// ─────────────────────────────────────────────────────────────

export async function buildClientContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase : SupabaseClient<any>,
  clientId : string,
  options  : ClientContextOptions = {},
): Promise<ClientContext | null> {
  const t0 = Date.now()

  const {
    includeInspiracion = true,
    includeMapItems    = true,
    includeBrand       = true,
    includeAssets      = false,
    maxMapItems        = 10,
    maxOportunidades   = 5,
  } = options

  // ── Core client (mandatory, fail fast if not found) ──────
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nombre, sector, descripcion, identidad_corporativa, tono_voz, perfil_lector, web, competidores')
    .eq('id', clientId)
    .single()

  if (!cliente) return null

  // ── Optional parallel queries ────────────────────────────
  const [brandResult, assetsResult, competitorsResult, inspiracionResult, mapItemsResult] =
    await Promise.allSettled([
      // 1. brand_context — real columns: tone_of_voice, style_keywords, restrictions, raw_summary
      includeBrand
        ? supabase
            .from('brand_context')
            .select('tone_of_voice, style_keywords, restrictions, raw_summary')
            .eq('client_id', clientId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      // 2. brand_assets — filter active = true
      includeAssets
        ? supabase
            .from('brand_assets')
            .select('asset_type, drive_url')
            .eq('client_id', clientId)
            .eq('active', true)
        : Promise.resolve({ data: [] as Array<{ asset_type: string; drive_url: string }>, error: null }),

      // 3. social competitors
      supabase
        .from('competitors')
        .select('page_name, platform')
        .eq('client_id', clientId)
        .eq('active', true)
        .order('created_at', { ascending: true }),

      // 4. latest completed inspiracion session
      includeInspiracion
        ? supabase
            .from('inspiracion_sessions')
            .select('resultado')
            .eq('client_id', clientId)
            .eq('status', 'completed')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      // 5. pending content_map_items (non-published, ordered by priority)
      includeMapItems
        ? supabase
            .from('content_map_items')
            .select('title, main_keyword, cluster, funnel_stage, fase_recomendada, priority')
            .eq('client_id', clientId)
            .neq('status', 'publicado')
            .order('priority', { ascending: true, nullsFirst: false })
            .limit(maxMapItems)
        : Promise.resolve({ data: [] as Array<{
            title: string; main_keyword: string; cluster: string | null
            funnel_stage: string | null; fase_recomendada: string | null; priority: number | null
          }>, error: null }),
    ])

  // ── Safely extract results (failures → sensible defaults) ─
  const brandData  = brandResult.status      === 'fulfilled' ? brandResult.value.data      : null
  const assetsData = assetsResult.status     === 'fulfilled' ? assetsResult.value.data      : []
  const compData   = competitorsResult.status === 'fulfilled' ? competitorsResult.value.data : []
  const inspData   = inspiracionResult.status === 'fulfilled' ? inspiracionResult.value.data : null
  const mapData    = mapItemsResult.status   === 'fulfilled' ? mapItemsResult.value.data    : []

  // ── Parse inspiracion resultado ──────────────────────────
  let inspiracion: ClientContext['inspiracion'] = null
  if (inspData?.resultado) {
    const r        = inspData.resultado as Record<string, unknown>
    const rawOps   = (r.oportunidades    as Array<Record<string, unknown>> | undefined) ?? []
    const rawTrend = (r.tendencias       as Record<string, unknown>        | undefined)?.temas_trending as string[] | undefined
    const rawIdeas = (r.ideas_contenido  as Array<Record<string, unknown>> | undefined) ?? []

    inspiracion = {
      oportunidades: rawOps.slice(0, maxOportunidades).map((op) => ({
        tema   : String(op.tema    ?? ''),
        urgencia: String(op.urgencia ?? 'media'),
      })),
      temas_trending: (rawTrend ?? []).slice(0, 8),
      ideas_contenido: rawIdeas.slice(0, 10).map((idea) => ({
        titulo : String(idea.titulo  ?? ''),
        angulo : String(idea.angulo  ?? ''),
        formato: String(idea.formato ?? ''),
      })),
    }
  }

  console.log(`[context] built in ${Date.now() - t0}ms`)

  return {
    client: {
      id                   : cliente.id,
      name                 : cliente.nombre,
      sector               : cliente.sector               ?? null,
      descripcion          : cliente.descripcion          ?? null,
      identidad_corporativa: cliente.identidad_corporativa ?? null,
      tono_voz             : cliente.tono_voz             ?? null,
      perfil_lector        : cliente.perfil_lector        ?? null,
      web                  : cliente.web                  ?? null,
      competidores         : cliente.competidores != null
        ? (typeof cliente.competidores === 'string'
            ? cliente.competidores
            : JSON.stringify(cliente.competidores))
        : null,
    },

    brand: brandData
      ? {
          tone_of_voice  : brandData.tone_of_voice   ?? null,
          style_keywords : Array.isArray(brandData.style_keywords) ? brandData.style_keywords : [],
          restrictions   : brandData.restrictions    ?? null,
          raw_summary    : brandData.raw_summary     ?? null,
        }
      : null,

    assets: (assetsData ?? []).map((a) => ({
      asset_type: (a as { asset_type: string; drive_url: string }).asset_type,
      drive_url : (a as { asset_type: string; drive_url: string }).drive_url,
    })),

    socialCompetitors: (compData ?? []).map((c) => ({
      page_name: (c as { page_name: string; platform: string }).page_name,
      platform : (c as { page_name: string; platform: string }).platform,
    })),

    inspiracion,

    pendingMapItems: (mapData ?? []).map((item) => {
      const i = item as {
        title: string; main_keyword: string; cluster: string | null
        funnel_stage: string | null; fase_recomendada: string | null; priority: number | null
      }
      return {
        title           : i.title,
        main_keyword    : i.main_keyword,
        cluster         : i.cluster          ?? null,
        funnel_stage    : i.funnel_stage     ?? null,
        fase_recomendada: i.fase_recomendada ?? null,
        priority        : i.priority         ?? null,
      }
    }),
  }
}
