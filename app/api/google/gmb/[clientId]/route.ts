/**
 * app/api/google/gmb/[clientId]/route.ts
 *
 * GET  — Obtiene datos GMB del cliente (reviews + insights + análisis Claude)
 *        Cachea en gmb_snapshots por día.
 *        Query param: ?force=true para forzar refresco.
 *
 * POST — Guarda la selección de location GMB para el cliente.
 *        Body: { googleAccountId, locationId, locationName }
 */

import { auth }              from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic             from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshAccessToken } from '@/lib/google-api'
import {
  getAllGMBLocations,
  getGMBReviews,
  getGMBInsights,
  getGMBRatingSummary,
} from '@/lib/google-gmb'

export const maxDuration = 60

// ─────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────

export async function GET(
  request  : NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { clientId } = params
  const force = request.nextUrl.searchParams.get('force') === 'true'
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  try {
    // ── 1. Leer conexión GMB ───────────────────────────────
    const { data: conn } = await supabase
      .from('client_google_connections')
      .select(`
        gmb_location_id,
        google_accounts (
          id, access_token, refresh_token, token_expiry, scopes
        )
      `)
      .eq('client_id', clientId)
      .not('gmb_location_id', 'is', null)
      .maybeSingle()

    if (!conn?.gmb_location_id) {
      return NextResponse.json({ connected: false })
    }

    const gacc = (conn.google_accounts as unknown) as {
      id: string; access_token: string; refresh_token: string
      token_expiry: string | null; scopes: string[] | null
    } | null

    if (!gacc) {
      return NextResponse.json({ connected: false })
    }

    // ── 2. Verificar caché ─────────────────────────────────
    if (!force) {
      const { data: cached } = await supabase
        .from('gmb_snapshots')
        .select('*')
        .eq('client_id', clientId)
        .eq('location_id', conn.gmb_location_id)
        .eq('date', today)
        .maybeSingle()

      if (cached) {
        return NextResponse.json({ connected: true, cached: true, date: today, ...cached })
      }
    }

    // ── 3. Refrescar access token si expirado ───────────────
    let accessToken = gacc.access_token
    const expiry    = gacc.token_expiry ? new Date(gacc.token_expiry).getTime() : null

    if (!expiry || Date.now() > expiry - 60_000) {
      try {
        const refreshed = await refreshAccessToken(gacc.refresh_token)
        accessToken = refreshed.access_token
        await supabase
          .from('google_accounts')
          .update({
            access_token: refreshed.access_token,
            token_expiry: refreshed.expiry_date
              ? new Date(refreshed.expiry_date).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', gacc.id)
      } catch (e) {
        console.error('[GMB] Error refrescando token:', e)
      }
    }

    // ── 4. Obtener client info ─────────────────────────────
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, sector')
      .eq('id', clientId)
      .single()

    const locationName = conn.gmb_location_id
    // locationName puede ser "accounts/X/locations/Y" o solo el ID
    const fullLocationName = locationName.startsWith('accounts/')
      ? locationName
      : locationName // kept as-is; API calls will handle it

    // ── 5. Llamadas paralelas: reviews + insights + rating ──
    const [reviewsResult, insightsResult, ratingResult] = await Promise.allSettled([
      getGMBReviews(accessToken, fullLocationName),
      getGMBInsights(accessToken, fullLocationName),
      getGMBRatingSummary(accessToken, fullLocationName),
    ])

    const reviews  = reviewsResult.status  === 'fulfilled' ? reviewsResult.value  : []
    const insights = insightsResult.status === 'fulfilled' ? insightsResult.value : {
      viewsMaps: 0, viewsSearch: 0, clicksWebsite: 0, clicksPhone: 0, clicksDirections: 0,
    }
    const rating   = ratingResult.status   === 'fulfilled' ? ratingResult.value   : { avgRating: 0, totalReviews: 0 }

    // ── 6. Analizar reseñas con Claude haiku ────────────────
    let reviewKeywords: string[]        = []
    let negativeKeywords: string[]      = []
    let implicitQuestions: string[]     = []
    let contentIdeas: Array<{
      titulo: string; keyword: string; razon: string; funnel: string
    }> = []

    const reviewsWithText = reviews.filter((r) => r.comment && r.comment.trim().length > 10)

    if (reviewsWithText.length >= 3) {
      try {
        const anthropic = new Anthropic()
        const reviewText = reviewsWithText
          .slice(0, 40)
          .map((r) => `[${r.rating}⭐] ${r.comment}`)
          .join('\n')

        const msg = await anthropic.messages.create({
          model     : 'claude-haiku-4-5',
          max_tokens: 1000,
          system    : `Analiza estas reseñas de Google My Business y extrae:
1. Las 10 palabras o frases más repetidas positivamente
2. Las 5 quejas o aspectos negativos más mencionados
3. Las 5 preguntas implícitas que hacen los clientes
4. 5 ideas de contenido basadas en lo que valoran los clientes

Responde SOLO en JSON válido sin markdown:
{
  "positive_keywords": [],
  "negative_keywords": [],
  "implicit_questions": [],
  "content_ideas": [
    { "titulo": "", "keyword": "", "razon": "", "funnel": "tofu|mofu|bofu" }
  ]
}`,
          messages: [{
            role   : 'user',
            content: `Negocio: ${cliente?.nombre ?? 'Negocio'}\nSector: ${cliente?.sector ?? ''}\n\nReseñas:\n${reviewText}`,
          }],
        })

        const raw  = msg.content[0].type === 'text' ? msg.content[0].text : ''
        const json = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = JSON.parse(json) as {
          positive_keywords ?: string[]
          negative_keywords ?: string[]
          implicit_questions?: string[]
          content_ideas     ?: Array<{ titulo: string; keyword: string; razon: string; funnel: string }>
        }

        reviewKeywords    = parsed.positive_keywords  ?? []
        negativeKeywords  = parsed.negative_keywords  ?? []
        implicitQuestions = parsed.implicit_questions ?? []
        contentIdeas      = parsed.content_ideas      ?? []

      } catch (e) {
        console.warn('[GMB] Claude analysis error (non-fatal):', e instanceof Error ? e.message : e)
      }
    }

    // ── 7. Guardar snapshot ────────────────────────────────
    const snapshot = {
      client_id        : clientId,
      location_id      : conn.gmb_location_id,
      date             : today,
      views_maps       : insights.viewsMaps,
      views_search     : insights.viewsSearch,
      clicks_website   : insights.clicksWebsite,
      clicks_phone     : insights.clicksPhone,
      clicks_directions: insights.clicksDirections,
      avg_rating       : rating.avgRating,
      total_reviews    : rating.totalReviews,
      new_reviews      : reviews.length,
      review_keywords  : reviewKeywords,
      recent_reviews   : reviews.slice(0, 10).map((r) => ({
        rating: r.rating, comment: r.comment.substring(0, 300), createTime: r.createTime,
        reviewerName: r.reviewerName,
      })),
      top_questions    : implicitQuestions,
      content_ideas    : contentIdeas,
    }

    await supabase
      .from('gmb_snapshots')
      .upsert(snapshot, { onConflict: 'client_id,location_id,date' })

    return NextResponse.json({
      connected        : true,
      cached           : false,
      date             : today,
      views_maps       : insights.viewsMaps,
      views_search     : insights.viewsSearch,
      clicks_website   : insights.clicksWebsite,
      clicks_phone     : insights.clicksPhone,
      clicks_directions: insights.clicksDirections,
      avg_rating       : rating.avgRating,
      total_reviews    : rating.totalReviews,
      review_keywords  : reviewKeywords,
      negative_keywords: negativeKeywords,
      implicit_questions: implicitQuestions,
      content_ideas    : contentIdeas,
      recent_reviews   : reviews.slice(0, 10),
    })

  } catch (err) {
    console.error('[GMB] Error inesperado:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Error obteniendo datos GMB' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────
// POST — guardar selección de location
// ─────────────────────────────────────────────────────────────

export async function POST(
  request  : NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { clientId } = params
  const supabase = createAdminClient()

  try {
    const body = await request.json() as {
      googleAccountId: string
      locationId     : string
      locationName   : string
    }

    if (!body.googleAccountId || !body.locationId) {
      return NextResponse.json({ error: 'googleAccountId y locationId son requeridos' }, { status: 400 })
    }

    // Upsert en client_google_connections
    const { error } = await supabase
      .from('client_google_connections')
      .upsert(
        {
          client_id        : clientId,
          google_account_id: body.googleAccountId,
          gmb_location_id  : body.locationId,
          status           : 'active',
          updated_at       : new Date().toISOString(),
        },
        { onConflict: 'client_id' },
      )

    if (error) throw error

    // Guardar location en gmb_locations si no existe
    await supabase
      .from('gmb_locations')
      .upsert(
        {
          client_id        : clientId,
          google_account_id: body.googleAccountId,
          location_id      : body.locationId,
          location_name    : body.locationName,
          activo           : true,
        },
        { onConflict: 'client_id,location_id' },
      )

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[GMB POST] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Error guardando location GMB' }, { status: 500 })
  }
}
