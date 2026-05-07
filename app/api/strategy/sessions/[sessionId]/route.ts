/**
 * PATCH /api/strategy/sessions/[sessionId]
 * Body: { archived: boolean }
 * Archiva o restaura una sesión de keyword research.
 *
 * DELETE /api/strategy/sessions/[sessionId]
 * Elimina definitivamente la sesión y sus keywords (CASCADE).
 */

import { auth }          from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body: { archived?: boolean } = await request.json().catch(() => ({}))
  const toArchive = body.archived !== false  // default: archive

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('keyword_research_sessions')
    .update({
      archived   : toArchive,
      archived_at: toArchive ? new Date().toISOString() : null,
    })
    .eq('id', params.sessionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  // Eliminar keywords primero (safety — DB CASCADE debería manejarlo)
  await supabase.from('keywords').delete().eq('session_id', params.sessionId)

  const { error } = await supabase
    .from('keyword_research_sessions')
    .delete()
    .eq('id', params.sessionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
