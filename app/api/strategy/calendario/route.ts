import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/strategy/calendario?client_id=&mes=5&anio=2026
 * Devuelve todos los items del mes (no cancelados) para ese cliente.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const client_id = searchParams.get('client_id')
  const mes       = parseInt(searchParams.get('mes')  ?? String(new Date().getMonth() + 1), 10)
  const anio      = parseInt(searchParams.get('anio') ?? String(new Date().getFullYear()),  10)

  if (!client_id) return NextResponse.json({ error: 'client_id es obligatorio' }, { status: 400 })

  const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`
  const lastDay     = new Date(anio, mes, 0).getDate()
  const fechaFin    = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('calendario_editorial')
    .select('*')
    .eq('client_id', client_id)
    .gte('fecha_publicacion', fechaInicio)
    .lte('fecha_publicacion', fechaFin)
    .neq('status', 'cancelado')
    .order('fecha_publicacion', { ascending: true })

  if (error) {
    console.error('[calendario GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}

/**
 * POST /api/strategy/calendario
 * Crea entrada en calendario_editorial + pedido en contenidos.
 *
 * Body: {
 *   client_id, titulo, keyword, fecha_publicacion,
 *   fecha_entrega?, tipo_articulo?, funnel_stage?, cluster?,
 *   fuente?, notas?,
 *   map_item_id?, oportunidad_id?
 * }
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  let body: {
    client_id        : string
    titulo           : string
    keyword?         : string
    fecha_publicacion: string
    fecha_entrega?   : string
    tipo_articulo?   : string
    funnel_stage?    : string
    cluster?         : string
    fuente?          : string
    notas?           : string
    map_item_id?     : string
    oportunidad_id?  : string
  }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  if (!body.client_id || !body.titulo || !body.fecha_publicacion) {
    return NextResponse.json(
      { error: 'client_id, titulo y fecha_publicacion son obligatorios' },
      { status: 400 },
    )
  }

  // Obtener proyecto activo del cliente para crear el pedido
  const { data: proyecto } = await supabase
    .from('proyectos')
    .select('id')
    .eq('cliente_id', body.client_id)
    .eq('activo', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  // Crear pedido en contenidos
  let contenido_id: string | null = null
  if (proyecto) {
    const { data: contenido } = await supabase
      .from('contenidos')
      .insert({
        titulo            : body.titulo,
        keyword_principal : body.keyword ?? null,
        cliente_id        : body.client_id,
        proyecto_id       : proyecto.id,
        estado            : 'pendiente',
        fecha_entrega     : body.fecha_entrega ?? body.fecha_publicacion,
        prioridad         : 2,
        activo            : true,
      })
      .select('id')
      .single()
    contenido_id = contenido?.id ?? null
  }

  // Crear entrada en calendario_editorial
  const { data: entrada, error: entradaError } = await supabase
    .from('calendario_editorial')
    .insert({
      client_id        : body.client_id,
      map_item_id      : body.map_item_id      ?? null,
      oportunidad_id   : body.oportunidad_id   ?? null,
      contenido_id,
      titulo           : body.titulo,
      keyword          : body.keyword          ?? null,
      tipo_articulo    : body.tipo_articulo     ?? 'nuevo',
      funnel_stage     : body.funnel_stage      ?? null,
      cluster          : body.cluster           ?? null,
      fecha_publicacion: body.fecha_publicacion,
      fecha_entrega    : body.fecha_entrega     ?? null,
      fuente           : body.fuente            ?? 'manual',
      notas            : body.notas             ?? null,
      status           : 'planificado',
    })
    .select()
    .single()

  if (entradaError) {
    console.error('[calendario POST]', entradaError)
    return NextResponse.json({ error: entradaError.message }, { status: 500 })
  }

  // Actualizar map_item si viene del almacén
  if (body.map_item_id) {
    await supabase
      .from('content_map_items')
      .update({
        status          : 'in_progress',
        contenido_id    : contenido_id ?? undefined,
        fecha_calendario: body.fecha_publicacion,
      })
      .eq('id', body.map_item_id)
  }

  return NextResponse.json({ ok: true, entrada, contenido_id })
}
