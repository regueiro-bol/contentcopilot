import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/video?contenido_id=xxx
 * Devuelve los vídeos generados para un contenido.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const contenidoId = request.nextUrl.searchParams.get('contenido_id')
  if (!contenidoId) {
    return NextResponse.json({ error: 'contenido_id es obligatorio' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('videos_generados')
    .select('id, tipo, video_url, duracion_segundos, num_slides, status, created_at')
    .eq('contenido_id', contenidoId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const videos = (data ?? []).map((v) => ({
    id        : v.id,
    url       : v.video_url,
    tipo      : v.tipo as 'reel' | 'story',
    duracion  : v.duracion_segundos ?? 0,
    num_slides: v.num_slides ?? 0,
    status    : v.status,
  }))

  return NextResponse.json({ videos })
}
