/**
 * GET /api/social/design-queue
 *
 * Returns all social_posts with status='en_diseno' across all clients,
 * joined with client name. Optionally filtered by clientId.
 *
 * Query params:
 *   clientId? — filter by client
 *
 * Returns: Array<post & { client_nombre: string }>
 */

import { auth }           from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  const supabase = createAdminClient()

  let query = supabase
    .from('social_posts')
    .select('*, clientes(nombre)')
    .eq('status', 'en_diseno')
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) {
    console.error('[design-queue] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten client name into each post
  const posts = (data ?? []).map((p) => ({
    ...p,
    client_nombre: (p as any).clientes?.nombre ?? '',
    clientes     : undefined,
  }))

  return NextResponse.json(posts)
}
