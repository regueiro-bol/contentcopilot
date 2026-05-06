/**
 * GET  /api/social/platforms?clientId=xxx
 * POST /api/social/platforms
 *
 * Gestiona la tabla social_platforms (una fila por cliente+plataforma).
 * POST hace upsert (onConflict: client_id,platform).
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('social_platforms')
    .select('*')
    .eq('client_id', clientId)
    .order('platform')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ─── POST (upsert) ────────────────────────────────────────────────────────────

interface PlatformPayload {
  client_id            : string
  platform             : string
  is_active?           : boolean
  handle?              : string | null
  profile_url?         : string | null
  followers?           : number | null
  following?           : number | null
  posts_per_week?      : number | null
  avg_engagement?      : number | null
  last_post_date?      : string | null
  formats_used?        : string[]
  main_topics?         : string | null
  top_post_example?    : string | null
  score_brand_consistency? : number | null
  score_editorial_quality? : number | null
  score_activity?          : number | null
  score_community?         : number | null
  observations?            : string | null
  strategic_conclusion?    : string | null
  strategic_priority?      : string | null
}

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: PlatformPayload
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.client_id || !body.platform) {
    return NextResponse.json({ error: 'client_id y platform son obligatorios' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('social_platforms')
    .upsert(
      { ...body, updated_at: now },
      { onConflict: 'client_id,platform' },
    )
    .select()
    .single()

  if (error) {
    console.error('[social/platforms] Upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
