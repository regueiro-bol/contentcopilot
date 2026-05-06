/**
 * GET /api/team/members           → lista todos los miembros (user_roles)
 * GET /api/team/members?userId=xx → permiso overrides de un usuario
 *
 * Solo accesible por admins.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  // Verificar que el solicitante es admin
  const { data: rolSolicitante } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (rolSolicitante?.role !== 'admin') {
    return NextResponse.json({ error: 'Solo admins' }, { status: 403 })
  }

  const targetUserId = req.nextUrl.searchParams.get('userId')

  // ── Si se pide un usuario específico: devolver sus overrides ────────────
  if (targetUserId) {
    const { data: perms } = await supabase
      .from('user_permissions')
      .select('permission, granted')
      .eq('user_id', targetUserId)

    return NextResponse.json({ permissions: perms ?? [] })
  }

  // ── Lista completa de miembros ───────────────────────────────────────────
  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('user_id, role, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enriquecer con datos de Clerk
  const clerk = await clerkClient()
  const members = await Promise.all(
    (roles ?? []).map(async (row) => {
      try {
        const user = await clerk.users.getUser(row.user_id)
        return {
          user_id   : row.user_id,
          role      : row.role,
          created_at: row.created_at,
          email     : user.emailAddresses[0]?.emailAddress ?? null,
          nombre    : [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
          avatar_url: user.imageUrl ?? null,
        }
      } catch {
        // Usuario no encontrado en Clerk (puede haber sido eliminado)
        return {
          user_id   : row.user_id,
          role      : row.role,
          created_at: row.created_at,
          email     : null,
          nombre    : null,
          avatar_url: null,
        }
      }
    }),
  )

  return NextResponse.json({ members })
}
