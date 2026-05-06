/**
 * PATCH /api/ad-creatives/[id]/status
 *
 * Actualiza el status de un creative: 'draft' | 'approved' | 'rejected'
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = params

  let body: { status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const validStatuses = ['draft', 'approved', 'rejected']
  if (!body.status || !validStatuses.includes(body.status)) {
    return NextResponse.json(
      { error: `status inválido. Valores permitidos: ${validStatuses.join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('ad_creatives')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ creative: data })
}
