/**
 * GET /api/auth/my-permissions
 *
 * Devuelve el rol base y los overrides granulares del usuario autenticado.
 * Auto-provision: si no existe fila en user_roles, se crea con rol 'redactor'.
 *   - Solo se provisiona cuando data === null sin error (fila inexistente).
 *   - Si activo === false, devuelve 403 sin crear nada.
 *
 * Response: { role: string, permissions: Record<string, boolean> }
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  // ── Leer fila de rol ──────────────────────────────────────────────────────
  const { data: rolRow, error: rolErr } = await supabase
    .from('user_roles')
    .select('role, activo')
    .eq('user_id', userId)
    .maybeSingle()

  // Error real de BD — no provisionar, no fallar silenciosamente
  if (rolErr) {
    console.error('[my-permissions] Error leyendo user_roles:', rolErr.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }

  // Cuenta desactivada — denegar acceso sin crear nada
  if (rolRow && rolRow.activo === false) {
    return NextResponse.json({ error: 'Cuenta desactivada' }, { status: 403 })
  }

  let role: string

  if (!rolRow) {
    // Fila inexistente (invite-only: solo llega aquí un usuario recién creado
    // cuyo webhook aún no procesó). Provisionar con rol mínimo.
    const { error: insErr } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: 'redactor', activo: true })

    if (insErr) {
      console.error('[my-permissions] Error provisionando user_roles:', insErr.message)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }
    role = 'redactor'
  } else {
    role = rolRow.role
  }

  // ── Overrides granulares ──────────────────────────────────────────────────
  const { data: rawPerms } = await supabase
    .from('user_permissions')
    .select('permission, granted')
    .eq('user_id', userId)

  const permissions: Record<string, boolean> = {}
  for (const p of rawPerms ?? []) {
    permissions[p.permission] = p.granted
  }

  return NextResponse.json({ role, permissions })
}
