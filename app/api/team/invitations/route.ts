/**
 * GET    /api/team/invitations       → lista invitaciones pendientes
 * DELETE /api/team/invitations?id=xx → cancela una invitación
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth, createClerkClient } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  // Verificar admin
  const { data: rol } = await supabase
    .from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  if (rol?.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

  const { data: invitations, error } = await supabase
    .from('user_invitations')
    .select('id, email, role, created_at, status, clerk_invitation_id')
    .eq('status', 'pendiente')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invitations: invitations ?? [] })
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase   = createAdminClient()
  const invId      = req.nextUrl.searchParams.get('id')

  if (!invId) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Verificar admin
  const { data: rol } = await supabase
    .from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  if (rol?.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

  // Obtener clerk_invitation_id para revocar en Clerk
  const { data: inv } = await supabase
    .from('user_invitations')
    .select('clerk_invitation_id')
    .eq('id', invId)
    .maybeSingle()

  if (inv?.clerk_invitation_id) {
    try {
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
      await clerk.invitations.revokeInvitation(inv.clerk_invitation_id)
    } catch (e) {
      console.warn('[invitations] No se pudo revocar en Clerk:', e instanceof Error ? e.message : e)
    }
  }

  await supabase
    .from('user_invitations')
    .update({ status: 'cancelada' })
    .eq('id', invId)

  return NextResponse.json({ ok: true })
}
