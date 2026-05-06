/**
 * POST /api/social/new-version
 *
 * Archiva la estrategia actual y resetea las fases 2–6 para permitir
 * comenzar una nueva versión desde cero.
 *
 * - Fase 1 (auditoría y benchmark) se conserva intacta.
 * - Las flags phase_N_completed y phase_N_approved_at se ponen a null
 *   en las tablas de fases 2–6.
 * - client_validated se resetea a false en social_audit_synthesis.
 *
 * Body: { clientId: string }
 * Returns: { ok: true, archivedAt: string }
 */

import { auth }          from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const PHASE_RESETS: Array<{
  table       : string
  completedKey: string
  approvedKey : string
}> = [
  { table: 'social_strategy',             completedKey: 'phase_2_completed', approvedKey: 'phase_2_approved_at' },
  { table: 'social_content_architecture', completedKey: 'phase_3_completed', approvedKey: 'phase_3_approved_at' },
  { table: 'social_brand_voice',          completedKey: 'phase_4_completed', approvedKey: 'phase_4_approved_at' },
  { table: 'social_kpis',                 completedKey: 'phase_5_completed', approvedKey: 'phase_5_approved_at' },
  { table: 'social_action_plan',          completedKey: 'phase_6_completed', approvedKey: 'phase_6_approved_at' },
]

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { clientId: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId } = body
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase   = createAdminClient()
  const archivedAt = new Date().toISOString()

  // ── Reset phases 2–6 in parallel ──
  const resetResults = await Promise.all(
    PHASE_RESETS.map(({ table, completedKey, approvedKey }) =>
      supabase
        .from(table)
        .update({
          [completedKey]: false,
          [approvedKey] : null,
          updated_at    : archivedAt,
        })
        .eq('client_id', clientId),
    ),
  )

  const phaseErrors = resetResults
    .map((r, i) => r.error ? `${PHASE_RESETS[i].table}: ${r.error.message}` : null)
    .filter(Boolean)

  if (phaseErrors.length > 0) {
    console.error('[new-version] Phase reset errors:', phaseErrors)
    return NextResponse.json({ error: phaseErrors.join('; ') }, { status: 500 })
  }

  // ── Reset client_validated in social_audit_synthesis ──
  const { error: validationError } = await supabase
    .from('social_audit_synthesis')
    .update({ client_validated: false, client_validated_at: null, updated_at: archivedAt })
    .eq('client_id', clientId)

  if (validationError) {
    console.error('[new-version] Validation reset error:', validationError.message)
    // Non-fatal — phases were already reset
  }

  return NextResponse.json({ ok: true, archivedAt })
}
