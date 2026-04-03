import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PATCH /api/video/:id
 * Actualiza el status del vídeo (ej. 'approved').
 * Body: { status: 'approved' | 'draft' | 'rejected' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { status?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { status } = body
  if (!status || !['draft', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('videos_generados')
    .update({ status })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/video/:id
 * Elimina el registro de BD. El archivo en Storage se deja huérfano
 * (limpieza opcional vía cron o manualmente).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  // Recuperar la URL antes de borrar para eliminar del storage
  const { data: video } = await supabase
    .from('videos_generados')
    .select('video_url')
    .eq('id', params.id)
    .maybeSingle()

  // Borrar registro de BD
  const { error } = await supabase
    .from('videos_generados')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Intentar borrar del Storage (best-effort)
  if (video?.video_url) {
    try {
      const url      = new URL(video.video_url)
      // La ruta es: /storage/v1/object/public/videos/<path>
      const parts    = url.pathname.split('/videos/')
      const filePath = parts[1]
      if (filePath) {
        await supabase.storage.from('videos').remove([filePath])
      }
    } catch {
      // Ignorar errores de storage — el registro de BD ya está borrado
    }
  }

  return NextResponse.json({ success: true })
}
