/**
 * POST /api/social/approve-phase
 * Marca una fase como completada/aprobada (usado para testing del wizard).
 * Body: { clientId: string, phase: 1 | 2 | 3 | 4 | 5 | 6 }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PHASE_CONFIG: Record<number, {
  table      : string
  completedKey: string
  approvedAtKey: string
}> = {
  1: { table: 'social_audit_synthesis',      completedKey: 'phase_1_completed', approvedAtKey: 'phase_1_approved_at' },
  2: { table: 'social_strategy',             completedKey: 'phase_2_completed', approvedAtKey: 'phase_2_approved_at' },
  3: { table: 'social_content_architecture', completedKey: 'phase_3_completed', approvedAtKey: 'phase_3_approved_at' },
  4: { table: 'social_brand_voice',          completedKey: 'phase_4_completed', approvedAtKey: 'phase_4_approved_at' },
  5: { table: 'social_kpis',                 completedKey: 'phase_5_completed', approvedAtKey: 'phase_5_approved_at' },
  6: { table: 'social_action_plan',          completedKey: 'phase_6_completed', approvedAtKey: 'phase_6_approved_at' },
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { clientId: string; phase: number; undo?: boolean }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clientId, phase, undo = false } = body
  if (!clientId || !phase || !PHASE_CONFIG[phase]) {
    return NextResponse.json({ error: 'clientId y phase (1-6) son obligatorios' }, { status: 400 })
  }

  const { table, completedKey, approvedAtKey } = PHASE_CONFIG[phase]
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Upsert: crea la fila si no existe, actualiza si existe
  const { error } = await supabase
    .from(table)
    .upsert(
      {
        client_id      : clientId,
        [completedKey] : !undo,
        [approvedAtKey]: undo ? null : now,
        updated_at     : now,
      },
      { onConflict: 'client_id' },
    )

  if (error) {
    console.error(`[social/approve-phase] Error fase ${phase}:`, error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, phase, completed: !undo, approvedAt: undo ? null : now })
}
