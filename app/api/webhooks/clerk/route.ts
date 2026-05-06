/**
 * POST /api/webhooks/clerk
 *
 * Webhook de Clerk — maneja eventos de usuario.
 *
 * Eventos:
 * - user.created: Asignar rol desde publicMetadata y marcar invitación como aceptada
 *
 * Configurar en Clerk Dashboard:
 *   URL: https://contentcopilot-ten.vercel.app/api/webhooks/clerk
 *   Eventos: user.created
 *   Secret: CLERK_WEBHOOK_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface ClerkUserEvent {
  type: string
  data: {
    id                : string
    email_addresses   : Array<{ email_address: string }>
    first_name        : string | null
    last_name         : string | null
    public_metadata   : { role?: string }
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET

  // Si no hay secret configurado, rechazar (excepto en development)
  if (!webhookSecret) {
    console.warn('[webhook/clerk] CLERK_WEBHOOK_SECRET no configurado')
    return NextResponse.json({ error: 'Webhook secret no configurado' }, { status: 500 })
  }

  // ── Verificar firma svix ─────────────────────────────────────────────────
  const svixId        = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Cabeceras svix requeridas' }, { status: 400 })
  }

  const body = await req.text()

  let event: ClerkUserEvent
  try {
    const wh   = new Webhook(webhookSecret)
    event      = wh.verify(body, {
      'svix-id'       : svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkUserEvent
  } catch (err) {
    console.error('[webhook/clerk] Firma inválida:', err)
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 })
  }

  // ── Manejar user.created ─────────────────────────────────────────────────
  if (event.type === 'user.created') {
    const { id: clerkUserId, email_addresses, public_metadata } = event.data
    const email = email_addresses[0]?.email_address ?? null
    const role  = (public_metadata?.role as string) ?? 'redactor'

    const supabase = createAdminClient()

    // Insertar en user_roles (ignorar si ya existe)
    await supabase
      .from('user_roles')
      .upsert(
        { user_id: clerkUserId, role, created_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )

    // Marcar invitación como aceptada
    if (email) {
      await supabase
        .from('user_invitations')
        .update({ status: 'aceptada', accepted_at: new Date().toISOString() })
        .eq('email', email.toLowerCase())
        .eq('status', 'pendiente')
    }

    console.log(`[webhook/clerk] user.created → userId=${clerkUserId} role=${role}`)
  }

  return NextResponse.json({ ok: true })
}
