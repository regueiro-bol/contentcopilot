import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * DELETE /api/strategy/mapas/[mapId]
 *
 * Elimina un content_map y sus items (CASCADE).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { mapId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Verificar que existe
  const { data: map } = await supabase
    .from('content_maps')
    .select('id')
    .eq('id', params.mapId)
    .single()

  if (!map) {
    return NextResponse.json({ error: 'Mapa no encontrado' }, { status: 404 })
  }

  // Eliminar (items se eliminan por CASCADE)
  const { error } = await supabase
    .from('content_maps')
    .delete()
    .eq('id', params.mapId)

  if (error) {
    console.error('[DeleteMap] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[DeleteMap] Mapa ${params.mapId} eliminado`)
  return NextResponse.json({ ok: true })
}
