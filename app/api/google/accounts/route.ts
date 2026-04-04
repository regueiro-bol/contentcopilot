import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/google/accounts
 *
 * Lista todas las cuentas Google de la agencia con el número
 * de conexiones activas de cada una.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Cargar cuentas
  const { data: accounts, error } = await supabase
    .from('google_accounts')
    .select('id, email, display_name, scopes, created_at, updated_at')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GoogleAccounts] Error listando cuentas:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Contar conexiones activas por cuenta
  const { data: connections } = await supabase
    .from('client_google_connections')
    .select('google_account_id')
    .eq('status', 'active')

  const connectionCounts = new Map<string, number>()
  for (const conn of connections ?? []) {
    const id = conn.google_account_id
    connectionCounts.set(id, (connectionCounts.get(id) ?? 0) + 1)
  }

  const result = (accounts ?? []).map((a) => ({
    ...a,
    active_connections: connectionCounts.get(a.id) ?? 0,
  }))

  return NextResponse.json({ accounts: result })
}
