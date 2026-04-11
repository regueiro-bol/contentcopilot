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
  const { data, error } = await supabase
    .from('social_calendar')
    .select('*')
    .eq('client_id', clientId)
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)
    .order('scheduled_date', { ascending: true })
    .order('platform',        { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
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
