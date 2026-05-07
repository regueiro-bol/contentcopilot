/**
 * GET  /api/team/client-assignments?userId=xxx  → clientes asignados a un usuario
 * POST /api/team/client-assignments              → { userId, clientIds: string[] }
 *
 * Solo accesible por admins.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function checkAdmin(userId: string) {
  const supabase = createAdminClient()
  const { data: rol } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()
  return rol?.role === 'admin'
}

export async function GET(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!(await checkAdmin(userId))) {
    return NextResponse.json({ error: 'Solo admins' }, { status: 403 })
  }

  const targetUserId = req.nextUrl.searchParams.get('userId')
  if (!targetUserId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: assignments, error } = await supabase
    .from('client_assignments')
    .select('client_id')
    .eq('user_id', targetUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clientIds = (assignments ?? []).map((a) => String(a.client_id))
  return NextResponse.json({ clientIds })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!(await checkAdmin(userId))) {
    return NextResponse.json({ error: 'Solo admins' }, { status: 403 })
  }

  let body: { userId?: string; clientIds?: string[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { userId: targetUserId, clientIds } = body
  if (!targetUserId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })
  if (!Array.isArray(clientIds)) return NextResponse.json({ error: 'clientIds debe ser array' }, { status: 400 })

  const supabase = createAdminClient()

  // Borrar asignaciones actuales y reemplazar
  const { error: delErr } = await supabase
    .from('client_assignments')
    .delete()
    .eq('user_id', targetUserId)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (clientIds.length > 0) {
    const rows = clientIds.map((clientId) => ({
      user_id   : targetUserId,
      client_id : clientId,
    }))

    const { error: insErr } = await supabase
      .from('client_assignments')
      .insert(rows)

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId: targetUserId, clientIds })
}
