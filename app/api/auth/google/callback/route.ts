import { NextRequest, NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { exchangeCode, getUserInfo } from '@/lib/google-api'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_ACCOUNTS = 3

/**
 * GET /api/auth/google/callback
 *
 * Callback de OAuth de Google. Recibe el authorization code,
 * lo intercambia por tokens, obtiene el email del usuario y
 * guarda/actualiza la cuenta en google_accounts.
 *
 * Redirige a /settings/google-accounts?connected=true o ?error=...
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    redirect('/sign-in')
  }

  const code  = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  // El usuario canceló el flujo OAuth
  if (error) {
    console.warn('[GoogleCallback] Usuario canceló OAuth:', error)
    redirect('/settings/google-accounts?error=cancelled')
  }

  if (!code) {
    console.error('[GoogleCallback] No se recibió authorization code')
    redirect('/settings/google-accounts?error=no_code')
  }

  const supabase = createAdminClient()

  try {
    // 1. Intercambiar code por tokens
    console.log('[GoogleCallback] Intercambiando code por tokens...')
    const tokens = await exchangeCode(code)

    // 2. Obtener info del usuario
    const userInfo = await getUserInfo(tokens.access_token)
    console.log(`[GoogleCallback] Usuario: ${userInfo.email}`)

    if (!userInfo.email) {
      console.error('[GoogleCallback] No se pudo obtener el email del usuario')
      redirect('/settings/google-accounts?error=no_email')
    }

    // 3. Verificar límite de 3 cuentas (solo si es cuenta nueva)
    const { data: existingAccount } = await supabase
      .from('google_accounts')
      .select('id')
      .eq('email', userInfo.email)
      .maybeSingle()

    if (!existingAccount) {
      const { count } = await supabase
        .from('google_accounts')
        .select('id', { count: 'exact', head: true })

      if ((count ?? 0) >= MAX_ACCOUNTS) {
        console.warn(`[GoogleCallback] Límite de ${MAX_ACCOUNTS} cuentas alcanzado`)
        redirect('/settings/google-accounts?error=max_accounts')
      }
    }

    // 4. Upsert en google_accounts
    const { error: upsertError } = await supabase
      .from('google_accounts')
      .upsert(
        {
          email        : userInfo.email,
          display_name : userInfo.displayName,
          access_token : tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expiry : tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
          scopes       : [
            'webmasters.readonly',
            'analytics.readonly',
            'userinfo.email',
          ],
          updated_at   : new Date().toISOString(),
        },
        { onConflict: 'email' },
      )

    if (upsertError) {
      console.error('[GoogleCallback] Error guardando cuenta:', upsertError)
      redirect('/settings/google-accounts?error=db_error')
    }

    console.log(`[GoogleCallback] Cuenta ${userInfo.email} guardada correctamente`)
    redirect('/settings/google-accounts?connected=true')

  } catch (err) {
    console.error('[GoogleCallback] Error inesperado:', err instanceof Error ? err.message : err)
    redirect('/settings/google-accounts?error=unexpected')
  }
}
