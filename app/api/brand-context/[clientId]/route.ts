/**
 * PATCH /api/brand-context/[clientId]
 *
 * Actualiza los campos editables del contexto de marca de un cliente.
 * Usa service_role para bypassear RLS.
 *
 * Campos permitidos: colors, typography, tone_of_voice,
 *                    style_keywords, restrictions, raw_summary
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_FIELDS = [
  'colors',
  'typography',
  'tone_of_voice',
  'style_keywords',
  'restrictions',
  'raw_summary',
] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { clientId } = params
  if (!clientId) {
    return NextResponse.json({ error: 'clientId es requerido' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) patch[key] = body[key]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No hay campos válidos para actualizar' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Upsert: si no existe el registro, lo crea con los campos enviados
  const { data, error } = await supabase
    .from('brand_context')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ context: data })
}
