/**
 * GET  /api/competitive-intelligence/competitors?client_id=...
 * POST /api/competitive-intelligence/competitors
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ competitors: data ?? [] })
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { client_id, page_name, platform = 'meta', page_id, check_frequency_days = 7 } = body

  if (!client_id || typeof client_id !== 'string')
    return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })
  if (!page_name || typeof page_name !== 'string' || !page_name.trim())
    return NextResponse.json({ error: 'page_name requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('competitors')
    .insert({
      client_id,
      page_name:            page_name.trim(),
      platform:             platform ?? 'meta',
      page_id:              page_id || null,
      check_frequency_days: Number(check_frequency_days) || 7,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ competitor: data }, { status: 201 })
}
