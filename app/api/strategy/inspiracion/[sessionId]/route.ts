/**
 * GET /api/strategy/inspiracion/[sessionId]
 *
 * Devuelve la sesion de inspiracion completa con resultado y oportunidades.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('inspiracion_sessions')
    .select('*, clientes(nombre, sector)')
    .eq('id', params.sessionId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Sesion no encontrada' }, { status: 404 })
  }

  return NextResponse.json({ session: data })
}
