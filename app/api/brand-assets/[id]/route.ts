/**
 * PATCH  /api/brand-assets/[id] — actualiza campos editables (toggle approved…)
 * DELETE /api/brand-assets/[id] — borrado real del registro
 *
 * Los assets son referencias a Google Drive (drive_file_id/drive_url) — el
 * DELETE solo elimina el registro de brand_assets, nunca toca el Drive del
 * cliente. Devuelve fed_context=true si el asset era un brand book que
 * alimentó el brand_context actual, para que la UI avise de reprocesar.
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

export async function DELETE(
  _request: NextRequest,
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

  const supabase = createAdminClient()

  // 1. Leer el asset antes de borrarlo (para el chequeo de brand_context)
  const { data: asset, error: fetchError } = await supabase
    .from('brand_assets')
    .select('id, client_id, asset_type, drive_file_id, file_name')
    .eq('id', id)
    .single()

  if (fetchError || !asset) {
    return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 })
  }

  // 2. Borrado real del registro. Los ficheros viven en el Drive del cliente
  //    (solo guardamos la referencia) — no se toca ningún archivo físico.
  const { error: deleteError } = await supabase
    .from('brand_assets')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // 3. ¿Era un brand book que alimentó el brand_context actual?
  let fedContext = false
  if (asset.asset_type === 'brand_book' && asset.drive_file_id) {
    const { data: ctx } = await supabase
      .from('brand_context')
      .select('source_file_id, source_files')
      .eq('client_id', asset.client_id)
      .maybeSingle()

    if (ctx) {
      const enSourceFiles = Array.isArray(ctx.source_files)
        && (ctx.source_files as Array<{ drive_file_id?: string }>)
          .some((f) => f?.drive_file_id === asset.drive_file_id)
      fedContext = ctx.source_file_id === asset.drive_file_id || enSourceFiles
    }
  }

  return NextResponse.json({
    success: true,
    fed_context: fedContext,
    file_name: asset.file_name ?? null,
  })
}
