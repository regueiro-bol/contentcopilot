import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  refreshAccessToken,
  getGSCProperties,
  getGA4Properties,
} from '@/lib/google-api'

/**
 * GET /api/google/accounts/[accountId]/properties
 *
 * Devuelve las propiedades GSC y GA4 disponibles para una cuenta Google.
 * Refresca el access token automáticamente si está expirado.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { accountId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Cargar cuenta
  const { data: account, error: accError } = await supabase
    .from('google_accounts')
    .select('id, email, access_token, refresh_token, token_expiry')
    .eq('id', params.accountId)
    .single()

  if (accError || !account) {
    return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
  }

  // Refrescar token si expirado (o si no hay access_token)
  let accessToken = account.access_token
  const isExpired = !accessToken || (account.token_expiry && new Date(account.token_expiry) <= new Date())

  if (isExpired) {
    try {
      console.log(`[GoogleProperties] Refrescando token para ${account.email}...`)
      const refreshed = await refreshAccessToken(account.refresh_token)
      accessToken = refreshed.access_token

      // Actualizar tokens en BD
      await supabase
        .from('google_accounts')
        .update({
          access_token: refreshed.access_token,
          token_expiry: refreshed.expiry_date
            ? new Date(refreshed.expiry_date).toISOString()
            : null,
          updated_at  : new Date().toISOString(),
        })
        .eq('id', account.id)
    } catch (err) {
      console.error(`[GoogleProperties] Error refrescando token:`, err instanceof Error ? err.message : err)
      return NextResponse.json(
        { error: 'No se pudo refrescar el token de Google. Reconecta la cuenta.' },
        { status: 401 },
      )
    }
  }

  // Obtener propiedades en paralelo
  try {
    console.log(`[GoogleProperties] Obteniendo propiedades para ${account.email} con token ${accessToken!.substring(0, 20)}...`)

    const [gsc, ga4] = await Promise.all([
      getGSCProperties(accessToken!).catch((err) => {
        console.warn('[GoogleProperties] Error obteniendo GSC:', err instanceof Error ? err.message : err)
        if (err instanceof Error && 'response' in err) {
          console.warn('[GoogleProperties] GSC response:', JSON.stringify((err as any).response?.data ?? {}))
        }
        return []
      }),
      getGA4Properties(accessToken!).catch((err) => {
        console.warn('[GoogleProperties] Error obteniendo GA4:', err instanceof Error ? err.message : err)
        if (err instanceof Error && 'response' in err) {
          console.warn('[GoogleProperties] GA4 response:', JSON.stringify((err as any).response?.data ?? {}))
        }
        return []
      }),
    ])

    console.log(`[GoogleProperties] ${account.email}: ${gsc.length} GSC, ${ga4.length} GA4`)
    if (gsc.length > 0) console.log(`[GoogleProperties] GSC sample:`, JSON.stringify(gsc[0]))
    if (ga4.length > 0) console.log(`[GoogleProperties] GA4 sample:`, JSON.stringify(ga4[0]))
    if (ga4.length === 0) console.warn(`[GoogleProperties] GA4 vacío — verificar que "Google Analytics Admin API" está habilitada en Cloud Console`)

    return NextResponse.json({ gsc, ga4 })
  } catch (err) {
    console.error('[GoogleProperties] Error inesperado:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Error obteniendo propiedades de Google' }, { status: 500 })
  }
}
