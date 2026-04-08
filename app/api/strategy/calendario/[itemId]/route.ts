import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PATCH /api/strategy/calendario/[itemId]
 * Actualiza fecha, redactor, status o notas de una entrada.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  let body: {
    fecha_publicacion?: string
    fecha_entrega?    : string | null
    redactor_id?      : string | null
    status?           : string
    notas?            : string | null
    tipo_articulo?    : string
    funnel_stage?     : string | null
    cluster?          : string | null
  }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const fields = ['fecha_publicacion','fecha_entrega','redactor_id','status','notas','tipo_articulo','funnel_stage','cluster'] as const
  for (const f of fields) {
    if (f in body) updatePayload[f] = body[f as keyof typeof body]
  }

  const { data, error } = await supabase
    .from('calendario_editorial')
    .update(updatePayload)
    .eq('id', params.itemId)
    .select()
    .single()

  if (error) {
    console.error('[calendario PATCH]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sincronizar status con contenidos si procede
  if (body.status && data.contenido_id) {
    const estadoMap: Record<string, string> = {
      en_redaccion: 'en_redaccion',
      publicado    : 'publicado',
    }
    if (estadoMap[body.status]) {
      await supabase
        .from('contenidos')
        .update({ estado: estadoMap[body.status] })
        .eq('id', data.contenido_id)
    }
  }

  return NextResponse.json({ ok: true, item: data })
}

/**
 * DELETE /api/strategy/calendario/[itemId]
 * Borrado lógico: pone status = 'cancelado'.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('calendario_editorial')
    .update({ status: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', params.itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
