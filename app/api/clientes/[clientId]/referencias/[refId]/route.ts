/**
 * PATCH  /api/clientes/[clientId]/referencias/[refId]
 * DELETE /api/clientes/[clientId]/referencias/[refId]
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { clientId: string; refId: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const allowed = ['nombre', 'tipo', 'categoria', 'notas', 'activo']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('referencias_externas')
    .update(updates)
    .eq('id', params.refId)
    .eq('client_id', params.clientId)
    .select('*, referencia_presencias(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    referencia: {
      ...data,
      presencias: data.referencia_presencias ?? [],
      referencia_presencias: undefined,
    },
  })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { clientId: string; refId: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('referencias_externas')
    .delete()
    .eq('id', params.refId)
    .eq('client_id', params.clientId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
