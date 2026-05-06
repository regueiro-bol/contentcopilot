/**
 * GET /api/social/strategy-status/[clientId]
 * Devuelve el estado de las 6 fases de la estrategia social para un cliente.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type PhaseStatus = { completed: boolean; approvedAt: string | null }

function phaseFromRow(
  row: Record<string, unknown> | null,
  completedKey: string,
  approvedAtKey: string,
): PhaseStatus {
  if (!row) return { completed: false, approvedAt: null }
  return {
    completed : Boolean(row[completedKey]),
    approvedAt: (row[approvedAtKey] as string | null) ?? null,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { clientId } = params
  const supabase = createAdminClient()

  const [
    { data: audit },
    { data: strategy },
    { data: architecture },
    { data: voice },
    { data: kpis },
    { data: actionPlan },
  ] = await Promise.all([
    supabase.from('social_audit_synthesis')      .select('phase_1_completed, phase_1_approved_at, client_validated, client_validated_at, revision_notes').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_strategy')             .select('phase_2_completed, phase_2_approved_at').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_content_architecture') .select('phase_3_completed, phase_3_approved_at').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_brand_voice')          .select('phase_4_completed, phase_4_approved_at').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_kpis')                 .select('phase_5_completed, phase_5_approved_at').eq('client_id', clientId).maybeSingle(),
    supabase.from('social_action_plan')          .select('phase_6_completed, phase_6_approved_at').eq('client_id', clientId).maybeSingle(),
  ])

  const phase1 = phaseFromRow(audit    as Record<string, unknown> | null, 'phase_1_completed', 'phase_1_approved_at')
  const phase2 = phaseFromRow(strategy as Record<string, unknown> | null, 'phase_2_completed', 'phase_2_approved_at')
  const phase3 = phaseFromRow(architecture as Record<string, unknown> | null, 'phase_3_completed', 'phase_3_approved_at')
  const phase4 = phaseFromRow(voice    as Record<string, unknown> | null, 'phase_4_completed', 'phase_4_approved_at')
  const phase5 = phaseFromRow(kpis     as Record<string, unknown> | null, 'phase_5_completed', 'phase_5_approved_at')
  const phase6 = phaseFromRow(actionPlan as Record<string, unknown> | null, 'phase_6_completed', 'phase_6_approved_at')

  const completedCount = [phase1, phase2, phase3, phase4, phase5, phase6].filter((p) => p.completed).length
  const overallStatus =
    completedCount === 0 ? 'not_started' :
    completedCount === 6 ? 'completed'   : 'in_progress'

  return NextResponse.json({
    phase1, phase2, phase3, phase4, phase5, phase6,
    completedCount,
    overallStatus,
    clientValidated  : Boolean((audit as Record<string, unknown> | null)?.client_validated),
    clientValidatedAt: ((audit as Record<string, unknown> | null)?.client_validated_at as string | null) ?? null,
    revisionNotes    : ((audit as Record<string, unknown> | null)?.revision_notes as string | null) ?? null,
  })
}
