/**
 * GET /api/google/gmb/accounts
 *
 * Devuelve todas las locations GMB disponibles para el account especificado.
 * Query param: ?accountId=<google_accounts.id>
 */

import { auth }              from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshAccessToken } from '@/lib/google-api'
import { getAllGMBLocations } from '@/lib/google-gmb'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accountId = request.nextUrl.searchParams.get('accountId')
  if (!accountId) return NextResponse.json({ error: 'accountId requerido' }, { status: 400 })

  const supabase = createAdminClient()

  try {
    const { data: gacc } = await supabase
      .from('google_accounts')
      .select('id, access_token, refresh_token, token_expiry')
      .eq('id', accountId)
      .single()

    if (!gacc) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

    // Refrescar token si expirado
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
        console.warn('[GMB accounts] Error refrescando token:', e)
      }
    }

    const locations = await getAllGMBLocations(accessToken)

    return NextResponse.json({ locations })

  } catch (err) {
    console.error('[GMB accounts] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Error obteniendo locations GMB' }, { status: 500 })
  }
}
