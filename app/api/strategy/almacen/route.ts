import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/**
 * GET /api/strategy/almacen
 *
 * Query params:
 *   client_id        string   (obligatorio)
 *   estado           string   filtro estado_almacen
 *   tipo_articulo    string
 *   funnel_stage     string
 *   prioridad_final  string   "1" | "2" | "3"
 *   cluster          string
 *   q                string   búsqueda en título o keyword
 *   page             number   (1-based, default 1)
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const client_id       = searchParams.get('client_id')
  const estado          = searchParams.get('estado')
  const tipo_articulo   = searchParams.get('tipo_articulo')
  const funnel_stage    = searchParams.get('funnel_stage')
  const prioridad_str   = searchParams.get('prioridad_final')
  const cluster         = searchParams.get('cluster')
  const q               = searchParams.get('q')?.trim()
  const page            = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

  if (!client_id) return NextResponse.json({ error: 'client_id es obligatorio' }, { status: 400 })

  const supabase = createAdminClient()

  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  let query = supabase
    .from('vista_almacen_cliente')
    .select('*', { count: 'exact' })
    .eq('client_id', client_id)
    .order('prioridad_final', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true })
    .range(from, to)

  if (tipo_articulo)           query = query.eq('tipo_articulo', tipo_articulo)
  if (funnel_stage)            query = query.eq('funnel_stage', funnel_stage)
  if (prioridad_str)           query = query.eq('prioridad_final', parseInt(prioridad_str, 10))
  if (cluster)                 query = query.eq('cluster', cluster)
  if (q)                       query = query.or(`title.ilike.%${q}%,main_keyword.ilike.%${q}%`)

  // El filtro de estado se aplica sobre el campo calculado estado_almacen
  if (estado)                  query = query.eq('estado_almacen', estado)

  const { data, error, count } = await query

  if (error) {
    console.error('[almacen GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    items     : data ?? [],
    total     : count ?? 0,
    page,
    page_size : PAGE_SIZE,
    has_more  : (count ?? 0) > page * PAGE_SIZE,
  })
}
