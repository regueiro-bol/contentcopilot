/**
 * GET  /api/social/validate-strategy?clientId=xxx
 *      Devuelve el estado de validación del cliente.
 *
 * POST /api/social/validate-strategy
 *      Body: { clientId, validated: boolean, notes?: string }
 *      Activa o desactiva la validación por cliente.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('social_audit_synthesis')
    .select('client_validated, client_validated_at, revision_notes, current_version')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) {
    console.error('[validate-strategy] GET error:', error.message, { clientId })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    clientValidated  : data?.client_validated    ?? false,
    clientValidatedAt: data?.client_validated_at ?? null,
    revisionNotes    : data?.revision_notes      ?? '',
    currentVersion   : data?.current_version     ?? 1,
  })
}

export async function POST(request: NextRequest) {
  let body: { clientId: string; validated: boolean; notes?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId, validated, notes } = body
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()

  // Upsert — crea el registro si no existe (puede que aún no haya auditoría)
  const { error } = await supabase
    .from('social_audit_synthesis')
    .upsert(
      {
        client_id          : clientId,
        client_validated   : validated,
        client_validated_at: validated ? new Date().toISOString() : null,
        revision_notes     : notes ?? null,
        updated_at         : new Date().toISOString(),
      },
      { onConflict: 'client_id' },
    )

  if (error) {
    console.error('[validate-strategy] POST upsert error:', error.message, { clientId, validated })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    clientValidated  : validated,
    clientValidatedAt: validated ? new Date().toISOString() : null,
    revisionNotes    : notes ?? null,
  })
}
