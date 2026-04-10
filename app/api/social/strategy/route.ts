/**
 * GET  /api/social/strategy?clientId=xxx
 * POST /api/social/strategy
 *
 * Gestiona social_strategy (Fase 2 — Estrategia de plataformas).
 * Upsert por client_id.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('social_strategy')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

// ─── POST (upsert) ────────────────────────────────────────────────────────────

interface StrategyPayload {
  clientId                : string
  platformDecisions?      : string | null
  channelArchitecture?    : string | null
  editorialDifferentiation?: string | null
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: StrategyPayload
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('social_strategy')
    .upsert(
      {
        client_id              : body.clientId,
        platform_decisions     : body.platformDecisions     ?? null,
        channel_architecture   : body.channelArchitecture   ?? null,
        editorial_differentiation: body.editorialDifferentiation ?? null,
        updated_at             : now,
      },
      { onConflict: 'client_id' },
    )
    .select()
    .single()

  if (error) {
    console.error('[social/strategy] Upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
