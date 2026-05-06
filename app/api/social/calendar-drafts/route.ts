/**
 * GET    /api/social/calendar-drafts?clientId=xxx&status=pending
 * POST   /api/social/calendar-drafts — approve entries
 * DELETE /api/social/calendar-drafts?draftId=xxx — discard
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const clientId = searchParams.get('clientId')
  const status   = searchParams.get('status') ?? 'pending'

  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('social_calendar_drafts')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ─── POST (approve selected entries) ─────────────────────────────────────────

interface DraftEntry {
  scheduledDate   : string
  platform        : string
  format?         : string
  contentType?    : string
  title?          : string
  description?    : string
  blogContenidoId?: string | null
}

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { draftId: string; approvedEntries: DraftEntry[]; clientId: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { draftId, approvedEntries, clientId } = body
  if (!draftId || !approvedEntries?.length || !clientId) {
    return NextResponse.json({ error: 'draftId, clientId y approvedEntries son obligatorios' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Insert calendar entries
  const rows = approvedEntries.map((e) => ({
    client_id        : clientId,
    platform         : e.platform,
    scheduled_date   : e.scheduledDate,
    content_type     : e.contentType ?? null,
    format           : e.format ?? null,
    title            : e.title ?? null,
    description      : e.description ?? null,
    blog_contenido_id: e.blogContenidoId ?? null,
    status           : 'planificado',
    created_at       : now,
    updated_at       : now,
  }))

  const { error: insertError } = await supabase.from('social_calendar').insert(rows)

  if (insertError) {
    console.error('[calendar-drafts] Insert error:', insertError.message)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Mark draft as approved
  const { error: updateError } = await supabase
    .from('social_calendar_drafts')
    .update({ status: 'approved', reviewed_at: now })
    .eq('id', draftId)

  if (updateError) {
    console.error('[calendar-drafts] Update error:', updateError.message)
    // Non-fatal
  }

  return NextResponse.json({ created: rows.length, draftId })
}

// ─── DELETE (discard draft) ───────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const draftId = request.nextUrl.searchParams.get('draftId')
  if (!draftId) return NextResponse.json({ error: 'draftId requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('social_calendar_drafts')
    .update({ status: 'discarded', reviewed_at: new Date().toISOString() })
    .eq('id', draftId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
