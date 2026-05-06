/**
 * POST /api/team/invite
 * Body: { email: string, role: string, message?: string }
 *
 * Crea una invitación en Clerk y registra en user_invitations.
 * Solo accesible por admins.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth, createClerkClient } from '@clerk/nextjs/server'
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

  const { email, role } = body
  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 })
  if (!role)  return NextResponse.json({ error: 'role requerido' }, { status: 400 })

  const rolesValidos = ['admin', 'redactor', 'seo', 'consultor']
  if (!rolesValidos.includes(role)) {
    return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  }

  // ── Diagnóstico de entorno ──────────────────────────────────────────────
  const secretKey    = process.env.CLERK_SECRET_KEY
  const baseUrl      = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://contentcopilot-ten.vercel.app').replace(/\/$/, '')
  const appUrl       = `${baseUrl}/sign-in`
  console.log('[invite] CLERK_SECRET_KEY present:', !!secretKey)
  console.log('[invite] CLERK_SECRET_KEY prefix:', secretKey?.slice(0, 8) ?? 'MISSING')
  console.log('[invite] redirectUrl:', appUrl)
  console.log('[invite] target email:', email, '| role:', role)

  if (!secretKey) {
    console.error('[invite] CLERK_SECRET_KEY no está definida en el entorno')
    return NextResponse.json({ error: 'Error de configuración del servidor (Clerk)' }, { status: 500 })
  }

  // ── Crear invitación en Clerk ───────────────────────────────────────────
  // Usamos createClerkClient con secretKey explícito — más fiable en API
  // routes que el clerkClient() contextual de Next.js.
  let clerkInvitationId: string | null = null

  try {
    console.log('[invite] Creando cliente Clerk con secretKey explícito...')
    const clerk = createClerkClient({ secretKey })

    console.log('[invite] Llamando clerk.invitations.createInvitation...')
    const inv = await clerk.invitations.createInvitation({
      emailAddress  : email,
      redirectUrl   : appUrl,
      publicMetadata: { role },
    })

    clerkInvitationId = inv.id
    console.log('[invite] Clerk invitation creada OK — id:', clerkInvitationId, '| status:', inv.status)

  } catch (e: unknown) {
    // Loguear el objeto completo para diagnosticar en Vercel
    console.error('[invite] Clerk invitation FAILED — error completo:', e)

    const msg = e instanceof Error ? e.message : String(e)
    console.error('[invite] Clerk error message:', msg)

    // Si el email ya tiene una invitación pendiente en Clerk, no es un error fatal
    const yaInvitado = msg.includes('already been invited')
      || msg.includes('already exists')
      || msg.includes('duplicate')

    if (!yaInvitado) {
      // Error real de Clerk — devolver 500 para que el UI lo muestre
      return NextResponse.json(
        { error: `Error al crear invitación en Clerk: ${msg}` },
        { status: 500 },
      )
    }

    console.warn('[invite] Email ya invitado en Clerk — continuamos sin clerk_invitation_id')
  }

  // ── Registrar en user_invitations ───────────────────────────────────────
  console.log('[invite] Guardando en user_invitations — clerk_id:', clerkInvitationId)

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

  console.log('[invite] Invitación completada —', email, '| via_clerk:', !!clerkInvitationId)

  return NextResponse.json({
    ok                 : true,
    email,
    role,
    clerk_invitation_id: clerkInvitationId,
    via_clerk          : !!clerkInvitationId,
  })
}
