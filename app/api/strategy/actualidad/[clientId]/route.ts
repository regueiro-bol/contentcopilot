/**
 * GET /api/strategy/actualidad/[clientId]
 *
 * Devuelve oportunidades activas del cliente sin regenerar.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('oportunidades_actualidad')
    .select('*')
    .eq('client_id', params.clientId)
    .eq('activa', true)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = data ?? []
  return NextResponse.json({
    trending:   items.filter((i) => i.tipo === 'trending'),
    estacional: items.filter((i) => i.tipo === 'estacional'),
  })
}
