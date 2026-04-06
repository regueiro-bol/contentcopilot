/**
 * POST   /api/clientes/[clientId]/referencias/[refId]/presencias
 * DELETE /api/clientes/[clientId]/referencias/[refId]/presencias?id=...
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string; refId: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { plataforma, url, handle, id_publicitario } = body

  if (!plataforma || typeof plataforma !== 'string') {
    return NextResponse.json({ error: 'plataforma es obligatorio' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verificar que la referencia pertenece al cliente
  const { data: ref } = await supabase
    .from('referencias_externas')
    .select('id')
    .eq('id', params.refId)
    .eq('client_id', params.clientId)
    .single()

  if (!ref) {
    return NextResponse.json({ error: 'Referencia no encontrada' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('referencia_presencias')
    .insert({
      referencia_id:   params.refId,
      plataforma,
      url:             (url as string | undefined)?.trim() || null,
      handle:          (handle as string | undefined)?.trim() || null,
      id_publicitario: (id_publicitario as string | undefined)?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ presencia: data }, { status: 201 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { clientId: string; refId: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const presenciaId = request.nextUrl.searchParams.get('id')
  if (!presenciaId) {
    return NextResponse.json({ error: 'id de presencia requerido (?id=...)' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('referencia_presencias')
    .delete()
    .eq('id', presenciaId)
    .eq('referencia_id', params.refId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
