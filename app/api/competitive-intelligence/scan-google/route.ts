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
  advertiser_id?:       string
  advertiser?:          string    // nombre del anunciante
  ad_creative_id?:      string
  format?:              string    // 'text', 'image', 'video'
  first_shown?:         number    // Unix timestamp
  last_shown?:          number
  // Campos de media — SerpApi usa 'image' (no 'image_url')
  image?:               string    // URL a la imagen del creativo
  width?:               number
  height?:              number
  link?:                string    // URL del video (formato video)
  target_domain?:       string    // dominio destino del anuncio
  // Campos de texto — raramente presentes en Google Ads Transparency
  description?:         string
  headline?:            string
  // Enlaces de detalle
  details_link?:        string    // URL a adstransparency.google.com/advertiser/...
  serpapi_details_link?: string   // URL de SerpApi para detalles del anuncio
  // Métricas (solo anuncios políticos)
  total_days_shown?:    number
  minimum_views_count?: number
  maximum_views_count?: number
  minimum_budget_spent?:string
  maximum_budget_spent?:string
}

interface SerpApiResponse {
  error?:              string
  ad_creatives?:       SerpApiAd[]
  search_information?: { total_results?: number }
}

/** Detecta si el page_name es un dominio web (contiene un punto) */
function isDomain(name: string): boolean {
  return name.includes('.') && !name.includes(' ')
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

  // Modo dominio (p.ej. 'academia-geopol.es') o nombre (p.ej. 'Adams Formación')
  // En ambos casos se usa el parámetro 'text' — SerpApi acepta nombres y dominios.
  // Región 2724 = España (código numérico de SerpApi Google Ads Transparency Center)
  const searchMode = isDomain(competitorName) ? 'dominio' : 'nombre'
  console.log(`[ci-scan-google] Buscando "${competitorName}" por ${searchMode}`)

  const params = new URLSearchParams({
    engine:  'google_ads_transparency_center',
    api_key: apiKey,
    text:    competitorName,
    region:  '2724',  // España
    num:     '20',
  })

  try {
    const res  = await fetch(`${SERPAPI_BASE}?${params.toString()}`)
    const json = await res.json() as SerpApiResponse

    // "no results" no es un error — es simplemente 0 anuncios
    if (json.error) {
      const noResults = json.error.toLowerCase().includes("hasn't returned any results")
      if (noResults) return { ads: [], error: null }
      return { ads: [], error: `SerpApi error: ${json.error}` }
    }

    const ads = json.ad_creatives ?? []

    // Debug: log primeros 3 resultados raw en desarrollo
    if (process.env.NODE_ENV === 'development' && ads.length > 0) {
      console.log(`[ci-scan-google] Raw SerpApi response (primeros ${Math.min(3, ads.length)}):`)
      for (const ad of ads.slice(0, 3)) {
        console.log(JSON.stringify(ad, null, 2))
      }
    }

    return { ads, error: null }
  } catch (err) {
    return { ads: [], error: err instanceof Error ? err.message : String(err) }
  }
}

function extractCopyText(ad: SerpApiAd): string | null {
  const parts = [ad.headline, ad.description].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : null
}

/** ID externo estable: usa ad_creative_id de Google si existe, sino construye uno */
function buildAdIdExternal(ad: SerpApiAd, competitorName: string): string {
  if (ad.ad_creative_id) return ad.ad_creative_id
  const base = `${ad.advertiser_id ?? competitorName}_${ad.first_shown ?? Date.now()}`
  return base.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 120)
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
      const adIdExternal = buildAdIdExternal(ad, comp.page_name)
      const copyText     = extractCopyText(ad)

      // creative_url: imagen del anuncio (campo 'image' de SerpApi) o link de video
      // ad_snapshot_url: enlace a la ficha del anuncio en adstransparency.google.com
      const creativeUrl   = ad.image ?? ad.link ?? null
      const adSnapshotUrl = ad.details_link ?? null

      const { error: upsertError, data: upserted } = await supabase
        .from('competitor_ads')
        .upsert(
          {
            competitor_id:   comp.id,
            client_id,
            platform:        'google',
            ad_id_external:  adIdExternal,
            creative_url:    creativeUrl,
            ad_snapshot_url: adSnapshotUrl,
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
