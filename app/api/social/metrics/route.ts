/**
 * GET  /api/social/metrics?clientId=xxx&month=YYYY-MM
 *      /api/social/metrics?clientId=xxx&months=6
 * POST /api/social/metrics — upsert metrics for a platform+month
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Normalize any YYYY-MM or YYYY-MM-DD to first day of month: YYYY-MM-01 */
function firstOfMonth(input: string): string {
  const [year, month] = input.split('-')
  return `${year}-${month.padStart(2, '0')}-01`
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const clientId = searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()

  // Single month fetch
  const monthParam = searchParams.get('month')
  if (monthParam) {
    const month = firstOfMonth(monthParam)
    const { data, error } = await supabase
      .from('social_metrics')
      .select('*')
      .eq('client_id', clientId)
      .eq('month', month)
      .order('platform', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // Multi-month history fetch
  const monthsParam = parseInt(searchParams.get('months') ?? '6', 10)
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - (monthsParam - 1))
  const cutoff = firstOfMonth(`${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`)

  const { data, error } = await supabase
    .from('social_metrics')
    .select('*')
    .eq('client_id', clientId)
    .gte('month', cutoff)
    .order('month', { ascending: false })
    .order('platform', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ─── POST (upsert) ────────────────────────────────────────────────────────────

interface MetricsPayload {
  clientId             : string
  platform             : string
  month                : string // YYYY-MM
  followersEnd?        : number | null
  followersGrowth?     : number | null
  avgEngagement?       : number | null
  totalImpressions?    : number | null
  totalReach?          : number | null
  totalInteractions?   : number | null
  postsPublished?      : number | null
  bestPostUrl?         : string | null
  bestPostImpressions? : number | null
  notes?               : string | null
}

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: MetricsPayload
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.clientId || !body.platform || !body.month) {
    return NextResponse.json({ error: 'clientId, platform y month son obligatorios' }, { status: 400 })
  }

  const month = firstOfMonth(body.month)
  const now   = new Date().toISOString()

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('social_metrics')
    .upsert(
      {
        client_id           : body.clientId,
        platform            : body.platform,
        month,
        followers_end       : body.followersEnd        ?? null,
        followers_growth    : body.followersGrowth     ?? null,
        avg_engagement      : body.avgEngagement       ?? null,
        total_impressions   : body.totalImpressions    ?? null,
        total_reach         : body.totalReach          ?? null,
        total_interactions  : body.totalInteractions   ?? null,
        posts_published     : body.postsPublished      ?? null,
        best_post_url       : body.bestPostUrl         ?? null,
        best_post_impressions: body.bestPostImpressions ?? null,
        notes               : body.notes               ?? null,
        updated_at          : now,
      },
      { onConflict: 'client_id,platform,month' },
    )
    .select()
    .single()

  if (error) {
    console.error('[social/metrics] Upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
