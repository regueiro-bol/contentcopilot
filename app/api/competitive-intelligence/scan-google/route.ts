/**
 * POST /api/competitive-intelligence/scan-google
 *
 * Escanea los competidores activos de un cliente en Google Ads Transparency Center
 * usando SerpApi (https://serpapi.com/google-ads-transparency-center-api).
 * Requiere SERPAPI_KEY en las variables de entorno.
 *
 * Body: { client_id: string, competitor_ids?: string[] }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

const SERPAPI_BASE = 'https://serpapi.com/search.json'

interface SerpApiAd {
  advertiser_id?:   string
  advertiser_name?: string
  format?:          string
  first_shown?:     number   // Unix timestamp
  last_shown?:      number
  image_url?:       string
  video_url?:       string
  description?:     string
  headline?:        string
  link?:            string   // adstransparency.google.com URL
  impressions_min?: number
  impressions_max?: number
}

interface SerpApiResponse {
  error?:       string
  ad_creatives?: SerpApiAd[]
  search_information?: { total_results?: number }
}

async function fetchGoogleAds(competitorName: string): Promise<{
  ads: SerpApiAd[]
  error: string | null
}> {
  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) {
    return {
      ads: [],
      error: 'SERPAPI_KEY no configurada. Consigue una clave en https://serpapi.com (100 búsquedas/mes gratis)',
    }
  }

  const params = new URLSearchParams({
    engine:   'google_ads_transparency_center',
    api_key:  apiKey,
    text:     competitorName,
    region:   '2724',  // España — código numérico de SerpApi (no 'ES')
    num:      '20',
  })

  try {
    const res  = await fetch(`${SERPAPI_BASE}?${params.toString()}`)
    const json = await res.json() as SerpApiResponse

    if (json.error) {
      return { ads: [], error: `SerpApi error: ${json.error}` }
    }

    return { ads: json.ad_creatives ?? [], error: null }
  } catch (err) {
    return { ads: [], error: err instanceof Error ? err.message : String(err) }
  }
}

function extractCopyText(ad: SerpApiAd): string | null {
  const parts = [ad.headline, ad.description].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : null
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { client_id?: string; competitor_ids?: string[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { client_id, competitor_ids } = body
  if (!client_id) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

  const supabase = createAdminClient()

  let query = supabase
    .from('competitors')
    .select('*')
    .eq('client_id', client_id)
    .eq('active', true)
    .eq('platform', 'google')

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
      message: 'No hay competidores con platform=google configurados para este cliente',
    })
  }

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
    const { ads, error: fetchError } = await fetchGoogleAds(comp.page_name)

    if (fetchError) {
      console.error(`[ci-scan-google] Error "${comp.page_name}":`, fetchError)
      results.push({
        competitor_id: comp.id,
        page_name:     comp.page_name,
        ads_found:     0,
        ads_new:       0,
        error:         fetchError,
      })
      continue
    }

    let newForComp = 0

    for (const ad of ads) {
      // Crear un ID externo estable a partir del link o advertiser_id + first_shown
      const adIdExternal = ad.link
        ? ad.link.replace('https://adstransparency.google.com/advertiser/', '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 120)
        : `${ad.advertiser_id ?? comp.page_name}_${ad.first_shown ?? Date.now()}`

      const copyText = extractCopyText(ad)

      const { error: upsertError, data: upserted } = await supabase
        .from('competitor_ads')
        .upsert(
          {
            competitor_id:   comp.id,
            client_id,
            platform:        'google',
            ad_id_external:  adIdExternal,
            creative_url:    ad.image_url ?? ad.video_url ?? ad.link ?? null,
            copy_text:       copyText,
            cta_type:        ad.format ?? null,
            started_running: ad.first_shown
              ? new Date(ad.first_shown * 1000).toISOString()
              : null,
            last_seen_at:    new Date().toISOString(),
            is_active:       true,
            raw_data:        ad as Record<string, unknown>,
          },
          { onConflict: 'platform,ad_id_external', ignoreDuplicates: false },
        )
        .select('id, first_seen_at')
        .single()

      if (upsertError) {
        console.warn(`[ci-scan-google] Upsert error ad ${adIdExternal}:`, upsertError.message)
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
      ads_found:     ads.length,
      ads_new:       newForComp,
    })

    totalFound += ads.length
    totalNew   += newForComp
  }

  console.log(`[ci-scan-google] Escaneados ${competitors.length} competidores | ${totalFound} ads | ${totalNew} nuevos`)

  return NextResponse.json({
    competitors_scanned: competitors.length,
    ads_found:           totalFound,
    ads_new:             totalNew,
    details:             results,
  })
}
