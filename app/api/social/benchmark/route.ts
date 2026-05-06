/**
 * GET    /api/social/benchmark?clientId=xxx
 * POST   /api/social/benchmark        — crea un referente
 * DELETE /api/social/benchmark?id=xxx — elimina un referente
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('social_benchmark')
    .select('*')
    .eq('client_id', clientId)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ─── POST (crear) ─────────────────────────────────────────────────────────────

interface BenchmarkPayload {
  client_id         : string
  name              : string
  platform          : string
  what_they_do_well?: string | null
  sort_order?       : number
}

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: BenchmarkPayload
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.client_id || !body.name || !body.platform) {
    return NextResponse.json({ error: 'client_id, name y platform son obligatorios' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Máximo 5 referentes por cliente
  const { count } = await supabase
    .from('social_benchmark')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', body.client_id)

  if ((count ?? 0) >= 5) {
    return NextResponse.json({ error: 'Máximo 5 referentes por cliente' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('social_benchmark')
    .insert(body)
    .select()
    .single()

  if (error) {
    console.error('[social/benchmark] Insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('social_benchmark')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
