import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshAccessToken, getGA4PageMetrics } from '@/lib/google-api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/google/ga4/[clientId]?force=true
 *
 * Devuelve métricas GA4 por página para un cliente.
 * Usa caché diaria en ga4_snapshots. Con ?force=true fuerza nuevo fetch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const force    = request.nextUrl.searchParams.get('force') === 'true'

  // 1. Buscar conexión GA4 activa
  const { data: conn } = await supabase
    .from('client_google_connections')
    .select('ga4_property_id, google_account_id, google_accounts(access_token, refresh_token, token_expiry)')
    .eq('client_id', params.clientId)
    .eq('status', 'active')
    .not('ga4_property_id', 'is', null)
    .maybeSingle()

  if (!conn?.ga4_property_id) {
    return NextResponse.json({ error: 'no_ga4' }, { status: 404 })
  }

  const propertyId = conn.ga4_property_id as string
  console.log(`[GA4] Request para cliente ${params.clientId}, force=${force}`)

  // 2. Comprobar caché (snapshot de hoy)
  if (!force) {
    const today = new Date().toISOString().split('T')[0]
    const { data: snapshot } = await supabase
      .from('ga4_snapshots')
      .select('metrics, created_at')
      .eq('client_id', params.clientId)
      .eq('snapshot_date', today)
      .maybeSingle()

    if (snapshot) {
      console.log(`[GA4] Sirviendo snapshot cacheado para cliente ${params.clientId}`)
      return NextResponse.json({
        metrics    : snapshot.metrics,
        property_id: propertyId,
        fecha      : snapshot.created_at,
        cached     : true,
      })
    }
  }

  // 3. Fetch fresco de Google
  console.log(`[GA4] Llamando a Google API para cliente ${params.clientId}`)
  const ga = conn.google_accounts as unknown as {
    access_token: string | null
    refresh_token: string
    token_expiry: string | null
  }

  let accessToken = ga.access_token
  const isExpired = !accessToken || (ga.token_expiry && new Date(ga.token_expiry) <= new Date())

  if (isExpired && ga.refresh_token) {
    try {
      console.log(`[GA4] Refrescando token para cliente ${params.clientId}...`)
      const refreshed = await refreshAccessToken(ga.refresh_token)
      accessToken = refreshed.access_token

      await supabase
        .from('google_accounts')
        .update({
          access_token: refreshed.access_token,
          token_expiry: refreshed.expiry_date ? new Date(refreshed.expiry_date).toISOString() : null,
          updated_at  : new Date().toISOString(),
        })
        .eq('id', conn.google_account_id)
    } catch (err) {
      console.error('[GA4] Error refrescando token:', err instanceof Error ? err.message : err)
      return NextResponse.json(
        { error: 'No se pudo refrescar el token de Google. Reconecta la cuenta.' },
        { status: 401 },
      )
    }
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Sin access token' }, { status: 401 })
  }

  try {
    const metrics = await getGA4PageMetrics(accessToken, propertyId)

    // 4. Guardar snapshot
    const today = new Date().toISOString().split('T')[0]
    await supabase
      .from('ga4_snapshots')
      .upsert(
        {
          client_id    : params.clientId,
          property_id  : propertyId,
          snapshot_date: today,
          metrics,
        },
        { onConflict: 'client_id,snapshot_date' },
      )

    console.log(`[GA4] ${metrics.length} páginas guardadas para cliente ${params.clientId}`)

    return NextResponse.json({
      metrics,
      property_id: propertyId,
      fecha      : new Date().toISOString(),
      cached     : false,
    })
  } catch (err) {
    console.error('[GA4] Error obteniendo métricas:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: `Error obteniendo datos de GA4: ${err instanceof Error ? err.message : 'desconocido'}` },
      { status: 500 },
    )
  }
}
