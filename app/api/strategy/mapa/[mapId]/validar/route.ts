import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface ValidacionItem {
  item_id        : string
  validacion     : 'propuesto' | 'aprobado' | 'rechazado' | 'revision'
  motivo_rechazo?: string
}

function calcularPrioridadFinal(
  p4_manual      : number | null,
  p3_actualizacion: boolean,
  p2_oportunidad : number | null,
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
 * POST /api/strategy/mapa/[mapId]/validar
 *
 * Body: [{ item_id, validacion, motivo_rechazo? }]
 *
 * Actualiza validación en lote. Si un item queda 'aprobado' y tiene
 * fecha_calendario, crea un pedido en la tabla contenidos automáticamente.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { mapId: string } }
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  let body: ValidacionItem[]
  try {
    body = await request.json()
    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json({ error: 'Se esperaba un array de validaciones' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const ahora = new Date().toISOString()
  const pedidosCreados: string[] = []
  const errores: string[] = []

  for (const v of body) {
    const { item_id, validacion, motivo_rechazo } = v

    if (!item_id || !validacion) {
      errores.push(`item_id o validacion faltante en entrada`)
      continue
    }

    // Actualizar el item
    const updatePayload: Record<string, unknown> = {
      validacion,
      fecha_validacion: ahora,
      motivo_rechazo  : validacion === 'rechazado' ? (motivo_rechazo ?? null) : null,
    }

    const { data: item, error: updateError } = await supabase
      .from('content_map_items')
      .update(updatePayload)
      .eq('id', item_id)
      .eq('map_id', params.mapId)
      .select('id, title, main_keyword, cluster, funnel_stage, volume, difficulty, fecha_calendario, contenido_id, p4_manual, p3_actualizacion, p2_oportunidad')
      .single()

    if (updateError || !item) {
      errores.push(`Error actualizando ${item_id}: ${updateError?.message ?? 'no encontrado'}`)
      continue
    }

    // Crear pedido automático si aprobado + tiene fecha_calendario + aún no tiene contenido
    if (validacion === 'aprobado' && item.fecha_calendario && !item.contenido_id) {
      // Obtener client_id desde content_maps
      const { data: map } = await supabase
        .from('content_maps')
        .select('client_id, session_id')
        .eq('id', params.mapId)
        .single()

      if (map?.client_id) {
        // Obtener primer proyecto activo del cliente
        const { data: proyecto } = await supabase
          .from('proyectos')
          .select('id')
          .eq('cliente_id', map.client_id)
          .eq('activo', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .single()

        if (proyecto) {
          const prioridad = calcularPrioridadFinal(
            item.p4_manual,
            Boolean(item.p3_actualizacion),
            item.p2_oportunidad,
          )

          const { data: contenido, error: pedidoError } = await supabase
            .from('contenidos')
            .insert({
              titulo            : item.title,
              keyword_principal : item.main_keyword,
              cliente_id        : map.client_id,
              proyecto_id       : proyecto.id,
              estado            : 'pendiente',
              fecha_entrega     : item.fecha_calendario,
              prioridad,
              activo            : true,
            })
            .select('id')
            .single()

          if (!pedidoError && contenido) {
            // Vincular el contenido al map_item
            await supabase
              .from('content_map_items')
              .update({ contenido_id: contenido.id })
              .eq('id', item_id)

            pedidosCreados.push(contenido.id)
          } else if (pedidoError) {
            errores.push(`Error creando pedido para ${item_id}: ${pedidoError.message}`)
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok            : true,
    actualizados  : body.length - errores.length,
    pedidos_creados: pedidosCreados.length,
    errores       : errores.length > 0 ? errores : undefined,
  })
}
