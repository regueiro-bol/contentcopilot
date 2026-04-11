import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ─── GET: list entries for a month ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const month    = searchParams.get('month') // YYYY-MM

  if (!clientId || !month) {
    return NextResponse.json({ error: 'clientId and month required' }, { status: 400 })
  }

  const [year, mon] = month.split('-').map(Number)
  const startDate   = new Date(year, mon - 1, 1).toISOString().split('T')[0]
  const endDate     = new Date(year, mon, 0).toISOString().split('T')[0]

  const supabase = createAdminClient()

  // ── Query 1: calendar entries (plain, no JOIN) ──
  const { data: entries, error } = await supabase
    .from('social_calendar')
    .select('*')
    .eq('client_id', clientId)
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)
    .order('scheduled_date', { ascending: true })
    .order('platform',        { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Query 2: linked social_posts (only when entries have social_post_id) ──
  // FK direction: social_calendar.social_post_id → social_posts.id
  const postIds = (entries ?? [])
    .map((e: any) => e.social_post_id)
    .filter(Boolean) as string[]

  let postsMap: Record<string, { status: string; asset_url: string | null; humanized: boolean | null; copy_approved: boolean | null }> = {}

  if (postIds.length > 0) {
    const { data: posts } = await supabase
      .from('social_posts')
      .select('id, status, asset_url, humanized, copy_approved')
      .in('id', postIds)

    for (const p of posts ?? []) {
      postsMap[(p as any).id] = p as any
    }
  }

  // ── Merge: enrich each entry with its linked post fields ──
  const enriched = (entries ?? []).map((entry: any) => {
    const post = entry.social_post_id ? postsMap[entry.social_post_id] : null
    return {
      ...entry,
      post_status   : post?.status       ?? null,
      post_asset_url: post?.asset_url    ?? null,
      post_humanized: post?.humanized    ?? null,
      post_has_copy : post?.copy_approved != null ? !!post.copy_approved : false,
    }
  })

  return NextResponse.json(enriched)
}

// ─── POST: create a new entry ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    clientId       : string
    platform       : string
    scheduledDate  : string
    contentType?   : string
    format?        : string
    title?         : string
    description?   : string
    status?        : string
    blogContenidoId?: string | null
  }

  const { clientId, platform, scheduledDate, contentType, format, title, description, status, blogContenidoId } = body

  if (!clientId || !platform || !scheduledDate) {
    return NextResponse.json({ error: 'clientId, platform, and scheduledDate required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('social_calendar')
    .insert({
      client_id       : clientId,
      platform,
      scheduled_date  : scheduledDate,
      content_type    : contentType   ?? null,
      format          : format        ?? null,
      title           : title         ?? null,
      description     : description   ?? null,
      status          : status        ?? 'planificado',
      blog_contenido_id: blogContenidoId ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── PATCH: update an entry ───────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json() as Record<string, unknown>

  // Map camelCase to snake_case for known fields
  const updatePayload: Record<string, unknown> = {}
  if ('platform'       in body) updatePayload['platform']         = body.platform
  if ('scheduledDate'  in body) updatePayload['scheduled_date']   = body.scheduledDate
  if ('contentType'    in body) updatePayload['content_type']     = body.contentType
  if ('format'         in body) updatePayload['format']           = body.format
  if ('title'          in body) updatePayload['title']            = body.title
  if ('description'    in body) updatePayload['description']      = body.description
  if ('status'         in body) updatePayload['status']           = body.status
  if ('blogContenidoId' in body) updatePayload['blog_contenido_id'] = body.blogContenidoId

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('social_calendar')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── DELETE: remove an entry ──────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('social_calendar')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
