/**
 * GET  /api/social/architecture?clientId=xxx
 * POST /api/social/architecture
 *
 * Gestiona social_content_architecture (Fase 3 — Arquitectura de contenidos).
 * Los campos JSONB (editorial_pillars, formats_by_platform, publishing_cadence)
 * se guardan como { "content": "<texto libre>" }.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Helper: deserializa campo JSONB → texto plano
function jsonbToText(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null && 'content' in val) {
    return String((val as { content: string }).content)
  }
  return JSON.stringify(val)
}

// Helper: serializa texto → JSONB wrapper
function textToJsonb(text: string | null | undefined): { content: string } | null {
  if (!text) return null
  return { content: text }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('social_content_architecture')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json(null)

  // Normalizar JSONB → texto para el cliente
  return NextResponse.json({
    ...data,
    editorial_pillars   : jsonbToText(data.editorial_pillars),
    formats_by_platform : jsonbToText(data.formats_by_platform),
    publishing_cadence  : jsonbToText(data.publishing_cadence),
  })
}

// ─── POST (upsert) ────────────────────────────────────────────────────────────

interface ArchitecturePayload {
  clientId          : string
  editorialPillars? : string | null
  formatsByPlatform?: string | null
  publishingCadence?: string | null
  calendarTemplate? : string | null
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: ArchitecturePayload
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('social_content_architecture')
    .upsert(
      {
        client_id           : body.clientId,
        editorial_pillars   : textToJsonb(body.editorialPillars),
        formats_by_platform : textToJsonb(body.formatsByPlatform),
        publishing_cadence  : textToJsonb(body.publishingCadence),
        calendar_template   : body.calendarTemplate ?? null,
        updated_at          : now,
      },
      { onConflict: 'client_id' },
    )
    .select()
    .single()

  if (error) {
    console.error('[social/architecture] Upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Normalizar respuesta igual que en GET
  return NextResponse.json({
    ...data,
    editorial_pillars   : jsonbToText(data.editorial_pillars),
    formats_by_platform : jsonbToText(data.formats_by_platform),
    publishing_cadence  : jsonbToText(data.publishing_cadence),
  })
}
