/**
 * PATCH /api/brand-assets/[id]
 *
 * Actualiza campos editables de un activo de marca.
 * Principalmente usado para hacer toggle de `approved`.
 * Usa service_role para bypassear RLS.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = params
  if (!id) {
    return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  // Whitelist de campos permitidos para actualizar desde la UI
  const allowed = ['approved', 'active', 'metadata', 'file_name', 'mime_type', 'drive_url']
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No hay campos válidos para actualizar' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('brand_assets')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ asset: data })
}
