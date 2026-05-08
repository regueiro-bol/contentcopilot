/**
 * GET /api/strategy/mapas?client_id=...
 * Lista los mapas de contenido activos de un cliente.
 */

import { auth }              from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const client_id = request.nextUrl.searchParams.get('client_id')
  if (!client_id) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('content_maps')
    .select('id, nombre, created_at')
    .eq('client_id', client_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ maps: data ?? [] })
}
