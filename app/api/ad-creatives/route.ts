/**
 * GET /api/ad-creatives?client_id=xxx
 *
 * Lista todos los ad creatives de un cliente, ordenados por
 * batch_id + variation_index para facilitar la agrupación en UI.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const clientId = request.nextUrl.searchParams.get('client_id')
  if (!clientId) {
    return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('ad_creatives')
    .select('*')
    .eq('client_id', clientId)
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .order('variation_index', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ creatives: data ?? [] })
}
