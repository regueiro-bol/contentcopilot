import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getAuthUrl } from '@/lib/google-api'

/**
 * GET /api/auth/google
 *
 * Genera la URL de autorización OAuth de Google y redirige al usuario.
 * Query params opcionales:
 *   - hint: email para pre-seleccionar la cuenta Google
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    redirect('/sign-in')
  }

  const hint    = request.nextUrl.searchParams.get('hint') ?? undefined
  const authUrl = getAuthUrl(hint)

  redirect(authUrl)
}
