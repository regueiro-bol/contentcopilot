/**
 * PATCH /api/team/update-member
 * Body: { userId: string, role: string, permissions: Record<string, boolean>, activo?: boolean }
 *
 * 1. Guarda el rol y los overrides de permisos
 * 2. Si `activo` está en el body, actualiza ese campo
 *
 * Validaciones de seguridad:
 *   - Un admin no puede desactivarse a sí mismo
 *   - No se puede desactivar al último admin activo
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

  let body: { userId?: string; role?: string; permissions?: Record<string, boolean>; activo?: boolean }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { userId, role, permissions = {}, activo } = body
  if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })
  if (!role)   return NextResponse.json({ error: 'role requerido' }, { status: 400 })

  // ── Validaciones de desactivación ────────────────────────────────────────
  if (activo === false) {
    // Un admin no puede desactivarse a sí mismo
    if (userId === requesterId) {
      return NextResponse.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 400 })
    }

    // Comprobar si el miembro a desactivar es admin y si es el último activo
    const { data: targetRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()

    if (targetRow?.role === 'admin') {
      const { count } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('activo', true)

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'No puedes desactivar al último administrador activo' },
          { status: 400 },
        )
      }
    }
  }

  // ── 1. Actualizar rol (y activo si se envía) ──────────────────────────────
  const upsertPayload: Record<string, unknown> = {
    user_id   : userId,
    role,
    updated_at: new Date().toISOString(),
  }
  if (typeof activo === 'boolean') {
    upsertPayload.activo = activo
  }

  const { error: roleErr } = await supabase
    .from('user_roles')
    .upsert(upsertPayload, { onConflict: 'user_id' })

  if (roleErr) {
    return NextResponse.json({ error: 'Error actualizando rol' }, { status: 500 })
  }

  // ── 2. Procesar overrides de permisos ────────────────────────────────────
  const toUpsert: { user_id: string; permission: string; granted: boolean }[] = []
  const toDelete: string[] = []

  for (const [perm, granted] of Object.entries(permissions)) {
    const rolBase = roleHasPermission(role, perm as Permission)
    if (granted === rolBase) {
      toDelete.push(perm)
    } else {
      toUpsert.push({ user_id: userId, permission: perm, granted })
    }
  }

  if (toUpsert.length > 0) {
    const { error: upErr } = await supabase
      .from('user_permissions')
      .upsert(toUpsert, { onConflict: 'user_id,permission' })
    if (upErr) console.error('[update-member] upsert perms:', upErr.message)
  }

  if (toDelete.length > 0) {
    await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      .in('permission', toDelete)
  }

  return NextResponse.json({
    ok             : true,
    role,
    activo         : activo ?? undefined,
    overrides_saved: toUpsert.length,
    overrides_deleted: toDelete.length,
  })
}
