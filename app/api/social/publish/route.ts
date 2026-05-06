/**
 * POST /api/social/publish
 *
 * Marca una pieza como publicada.
 * Actualiza social_posts y opcionalmente social_calendar.
 *
 * Body: { postId, calendarEntryId?, publishedAt, publishedUrl?, publishedNotes? }
 * Returns: { success: true }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: {
    postId          : string
    calendarEntryId?: string
    publishedAt     : string
    publishedUrl?   : string
    publishedNotes? : string
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { postId, calendarEntryId, publishedAt, publishedUrl, publishedNotes } = body
  if (!postId || !publishedAt) {
    return NextResponse.json({ error: 'postId y publishedAt son obligatorios' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // 1. Actualizar social_posts
  const { error: postError } = await supabase
    .from('social_posts')
    .update({
      status          : 'publicado',
      published_at    : publishedAt,
      published_url   : publishedUrl   ?? null,
      published_notes : publishedNotes ?? null,
      updated_at      : now,
    })
    .eq('id', postId)

  if (postError) {
    console.error('[social/publish] Post update error:', postError.message)
    return NextResponse.json({ error: postError.message }, { status: 500 })
  }

  // 2. Actualizar social_calendar si hay calendarEntryId
  if (calendarEntryId) {
    const { error: calError } = await supabase
      .from('social_calendar')
      .update({ status: 'publicado', updated_at: now })
      .eq('id', calendarEntryId)

    if (calError) {
      // No fatal — log but continue
      console.error('[social/publish] Calendar update error:', calError.message)
    }
  }

  return NextResponse.json({ success: true })
}
