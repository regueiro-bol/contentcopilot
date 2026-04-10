/**
 * GET  /api/social/brand-voice?clientId=xxx
 * POST /api/social/brand-voice
 *
 * Gestiona social_brand_voice (Fase 4 — Tono y guidelines de marca).
 * register_by_platform es JSONB — se guarda como { "content": texto }.
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
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('social_brand_voice')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json(null)

  return NextResponse.json({
    ...data,
    register_by_platform: jsonbToText(data.register_by_platform),
  })
}

// ─── POST (upsert) ────────────────────────────────────────────────────────────

interface BrandVoicePayload {
  clientId               : string
  voiceManual?           : string | null
  registerByPlatform?    : string | null
  editorialRedLines?     : string | null
  consistencyGuidelines? : string | null
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: BrandVoicePayload
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('social_brand_voice')
    .upsert(
      {
        client_id              : body.clientId,
        voice_manual           : body.voiceManual           ?? null,
        register_by_platform   : textToJsonb(body.registerByPlatform),
        editorial_red_lines    : body.editorialRedLines     ?? null,
        consistency_guidelines : body.consistencyGuidelines ?? null,
        updated_at             : now,
      },
      { onConflict: 'client_id' },
    )
    .select()
    .single()

  if (error) {
    console.error('[social/brand-voice] Upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ...data,
    register_by_platform: jsonbToText(data.register_by_platform),
  })
}
