/**
 * GET  /api/social/kpis?clientId=xxx
 * POST /api/social/kpis
 *
 * Gestiona social_kpis (Fase 5 — KPIs y métricas).
 * kpis_by_objective es JSONB — se serializa como { "content": texto }.
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
    .from('social_kpis')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json(null)

  return NextResponse.json({
    ...data,
    kpis_by_objective: jsonbToText(data.kpis_by_objective),
  })
}

// ─── POST (upsert) ────────────────────────────────────────────────────────────

interface KPIsPayload {
  clientId               : string
  kpisByObjective?       : string | null
  measurementMethodology?: string | null
  reportingSystem?       : string | null
}

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: KPIsPayload
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('social_kpis')
    .upsert(
      {
        client_id              : body.clientId,
        kpis_by_objective      : textToJsonb(body.kpisByObjective),
        measurement_methodology: body.measurementMethodology ?? null,
        reporting_system       : body.reportingSystem        ?? null,
        updated_at             : now,
      },
      { onConflict: 'client_id' },
    )
    .select()
    .single()

  if (error) {
    console.error('[social/kpis] Upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ...data,
    kpis_by_objective: jsonbToText(data.kpis_by_objective),
  })
}
