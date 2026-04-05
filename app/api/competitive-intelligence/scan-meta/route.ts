/**
 * POST /api/competitive-intelligence/scan-meta
 *
 * Escanea competidores en Meta Ad Library usando Apify actor
 * "curious_coder/facebook-ads-library-scraper".
 *
 * El actor recibe URLs de Facebook Ad Library como input.
 * Requiere APIFY_API_TOKEN en las variables de entorno.
 *
 * Body: { client_id: string, competitor_ids?: string[] }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { ApifyClient } from 'apify-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

const ACTOR_ID = 'curious_coder/facebook-ads-library-scraper'
const MAX_ADS_PER_COMPETITOR = 20

// ─────────────────────────────────────────────────────────────
// Tipos — Resultado del actor (subconjunto relevante)
// ─────────────────────────────────────────────────────────────

// Campos reales del actor (snake_case, verificados contra output real)
interface ApifyAdResult {
  // Error items (URL sin resultados)
  error?:              string
  errorCode?:          string
  url?:                string
  // Identificadores
  ad_archive_id?:      string
  ad_id?:              string
  collation_count?:    number | null
  collation_id?:       number | null
  page_id?:            string
  page_name?:          string
  // Estado y fechas
  is_active?:          boolean
  start_date?:         number       // Unix timestamp (seconds)
  end_date?:           number | null
  start_date_formatted?: string     // "2026-03-12 07:00:00"
  end_date_formatted?:   string | null
  // Plataformas
  publisher_platform?: string[]     // ["FACEBOOK","INSTAGRAM","MESSENGER",...]
  // Snapshot (contenido del anuncio)
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
  // Métricas
  currency?:             string | null
  spend?:                { lower_bound?: number; upper_bound?: number } | null
  reach_estimate?:       { lower_bound?: number; upper_bound?: number } | null
  // Meta del scraper
  ad_library_url?:       string     // "https://www.facebook.com/ads/library/?id=..."
  total?:                number
  position?:             number
  ads_count?:            number
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Construye la URL de Meta Ad Library para buscar ads activos de un competidor en España */
function buildAdLibraryUrl(pageName: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ES&q=${encodeURIComponent(pageName)}&media_type=all`
}

/** Extrae texto legible del snapshot del anuncio */
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

/** Extrae la URL de la imagen o video preview */
function extractCreativeUrl(ad: ApifyAdResult): string | null {
  // Imágenes del snapshot
  const img = ad.snapshot?.images?.[0]
  if (img?.original_image_url) return img.original_image_url
  if (img?.resized_image_url) return img.resized_image_url

  // Extra images
  const extra = ad.snapshot?.extra_images?.[0]
  if (extra?.url) return extra.url

  // Video preview image
  const vid = ad.snapshot?.videos?.[0]
  if (vid?.video_preview_image_url) return vid.video_preview_image_url

  // Page profile picture como último recurso
  if (ad.snapshot?.page_profile_picture_url) return ad.snapshot.page_profile_picture_url

  return null
}

/** Extrae URL directa al anuncio en Meta Ad Library */
function extractSnapshotUrl(ad: ApifyAdResult): string | null {
  // El actor devuelve ad_library_url directamente
  if (ad.ad_library_url) return ad.ad_library_url
  if (ad.ad_archive_id) return `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`
  return null
}

/** Genera un ID externo estable */
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
  const client   = new ApifyClient({ token: apifyToken })

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

  // Construir URLs de Ad Library para todos los competidores
  const urls = competitors.map((c) => buildAdLibraryUrl(c.page_name))

  console.log(`[ci-scan-meta] Lanzando Apify actor para ${competitors.length} competidores`)
  console.log(`[ci-scan-meta] URLs:`, urls)

  // Ejecutar el actor de Apify
  let allItems: ApifyAdResult[] = []
  try {
    const run = await client.actor(ACTOR_ID).call(
      {
        urls: urls.map((u) => ({ url: u })),
        maxAds: MAX_ADS_PER_COMPETITOR * competitors.length,
      },
      {
        timeout: 90,
        memory: 512,
      },
    )

    console.log(`[ci-scan-meta] Actor run completado: ${run.id} | status: ${run.status}`)

    // Leer resultados del dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    allItems = items as ApifyAdResult[]

    console.log(`[ci-scan-meta] Total items del dataset: ${allItems.length}`)

    // Debug: log primeros 3 items
    if (allItems.length > 0) {
      console.log(`[ci-scan-meta] Ejemplo item keys:`, Object.keys(allItems[0]))
    }
  } catch (err) {
    console.error('[ci-scan-meta] Apify error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: `Error ejecutando Apify: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  // Mapear resultados a competidores por pageName
  const compByName = new Map(
    competitors.map((c) => [c.page_name.toLowerCase(), c]),
  )

  const results: Array<{
    competitor_id: string
    page_name:     string
    ads_found:     number
    ads_new:       number
    error?:        string
  }> = []

  // Filtrar items de error y agrupar ads por competidor
  const validAds = allItems.filter((a) => !a.error && a.ad_archive_id)
  console.log(`[ci-scan-meta] Items válidos (sin errores): ${validAds.length} de ${allItems.length}`)

  const adsByComp = new Map<string, ApifyAdResult[]>()
  for (const ad of validAds) {
    // El page_name puede estar top-level o dentro de snapshot
    const adPageName = (ad.page_name ?? ad.snapshot?.page_name ?? '').toLowerCase()
    let matched = compByName.get(adPageName)

    // Fallback: buscar coincidencia parcial
    if (!matched) {
      compByName.forEach((comp, name) => {
        if (!matched && (adPageName.includes(name) || name.includes(adPageName))) {
          matched = comp
        }
      })
    }

    // Último recurso: asignar al primer competidor si solo hay uno
    if (!matched && competitors.length === 1) {
      matched = competitors[0]
    }

    if (matched) {
      const key = matched.id
      if (!adsByComp.has(key)) adsByComp.set(key, [])
      adsByComp.get(key)!.push(ad)
    }
  }

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
