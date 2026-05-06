/**
 * PATCH /api/team/update-member
 * Body: { userId: string, role: string, permissions: Record<string, boolean> }
 *
 * 1. Actualiza user_roles SET role
 * 2. Para permisos que difieren del rol base → UPSERT user_permissions
 * 3. Para permisos que coinciden con el rol base → DELETE override innecesario
 *
 * Solo accesible por admins.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { roleHasPermission, type Permission } from '@/lib/permissions'

export async function PATCH(req: NextRequest) {
  const { userId: requesterId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!requesterId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  // Verificar admin
  const { data: rolSolicitante } = await supabase
    .from('user_roles').select('role').eq('user_id', requesterId).maybeSingle()
  if (rolSolicitante?.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

  let body: { userId?: string; role?: string; permissions?: Record<string, boolean> }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { userId, role, permissions = {} } = body
  if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })
  if (!role)   return NextResponse.json({ error: 'role requerido' }, { status: 400 })

  // ── 1. Actualizar rol ────────────────────────────────────────────────────
  const { error: roleErr } = await supabase
    .from('user_roles')
    .upsert(
      { user_id: userId, role, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )

  if (roleErr) {
    return NextResponse.json({ error: 'Error actualizando rol' }, { status: 500 })
  }

  // ── 2. Procesar overrides de permisos ────────────────────────────────────
  const toUpsert: { user_id: string; permission: string; granted: boolean }[] = []
  const toDelete: string[] = []

  for (const [perm, granted] of Object.entries(permissions)) {
    const rolBase = roleHasPermission(role, perm as Permission)
    if (granted === rolBase) {
      // Coincide con rol base → eliminar override si existe
      toDelete.push(perm)
    } else {
      // Difiere → guardar override
      toUpsert.push({ user_id: userId, permission: perm, granted })
    }
  }

  // Upsert overrides
  if (toUpsert.length > 0) {
    const { error: upErr } = await supabase
      .from('user_permissions')
      .upsert(toUpsert, { onConflict: 'user_id,permission' })
    if (upErr) console.error('[update-member] upsert perms:', upErr.message)
  }

  // Eliminar overrides innecesarios
  if (toDelete.length > 0) {
    await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      .in('permission', toDelete)
  }

  return NextResponse.json({ ok: true, role, overrides_saved: toUpsert.length, overrides_deleted: toDelete.length })
}
