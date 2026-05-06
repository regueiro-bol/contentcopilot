/**
 * POST /api/team/invite
 * Body: { email: string, role: string, message?: string }
 *
 * Crea una invitación en Clerk y registra en user_invitations.
 * Solo accesible por admins.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  // Verificar admin
  const { data: rol } = await supabase
    .from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  if (rol?.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

  let body: { email?: string; role?: string; message?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { email, role, message } = body
  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 })
  if (!role)  return NextResponse.json({ error: 'role requerido' }, { status: 400 })

  const rolesValidos = ['admin', 'redactor', 'seo', 'consultor']
  if (!rolesValidos.includes(role)) {
    return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  }

  // ── Intentar crear invitación en Clerk ──────────────────────────────────
  let clerkInvitationId: string | null = null

  try {
    const clerk = await clerkClient()
    const inv   = await clerk.invitations.createInvitation({
      emailAddress  : email,
      redirectUrl   : process.env.NEXT_PUBLIC_APP_URL ?? 'https://contentcopilot-ten.vercel.app',
      publicMetadata: { role },
      ...(message ? { } : {}),  // Clerk no soporta mensaje personalizado via SDK
    })
    clerkInvitationId = inv.id
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // Si la invitación ya existe en Clerk, continuamos igualmente
    if (!msg.includes('already been invited') && !msg.includes('already exists')) {
      console.error('[invite] Clerk error:', msg)
      // No bloqueamos — registramos sin clerk_invitation_id
    }
  }

  // ── Registrar en user_invitations (upsert por email) ───────────────────
  const { error: dbErr } = await supabase
    .from('user_invitations')
    .upsert(
      {
        email               : email.toLowerCase(),
        role,
        invited_by          : userId,
        clerk_invitation_id : clerkInvitationId,
        status              : 'pendiente',
        created_at          : new Date().toISOString(),
      },
      { onConflict: 'email' },
    )

  if (dbErr) {
    console.error('[invite] DB error:', dbErr.message)
    return NextResponse.json({ error: 'Error guardando invitación' }, { status: 500 })
  }

  return NextResponse.json({
    ok                 : true,
    email,
    role,
    clerk_invitation_id: clerkInvitationId,
    via_clerk          : !!clerkInvitationId,
  })
}
