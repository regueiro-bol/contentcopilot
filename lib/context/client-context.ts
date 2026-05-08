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

  /** Latest GSC snapshot analytics — null if no GSC connected or no data */
  analytics: {
    topKeywords: Array<{
      keyword : string
      clicks  : number
      position: number
      type    : string
    }>
    strongClusters           : string[]
    weakClusters             : string[]
    searchTypeBreakdown: {
      informacional: number
      transaccional: number
      marca         : number
      comparacional : number
    }
    totalClicks    : number
    avgPosition    : number
  } | null
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
  /** Include GSC analytics from latest snapshot (default: false) */
  includeAnalytics?  : boolean
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
    includeAnalytics   = false,
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
  const [brandResult, assetsResult, competitorsResult, inspiracionResult, mapItemsResult, analyticsResult] =
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

      // 6. Latest GSC snapshot for analytics context
      includeAnalytics
        ? supabase
            .from('gsc_snapshots')
            .select('total_clicks, avg_position, top_queries, cluster_breakdown, search_type_breakdown')
            .eq('client_id', clientId)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

  // ── Safely extract results (failures → sensible defaults) ─
  const brandData     = brandResult.status       === 'fulfilled' ? brandResult.value.data      : null
  const assetsData    = assetsResult.status      === 'fulfilled' ? assetsResult.value.data      : []
  const compData      = competitorsResult.status === 'fulfilled' ? competitorsResult.value.data : []
  const inspData      = inspiracionResult.status === 'fulfilled' ? inspiracionResult.value.data : null
  const mapData       = mapItemsResult.status    === 'fulfilled' ? mapItemsResult.value.data    : []
  const analyticsData = analyticsResult.status   === 'fulfilled' ? analyticsResult.value.data   : null

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

  // ── Parse analytics ─────────────────────────────────────
  let analytics: ClientContext['analytics'] = null
  if (analyticsData) {
    const snap = analyticsData as Record<string, unknown>
    const rawQueries        = (snap.top_queries          as Array<Record<string, unknown>> | undefined) ?? []
    const rawClusters       = (snap.cluster_breakdown    as Array<Record<string, unknown>> | undefined) ?? []
    const rawBreakdown      = (snap.search_type_breakdown as Record<string, number>        | undefined) ?? {}

    analytics = {
      topKeywords: rawQueries.slice(0, 10).map((q) => ({
        keyword : String(q.query    ?? ''),
        clicks  : Number(q.clicks   ?? 0),
        position: Number(q.position ?? 0),
        type    : String(q.type     ?? 'informacional'),
      })),
      strongClusters: rawClusters
        .filter((c) => c.status === 'fuerte')
        .map((c) => String(c.cluster ?? '')),
      weakClusters: rawClusters
        .filter((c) => c.status === 'debil')
        .map((c) => String(c.cluster ?? '')),
      searchTypeBreakdown: {
        informacional: rawBreakdown.informacional ?? 0,
        transaccional: rawBreakdown.transaccional ?? 0,
        marca         : rawBreakdown.marca         ?? 0,
        comparacional : rawBreakdown.comparacional ?? 0,
      },
      totalClicks : Number(snap.total_clicks   ?? 0),
      avgPosition : Number(snap.avg_position   ?? 0),
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

    analytics,

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
