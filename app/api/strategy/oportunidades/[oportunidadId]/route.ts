/**
 * PATCH /api/strategy/oportunidades/[oportunidadId]
 *
 * Persiste validacion / motivo_rechazo en oportunidades_actualidad.
 * Body: { validacion: string, motivo_rechazo?: string | null }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { oportunidadId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { validacion?: string; motivo_rechazo?: string | null }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const supabase = createAdminClient()
  const payload: Record<string, unknown> = { fecha_validacion: new Date().toISOString() }
  if ('validacion'      in body) payload.validacion      = body.validacion
  if ('motivo_rechazo'  in body) payload.motivo_rechazo  = body.motivo_rechazo

  const { error } = await supabase
    .from('oportunidades_actualidad')
    .update(payload)
    .eq('id', params.oportunidadId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
