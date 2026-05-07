/**
 * GET /api/auth/my-clients
 *
 * Devuelve los clientes a los que tiene acceso el usuario autenticado.
 *
 * - Admin:          { clientIds: null,    restrictedToClients: false }
 * - Otros roles:   { clientIds: string[], restrictedToClients: true  }
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ clientIds: [], restrictedToClients: true })
  }

  const supabase = createAdminClient()

  // Leer rol del usuario
  const { data: rolRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  // Admin → ve todos los clientes
  if (!rolRow || rolRow.role === 'admin') {
    return NextResponse.json({ clientIds: null, restrictedToClients: false })
  }

  // Resto → IDs asignados
  const { data: assignments } = await supabase
    .from('client_assignments')
    .select('client_id')
    .eq('user_id', userId)

  const clientIds = (assignments ?? []).map((a) => String(a.client_id))

  return NextResponse.json({ clientIds, restrictedToClients: true })
}
