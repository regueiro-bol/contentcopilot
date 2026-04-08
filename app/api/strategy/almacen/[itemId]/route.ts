import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PATCH /api/strategy/almacen/[itemId]
 *
 * Body: {
 *   status?          : string
 *   fecha_calendario?: string | null   (ISO date 'YYYY-MM-DD')
 *   notas?           : string | null
 *   validacion?      : string
 * }
 *
 * Si fecha_calendario se establece y el item está aprobado y no tiene pedido,
 * crea automáticamente un contenido (pedido) vinculado.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  let body: {
    status?          : string
    fecha_calendario?: string | null
    notas?           : string | null
    validacion?      : string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Leer estado actual del item
  const { data: current, error: fetchError } = await supabase
    .from('content_map_items')
    .select('id, title, main_keyword, secondary_keywords, contenido_id, validacion, fecha_calendario, map_id')
    .eq('id', params.itemId)
    .single()

  if (fetchError || !current) {
    return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
  }

  // Construir payload de actualización solo con los campos enviados
  const updatePayload: Record<string, unknown> = {}
  if ('status'           in body) updatePayload.status           = body.status
  if ('fecha_calendario' in body) updatePayload.fecha_calendario = body.fecha_calendario
  if ('notas'            in body) updatePayload.notas            = body.notas
  if ('validacion'       in body) updatePayload.validacion       = body.validacion

  const { data: updated, error: updateError } = await supabase
    .from('content_map_items')
    .update(updatePayload)
    .eq('id', params.itemId)
    .select()
    .single()

  if (updateError) {
    console.error('[almacen PATCH]', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Crear pedido automáticamente si se asigna fecha_calendario + aprobado + sin pedido
  const nuevaFecha       = 'fecha_calendario' in body ? body.fecha_calendario : current.fecha_calendario
  const nuevaValidacion  = ('validacion' in body ? body.validacion : current.validacion) ?? current.validacion
  const yaConPedido      = current.contenido_id

  let pedidoId: string | null = null

  if (nuevaFecha && nuevaValidacion === 'aprobado' && !yaConPedido) {
    // Obtener client_id y proyecto activo del cliente
    const { data: map } = await supabase
      .from('content_maps')
      .select('client_id')
      .eq('id', current.map_id)
      .single()

    if (map?.client_id) {
      const { data: proyecto } = await supabase
        .from('proyectos')
        .select('id')
        .eq('cliente_id', map.client_id)
        .eq('activo', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (proyecto) {
        const { data: contenido, error: pedidoError } = await supabase
          .from('contenidos')
          .insert({
            titulo           : current.title,
            keyword_principal: current.main_keyword,
            cliente_id       : map.client_id,
            proyecto_id      : proyecto.id,
            estado           : 'pendiente',
            fecha_entrega    : nuevaFecha,
            prioridad        : 2,
            activo           : true,
          })
          .select('id')
          .single()

        if (!pedidoError && contenido) {
          await supabase
            .from('content_map_items')
            .update({ contenido_id: contenido.id })
            .eq('id', params.itemId)
          pedidoId = contenido.id
        }
      }
    }
  }

  return NextResponse.json({ ok: true, item: updated, pedido_id: pedidoId })
}
