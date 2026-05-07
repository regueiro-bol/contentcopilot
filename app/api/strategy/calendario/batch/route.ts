/**
 * POST /api/strategy/calendario/batch
 *
 * Inserta múltiples entradas en el calendario editorial de forma eficiente.
 * Usado por el modal "Distribuir en fases" del Banco de Contenidos.
 *
 * Body: {
 *   client_id: string,
 *   items: Array<{
 *     titulo           : string
 *     keyword?         : string | null
 *     fecha_publicacion: string        // YYYY-MM-DD
 *     tipo_articulo?   : string
 *     funnel_stage?    : string | null
 *     cluster?         : string | null
 *     fuente?          : string
 *     notas?           : string | null
 *     map_item_id?     : string | null
 *   }>
 * }
 */

import { auth }          from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: {
    client_id: string
    items: Array<{
      titulo           : string
      keyword?         : string | null
      fecha_publicacion: string
      tipo_articulo?   : string
      funnel_stage?    : string | null
      cluster?         : string | null
      fuente?          : string
      notas?           : string | null
      map_item_id?     : string | null
    }>
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { client_id, items } = body
  if (!client_id) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items debe ser array no vacío' }, { status: 400 })
  }
  if (items.length > 100) {
    return NextResponse.json({ error: 'Máximo 100 artículos por lote' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Obtener proyecto activo del cliente
  const { data: proyecto } = await supabase
    .from('proyectos')
    .select('id')
    .eq('cliente_id', client_id)
    .eq('activo', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Crear contenidos en bloque
  let contenidoIdsPorIndex: Record<number, string> = {}

  if (proyecto) {
    const contenidosInsert = items.map((item) => ({
      titulo           : item.titulo,
      keyword_principal: item.keyword ?? null,
      cliente_id       : client_id,
      proyecto_id      : proyecto.id,
      estado           : 'pendiente',
      fecha_entrega    : item.fecha_publicacion,
      prioridad        : 2,
      activo           : true,
    }))

    const { data: contenidos } = await supabase
      .from('contenidos')
      .insert(contenidosInsert)
      .select('id')

    if (contenidos) {
      contenidos.forEach((c, i) => {
        contenidoIdsPorIndex[i] = c.id
      })
    }
  }

  // Crear entradas de calendario en bloque
  const calendarInsert = items.map((item, i) => ({
    client_id        : client_id,
    map_item_id      : item.map_item_id  ?? null,
    oportunidad_id   : null,
    contenido_id     : contenidoIdsPorIndex[i] ?? null,
    titulo           : item.titulo,
    keyword          : item.keyword      ?? null,
    tipo_articulo    : item.tipo_articulo ?? 'nuevo',
    funnel_stage     : item.funnel_stage  ?? null,
    cluster          : item.cluster       ?? null,
    fecha_publicacion: item.fecha_publicacion,
    fecha_entrega    : item.fecha_publicacion,
    fuente           : item.fuente        ?? 'banco',
    notas            : item.notas         ?? null,
    status           : 'planificado',
  }))

  const { data: entradas, error } = await supabase
    .from('calendario_editorial')
    .insert(calendarInsert)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Actualizar map_items a in_progress si vienen del banco
  const mapItemUpdates = items
    .map((item, i) => ({ map_item_id: item.map_item_id, fecha: item.fecha_publicacion, contenido_id: contenidoIdsPorIndex[i] }))
    .filter((u) => !!u.map_item_id)

  if (mapItemUpdates.length > 0) {
    await Promise.all(
      mapItemUpdates.map((u) =>
        supabase.from('content_map_items').update({
          status          : 'in_progress',
          contenido_id    : u.contenido_id ?? undefined,
          fecha_calendario: u.fecha,
        }).eq('id', u.map_item_id!),
      ),
    )
  }

  return NextResponse.json({ ok: true, count: entradas?.length ?? 0 })
}
