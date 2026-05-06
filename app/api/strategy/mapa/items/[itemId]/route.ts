import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function calcularPrioridadFinal(
  p4_manual       : number | null | undefined,
  p3_actualizacion: boolean,
  p2_oportunidad  : number | null | undefined,
): number {
  if (p4_manual != null) return p4_manual
  if (p3_actualizacion)  return 1
  if (p2_oportunidad != null) {
    if (p2_oportunidad > 3000) return 1
    if (p2_oportunidad > 1000) return 2
    return 3
  }
  return 2
}

/**
 * PATCH /api/strategy/mapa/items/[itemId]
 *
 * Body: { p4_manual?, p3_actualizacion?, fecha_calendario?, redactor_asignado? }
 *
 * Actualiza el item y recalcula prioridad_final.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  let body: {
    p4_manual?        : number | null
    p3_actualizacion? : boolean
    fecha_calendario? : string | null
    redactor_asignado?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Leer estado actual para recalcular prioridad
  const { data: current, error: fetchError } = await supabase
    .from('content_map_items')
    .select('p4_manual, p3_actualizacion, p2_oportunidad')
    .eq('id', params.itemId)
    .single()

  if (fetchError || !current) {
    return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
  }

  const p4 = 'p4_manual' in body ? body.p4_manual : current.p4_manual
  const p3 = 'p3_actualizacion' in body ? Boolean(body.p3_actualizacion) : Boolean(current.p3_actualizacion)
  const p2 = current.p2_oportunidad

  const prioridad_final = calcularPrioridadFinal(p4, p3, p2)

  const updatePayload: Record<string, unknown> = { prioridad_final }
  if ('p4_manual' in body)         updatePayload.p4_manual         = body.p4_manual
  if ('p3_actualizacion' in body)  updatePayload.p3_actualizacion  = body.p3_actualizacion
  if ('fecha_calendario' in body)  updatePayload.fecha_calendario  = body.fecha_calendario
  if ('redactor_asignado' in body) updatePayload.redactor_asignado = body.redactor_asignado

  const { data: updated, error: updateError } = await supabase
    .from('content_map_items')
    .update(updatePayload)
    .eq('id', params.itemId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, item: updated })
}
