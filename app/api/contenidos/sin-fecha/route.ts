/**
 * GET /api/contenidos/sin-fecha?client_id=xxx
 *
 * Returns contenidos for a client that have no entry in calendario_editorial
 * (or whose entry is cancelled). Used by the "Añadir contenido" modal in
 * the editorial calendar page.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const client_id = request.nextUrl.searchParams.get('client_id')
  if (!client_id) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

  const supabase = createAdminClient()

  // Get all active calendar entries for the client (non-cancelled)
  const { data: entradas } = await supabase
    .from('calendario_editorial')
    .select('contenido_id')
    .eq('client_id', client_id)
    .neq('status', 'cancelado')

  const contenidosConFecha = new Set(
    (entradas ?? []).map((e) => e.contenido_id).filter(Boolean) as string[]
  )

  // Fetch contenidos for this client that are NOT published and NOT in calendar
  const { data, error } = await supabase
    .from('contenidos')
    .select('id, titulo, keyword_principal, estado')
    .eq('cliente_id', client_id)
    .neq('estado', 'publicado')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const contenidos = (data ?? []).filter((c) => !contenidosConFecha.has(c.id))

  return NextResponse.json({ contenidos })
}
