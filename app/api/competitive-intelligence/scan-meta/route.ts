/**
 * POST /api/competitive-intelligence/scan-meta
 *
 * Escanea competidores en Meta Ad Library usando la API HTTP de Apify
 * con el actor "curious_coder/facebook-ads-library-scraper".
 *
 * Usa fetch nativo (sin SDK) para evitar problemas con proxy-agent en Vercel.
 * Requiere APIFY_API_TOKEN en las variables de entorno.
 *
 * Body: { client_id: string, competitor_ids?: string[] }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

const APIFY_ACTOR = 'curious_coder~facebook-ads-library-scraper'
const APIFY_BASE  = 'https://api.apify.com/v2'
const MAX_ADS_PER_COMPETITOR = 20

// ─────────────────────────────────────────────────────────────
// Tipos — Resultado del actor (snake_case, verificado)
// ─────────────────────────────────────────────────────────────

interface ApifyAdResult {
  error?:              string
  errorCode?:          string
  url?:                string
  ad_archive_id?:      string
  ad_id?:              string
  collation_count?:    number | null
  collation_id?:       number | null
  page_id?:            string
  page_name?:          string
  is_active?:          boolean
  start_date?:         number
  end_date?:           number | null
  start_date_formatted?: string
  publisher_platform?: string[]
  snapshot?: {
    body?:               { text?: string; markup?: { __html?: string } }
    title?:              string
    caption?:            string
    cta_text?:           string
    cta_type?:           string
    link_url?:           string
    link_description?:   string
    display_format?:     string
    page_name?:          string
    page_like_count?:    number
    page_profile_uri?:   string
    page_profile_picture_url?: string
    images?:             Array<{ original_image_url?: string; resized_image_url?: string }>
    videos?:             Array<{ video_hd_url?: string; video_sd_url?: string; video_preview_image_url?: string }>
    cards?:              Array<{ title?: string; body?: string; link_url?: string }>
    extra_images?:       Array<{ url?: string }>
    extra_videos?:       Array<{ url?: string }>
  }
  currency?:             string | null
  spend?:                { lower_bound?: number; upper_bound?: number } | null
  reach_estimate?:       { lower_bound?: number; upper_bound?: number } | null
  ad_library_url?:       string
  total?:                number
  position?:             number
  ads_count?:            number
}

// ─────────────────────────────────────────────────────────────
// Apify HTTP helpers
// ─────────────────────────────────────────────────────────────

/**
 * Ejecuta el actor y espera a que termine (start → poll → read dataset).
 * 1. POST /v2/acts/{actorId}/runs  → inicia el run
 * 2. GET  /v2/actor-runs/{runId}   → poll hasta SUCCEEDED/FAILED
 * 3. GET  /v2/datasets/{id}/items  → lee los resultados
 */
async function runActorAndCollect(
  token: string,
  input: Record<string, unknown>,
): Promise<{ items: ApifyAdResult[]; error: string | null }> {
  // 1. Iniciar run
  const startRes = await fetch(
    `${APIFY_BASE}/acts/${APIFY_ACTOR}/runs?token=${token}&timeout=90&memory=512`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )

  if (!startRes.ok) {
    const text = await startRes.text().catch(() => '')
    return { items: [], error: `Apify start HTTP ${startRes.status}: ${text.substring(0, 200)}` }
  }

  const startData = (await startRes.json()) as { data?: { id?: string; status?: string; defaultDatasetId?: string } }
  const runId    = startData.data?.id
  const datasetId = startData.data?.defaultDatasetId

  if (!runId || !datasetId) {
    return { items: [], error: 'Apify no devolvió run ID o dataset ID' }
  }

  console.log(`[ci-scan-meta] Run iniciado: ${runId} | dataset: ${datasetId}`)

  // 2. Poll hasta que termine (max ~100s)
  const maxPolls = 35
  const pollInterval = 3000
  let status = startData.data?.status ?? 'RUNNING'

  for (let i = 0; i < maxPolls && (status === 'RUNNING' || status === 'READY'); i++) {
    await new Promise((r) => setTimeout(r, pollInterval))
    const pollRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`)
    const pollData = (await pollRes.json()) as { data?: { status?: string } }
    status = pollData.data?.status ?? 'UNKNOWN'
  }

  if (status !== 'SUCCEEDED') {
    return { items: [], error: `Apify run terminó con status: ${status}` }
  }

  // 3. Leer items del dataset
  const dsRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${token}`)
  if (!dsRes.ok) {
    return { items: [], error: `Apify dataset HTTP ${dsRes.status}` }
  }

  const items = (await dsRes.json()) as ApifyAdResult[]
  return { items: Array.isArray(items) ? items : [], error: null }
}

