import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/pedidos/proyectos?cliente_id=UUID
 * Devuelve los proyectos activos de un cliente para los selectores de los modales.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const clienteId = request.nextUrl.searchParams.get('cliente_id')
  if (!clienteId) {
    return NextResponse.json({ error: 'cliente_id es requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('proyectos')
    .select('id, nombre')
    .eq('cliente_id', clienteId)
    .eq('activo', true)
    .order('nombre')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ proyectos: data ?? [] })
}
