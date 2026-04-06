/**
 * GET  /api/clientes/[clientId]/referencias
 * POST /api/clientes/[clientId]/referencias
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('referencias_externas')
    .select('*')
    .eq('client_id', params.clientId)
    .order('tipo')
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ referencias: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { nombre, url, tipo, categoria, plataforma, handle_rrss, notas } = body

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return NextResponse.json({ error: 'nombre es obligatorio' }, { status: 400 })
  }
  if (!tipo || !['competidor_editorial', 'competidor_publicitario', 'referente'].includes(tipo as string)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('referencias_externas')
    .insert({
      client_id:   params.clientId,
      nombre:      (nombre as string).trim(),
      url:         (url as string | undefined)?.trim() || null,
      tipo,
      categoria:   categoria || null,
      plataforma:  plataforma || 'web',
      handle_rrss: (handle_rrss as string | undefined)?.trim() || null,
      notas:       (notas as string | undefined)?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ referencia: data }, { status: 201 })
}
