/**
 * GET  /api/social/action-plan?clientId=xxx
 * POST /api/social/action-plan
 *
 * Gestiona social_action_plan (Fase 6 — Plan de acción).
 * roadmap es JSONB — se serializa como { "content": texto }.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function jsonbToText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && 'content' in val) {
    return String((val as { content: string }).content)
  }
  return JSON.stringify(val)
}

function textToJsonb(text: string | null | undefined): { content: string } | null {
  if (!text) return null
  return { content: text }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('social_action_plan')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json(null)

  return NextResponse.json({
    ...data,
    roadmap: jsonbToText(data.roadmap),
  })
}

// ─── POST (upsert) ────────────────────────────────────────────────────────────

interface ActionPlanPayload {
  clientId      : string
  roadmap?      : string | null
  first90Days?  : string | null
  teamResources?: string | null
}

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: ActionPlanPayload
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('social_action_plan')
    .upsert(
      {
        client_id    : body.clientId,
        roadmap      : textToJsonb(body.roadmap),
        first_90_days: body.first90Days   ?? null,
        team_resources: body.teamResources ?? null,
        updated_at   : now,
      },
      { onConflict: 'client_id' },
    )
    .select()
    .single()

  if (error) {
    console.error('[social/action-plan] Upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ...data,
    roadmap: jsonbToText(data.roadmap),
  })
}
