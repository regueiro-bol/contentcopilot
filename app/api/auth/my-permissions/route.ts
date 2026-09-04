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
import { auth, createClerkClient } from '@clerk/nextjs/server'
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
    // No existe fila: modo invite-only → buscar invitación para este email.
    // Puede ocurrir si el webhook aún no procesó la creación del usuario.
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
    let email: string | null = null
    try {
      const user = await clerk.users.getUser(userId)
      email = user.emailAddresses[0]?.emailAddress ?? null
    } catch (e) {
      console.error('[my-permissions] Error obteniendo usuario Clerk:', e)
    }

    if (!email) {
      console.warn('[my-permissions] Sin email para userId:', userId)
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { data: inv } = await supabase
      .from('user_invitations')
      .select('role, permissions_preset, client_ids_preset')
      .eq('email', email.toLowerCase())
      .in('status', ['pendiente', 'aceptada'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!inv) {
      console.warn('[my-permissions] Sin invitación para email:', email)
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // Provisionar user_roles con el rol de la invitación
    const rolInv = inv.role ?? 'redactor'
    const { error: insErr } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: rolInv, activo: true })

    if (insErr && insErr.code !== '23505') {
      console.error('[my-permissions] Error provisionando user_roles:', insErr.message)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }

    // Aplicar overrides de permisos de la invitación
    if (inv.permissions_preset && typeof inv.permissions_preset === 'object') {
      const overrides = inv.permissions_preset as Record<string, boolean>
      const rows = Object.entries(overrides).map(([permission, granted]) => ({
        user_id: userId, permission, granted,
      }))
      if (rows.length > 0) {
        await supabase
          .from('user_permissions')
          .upsert(rows, { onConflict: 'user_id,permission' })
      }
    }

    // Aplicar restricción de clientes
    if (rolInv !== 'admin' && Array.isArray(inv.client_ids_preset) && inv.client_ids_preset.length > 0) {
      const rows = (inv.client_ids_preset as string[]).map((clientId) => ({
        user_id: userId, client_id: clientId,
      }))
      await supabase
        .from('client_assignments')
        .upsert(rows, { onConflict: 'user_id,client_id' })
    }

    console.log(`[my-permissions] Provisionado desde invitación — email:${email} role:${rolInv}`)
    role = rolInv
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
