import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 10

/**
 * GET /api/strategy/mapa/[mapId]/pedidos-estado
 *
 * Endpoint ligero para polling de estado de generación de pedidos.
 * Devuelve solo los campos de estado — sin datos de contenido ni Claude.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { mapId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('content_map_items')
    .select('id, pedido_estado, pedido_error_msg, contenido_id, pedido_iniciado_at')
    .eq('map_id', params.mapId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}