// ─────────────────────────────────────────────────────────────
// Helpers de mapeo
// ─────────────────────────────────────────────────────────────

function buildAdLibraryUrl(pageName: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ES&q=${encodeURIComponent(pageName)}&media_type=all`
}

function extractCopyText(ad: ApifyAdResult): string | null {
  const parts: string[] = []
  if (ad.snapshot?.title) parts.push(ad.snapshot.title)
  const bodyText = ad.snapshot?.body?.text
  const bodyHtml = ad.snapshot?.body?.markup?.__html
  if (bodyText) {
    parts.push(bodyText)
  } else if (bodyHtml) {
    parts.push(bodyHtml.replace(/<[^>]+>/g, '').trim())
  }
  if (ad.snapshot?.caption) parts.push(ad.snapshot.caption)
  return parts.length > 0 ? parts.join(' — ') : null
}

function extractCreativeUrl(ad: ApifyAdResult): string | null {
  const img = ad.snapshot?.images?.[0]
  if (img?.original_image_url) return img.original_image_url
  if (img?.resized_image_url) return img.resized_image_url
  const extra = ad.snapshot?.extra_images?.[0]
  if (extra?.url) return extra.url
  const vid = ad.snapshot?.videos?.[0]
  if (vid?.video_preview_image_url) return vid.video_preview_image_url
  if (ad.snapshot?.page_profile_picture_url) return ad.snapshot.page_profile_picture_url
  return null
}

function extractSnapshotUrl(ad: ApifyAdResult): string | null {
  if (ad.ad_library_url) return ad.ad_library_url
  if (ad.ad_archive_id) return `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`
  return null
}

function buildAdIdExternal(ad: ApifyAdResult, competitorName: string): string {
  if (ad.ad_archive_id) return String(ad.ad_archive_id)
  if (ad.collation_id) return `meta_${ad.collation_id}`
  return `meta_${competitorName}_${ad.start_date ?? Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 120)
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const apifyToken = process.env.APIFY_API_TOKEN
  if (!apifyToken) {
    return NextResponse.json(
      { error: 'APIFY_API_TOKEN no configurado. Consigue un token en https://apify.com' },
      { status: 500 },
    )
  }

  let body: { client_id?: string; competitor_ids?: string[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { client_id, competitor_ids } = body
  if (!client_id) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

  const supabase = createAdminClient()

  // Cargar competidores Meta activos
  let query = supabase
    .from('competitors')
    .select('*')
    .eq('client_id', client_id)
    .eq('active', true)
    .eq('platform', 'meta')

  if (competitor_ids && competitor_ids.length > 0) {
    query = query.in('id', competitor_ids)
  }

  const { data: competitors, error: compError } = await query

  if (compError) return NextResponse.json({ error: compError.message }, { status: 500 })
  if (!competitors || competitors.length === 0) {
    return NextResponse.json({
      competitors_scanned: 0,
      ads_found: 0,
      ads_new: 0,
      details: [],
      message: 'No hay competidores con platform=meta configurados para este cliente',
    })
  }

  // Construir URLs de Ad Library
  const urls = competitors.map((c) => buildAdLibraryUrl(c.page_name))
  console.log(`[ci-scan-meta] Lanzando Apify para ${competitors.length} competidores:`, urls)

  // Ejecutar actor vía HTTP (start → poll → read)
  const { items: allItems, error: apifyError } = await runActorAndCollect(apifyToken, {
    urls: urls.map((u) => ({ url: u })),
    maxAds: MAX_ADS_PER_COMPETITOR * competitors.length,
  })

  if (apifyError) {
    console.error('[ci-scan-meta] Apify error:', apifyError)
    return NextResponse.json({ error: apifyError }, { status: 502 })
  }

  console.log(`[ci-scan-meta] Total items: ${allItems.length}`)

  // Filtrar errores, ads sin ID, y anuncios dinámicos de catálogo (templates sin resolver)
  const validAds = allItems.filter((a) => {
    if (a.error || !a.ad_archive_id) return false
    // Descartar anuncios dinámicos de catálogo con variables sin resolver
    const text = [a.snapshot?.title, a.snapshot?.body?.text, a.snapshot?.caption].join(' ')
    if (/\{\{product\./i.test(text)) return false
    return true
  })
  console.log(`[ci-scan-meta] Items válidos: ${validAds.length} de ${allItems.length} (filtrados dinámicos de catálogo)`)

  const compByName = new Map(
    competitors.map((c) => [c.page_name.toLowerCase(), c]),
  )

  const adsByComp = new Map<string, ApifyAdResult[]>()
  for (const ad of validAds) {
    const adPageName = (ad.page_name ?? ad.snapshot?.page_name ?? '').toLowerCase()
    let matched = compByName.get(adPageName)

    if (!matched) {
      compByName.forEach((comp, name) => {
        if (!matched && (adPageName.includes(name) || name.includes(adPageName))) {
          matched = comp
        }
      })
    }

    if (!matched && competitors.length === 1) {
      matched = competitors[0]
    }

    if (matched) {
      const key = matched.id
      if (!adsByComp.has(key)) adsByComp.set(key, [])
      adsByComp.get(key)!.push(ad)
    }
  }

  // Upsert ads en Supabase
  const results: Array<{
    competitor_id: string
    page_name:     string
    ads_found:     number
    ads_new:       number
    error?:        string
  }> = []

  let totalFound = 0
  let totalNew   = 0

  for (const comp of competitors) {
    const compAds = adsByComp.get(comp.id) ?? []
    let newForComp = 0

    for (const ad of compAds) {
      const adIdExternal = buildAdIdExternal(ad, comp.page_name)
      const copyText     = extractCopyText(ad)
      const creativeUrl  = extractCreativeUrl(ad)
      const snapshotUrl  = extractSnapshotUrl(ad)

      const { error: upsertError, data: upserted } = await supabase
        .from('competitor_ads')
        .upsert(
          {
            competitor_id:   comp.id,
            client_id,
            platform:        'meta',
            ad_id_external:  adIdExternal,
            creative_url:    creativeUrl,
            ad_snapshot_url: snapshotUrl,
            copy_text:       copyText,
            cta_type:        ad.snapshot?.cta_text ?? ad.snapshot?.cta_type ?? null,
            started_running: ad.start_date
              ? new Date(ad.start_date * 1000).toISOString()
              : null,
            last_seen_at:    new Date().toISOString(),
            is_active:       ad.is_active ?? true,
            raw_data:        ad as unknown as Record<string, unknown>,
          },
          { onConflict: 'platform,ad_id_external', ignoreDuplicates: false },
        )
        .select('id, first_seen_at')
        .single()

      if (upsertError) {
        console.warn(`[ci-scan-meta] Upsert error ad ${adIdExternal}:`, upsertError.message)
        continue
      }

      if (upserted) {
        const firstSeen = new Date(upserted.first_seen_at).getTime()
        if (Date.now() - firstSeen < 60_000) newForComp++
      }
    }

    await supabase
      .from('competitors')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', comp.id)

    results.push({
      competitor_id: comp.id,
      page_name:     comp.page_name,
      ads_found:     compAds.length,
      ads_new:       newForComp,
    })

    totalFound += compAds.length
    totalNew   += newForComp
  }

  console.log(`[ci-scan-meta] Completado: ${competitors.length} competidores | ${totalFound} ads | ${totalNew} nuevos`)

  return NextResponse.json({
    competitors_scanned: competitors.length,
    ads_found:           totalFound,
    ads_new:             totalNew,
    details:             results,
  })
}
