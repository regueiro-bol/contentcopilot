/**
 * PATCH /api/strategy/oportunidades-gsc/[oppId]
 * Actualiza el status de una content_opportunity (activa → descartada / en_proceso)
 */

import { auth }              from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request  : NextRequest,
  { params }: { params: { oppId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { oppId } = params
  const supabase  = createAdminClient()

  try {
    const body = await request.json() as { status?: string }
    const status = body.status ?? 'descartada'

    if (!['activa', 'descartada', 'en_proceso'].includes(status)) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    }

    const { error } = await supabase
      .from('content_opportunities')
      .update({ status })
      .eq('id', oppId)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[oportunidades-gsc PATCH]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Error actualizando oportunidad' }, { status: 500 })
  }
}
