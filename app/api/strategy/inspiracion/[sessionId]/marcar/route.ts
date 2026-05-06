/**
 * POST /api/strategy/inspiracion/[sessionId]/marcar
 *
 * Toggle de oportunidad marcada para pasar como seed a la Fase 1.
 * Body: { oportunidad_id: string, marcada: boolean }
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { oportunidad_id?: string; marcada?: boolean }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON invalido' }, { status: 400 })
  }

  const { oportunidad_id, marcada } = body
  if (!oportunidad_id || typeof marcada !== 'boolean') {
    return NextResponse.json({ error: 'oportunidad_id y marcada son obligatorios' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Leer sesion
  const { data: session } = await supabase
    .from('inspiracion_sessions')
    .select('id, oportunidades_marcadas, resultado')
    .eq('id', params.sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Sesion no encontrada' }, { status: 404 })

  // Actualizar lista de IDs marcados
  const marcadasArr = (session.oportunidades_marcadas ?? []) as string[]
  const marcadasSet = new Set(marcadasArr)
  if (marcada) {
    marcadasSet.add(oportunidad_id)
  } else {
    marcadasSet.delete(oportunidad_id)
  }

  // Tambien actualizar el flag 'marcada' dentro del resultado.oportunidades
  const resultado = (session.resultado ?? {}) as Record<string, unknown>
  const oportunidades = (resultado.oportunidades ?? []) as Array<Record<string, unknown>>
  const updatedOps = oportunidades.map((op) =>
    op.id === oportunidad_id ? { ...op, marcada } : op,
  )
  resultado.oportunidades = updatedOps

  const { error } = await supabase
    .from('inspiracion_sessions')
    .update({
      oportunidades_marcadas: Array.from(marcadasSet),
      resultado,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.sessionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, marcadas: Array.from(marcadasSet) })
}
