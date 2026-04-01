/**
 * GET /api/brand-assets?client_id=UUID
 *
 * Devuelve todos los activos de marca activos de un cliente,
 * ordenados por asset_type y file_name.
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
    .from('brand_assets')
    .select('*')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('asset_type')
    .order('file_name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ assets: data ?? [] })
}
