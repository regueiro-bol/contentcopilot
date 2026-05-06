/**
 * GET /api/auth/my-permissions
 *
 * Devuelve el rol base y los overrides granulares del usuario autenticado.
 * Si el usuario no tiene fila en user_roles, se le asigna 'redactor' por defecto.
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

  // ── Obtener o crear fila de rol ───────────────────────────────────────────
  const { data: rolRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  let role = rolRow?.role ?? 'redactor'

  if (!rolRow) {
    // Crear fila por defecto
    await supabase.from('user_roles').insert({ user_id: userId, role: 'redactor' })
    role = 'redactor'
  }

  // ── Obtener overrides granulares ──────────────────────────────────────────
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
