/**
 * POST /api/competitive-intelligence/scan
 *
 * Escanea los competidores activos de un cliente en Meta Ad Library.
 * Por cada competidor llama a la API de Meta, guarda los ads encontrados
 * en competitor_ads y actualiza last_checked_at.
 *
 * Body: { client_id: string, competitor_ids?: string[] }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

const META_API_BASE = 'https://graph.facebook.com/v19.0'

const AD_FIELDS = [
  'id',
  'ad_creative_bodies',
  'ad_creative_link_captions',
  'ad_creative_link_descriptions',
  'ad_creative_link_titles',
  'ad_snapshot_url',
  'ad_delivery_start_time',
  'page_name',
  'page_id',
  'cta_type',
].join(',')

interface MetaAd {
  id:                          string
  ad_creative_bodies?:         string[]
  ad_creative_link_captions?:  string[]
  ad_creative_link_descriptions?: string[]
  ad_creative_link_titles?:    string[]
  ad_snapshot_url?:            string
  ad_delivery_start_time?:     string
  page_name?:                  string
  page_id?:                    string
  cta_type?:                   string
}

interface MetaResponse {
  data:    MetaAd[]
  error?:  { message: string; code: number }
  paging?: { cursors?: object; next?: string }
}

async function fetchMetaAds(competitor: {
  page_name: string
  page_id:   string | null
}): Promise<{ ads: MetaAd[]; error: string | null }> {
  const token = process.env.META_AD_LIBRARY_TOKEN
  if (!token) return { ads: [], error: 'META_AD_LIBRARY_TOKEN no configurado' }

  const params = new URLSearchParams({
    access_token:       token,
    ad_active_status:   'ACTIVE',
    ad_reached_countries: "['ES']",
    fields:             AD_FIELDS,
    limit:              '20',
  })

  // Usar page_id si está disponible (más preciso), sino search_terms
  if (competitor.page_id) {
    params.set('search_page_ids', competitor.page_id)
  } else {
    params.set('search_terms', competitor.page_name)
  }

  try {
    const res = await fetch(`${META_API_BASE}/ads_archive?${params.toString()}`)
    const json = await res.json() as MetaResponse

    if (json.error) {
      return { ads: [], error: `Meta API error ${json.error.code}: ${json.error.message}` }
    }

    return { ads: json.data ?? [], error: null }
  } catch (err) {
    return { ads: [], error: err instanceof Error ? err.message : String(err) }
  }
}

function extractCopyText(ad: MetaAd): string | null {
  const bodies = ad.ad_creative_bodies ?? []
  const titles = ad.ad_creative_link_titles ?? []
  const descs  = ad.ad_creative_link_descriptions ?? []

  const parts = [
    bodies[0],
    titles[0],
    descs[0],
  ].filter(Boolean)

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

  // Cargar competidores activos
  let query = supabase
    .from('competitors')
    .select('*')
    .eq('client_id', client_id)
    .eq('active', true)

  if (competitor_ids && competitor_ids.length > 0) {
    query = query.in('id', competitor_ids)
  }

  const { data: competitors, error: compError } = await query

  if (compError) return NextResponse.json({ error: compError.message }, { status: 500 })
  if (!competitors || competitors.length === 0) {
    return NextResponse.json({ competitors_scanned: 0, ads_found: 0, ads_new: 0, details: [] })
  }

  const results: Array<{
    competitor_id:   string
    page_name:       string
    ads_found:       number
    ads_new:         number
    error?:          string
  }> = []

  let totalFound = 0
  let totalNew   = 0

  // Escanear cada competidor (secuencial para no saturar la API de Meta)
  for (const comp of competitors) {
    const { ads, error: fetchError } = await fetchMetaAds({
      page_name: comp.page_name,
      page_id:   comp.page_id,
    })

    if (fetchError) {
      console.error(`[ci-scan] Error competidor "${comp.page_name}":`, fetchError)
      results.push({ competitor_id: comp.id, page_name: comp.page_name, ads_found: 0, ads_new: 0, error: fetchError })
      continue
    }

    let newForComp = 0

    for (const ad of ads) {
      const copyText = extractCopyText(ad)

      const { error: upsertError, data: upserted } = await supabase
        .from('competitor_ads')
        .upsert(
          {
            competitor_id:   comp.id,
            client_id,
            platform:        'meta',
            ad_id_external:  ad.id,
            creative_url:    ad.ad_snapshot_url ?? null,
            copy_text:       copyText,
            cta_type:        ad.cta_type ?? null,
            started_running: ad.ad_delivery_start_time
              ? new Date(ad.ad_delivery_start_time).toISOString()
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
        console.warn(`[ci-scan] Upsert error ad ${ad.id}:`, upsertError.message)
        continue
      }

      // Es nuevo si first_seen_at fue recién establecido (dentro de los últimos 60s)
      if (upserted) {
        const firstSeen = new Date(upserted.first_seen_at).getTime()
        if (Date.now() - firstSeen < 60_000) newForComp++
      }
    }

    // Actualizar last_checked_at del competidor
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

  console.log(`[ci-scan] Escaneados ${competitors.length} competidores | ${totalFound} ads | ${totalNew} nuevos`)

  return NextResponse.json({
    competitors_scanned: competitors.length,
    ads_found:           totalFound,
    ads_new:             totalNew,
    details:             results,
  })
}
