/**
 * GET  /api/clientes/[clientId]/referencias
 * POST /api/clientes/[clientId]/referencias
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('referencias_externas')
    .select('*, referencia_presencias(*)')
    .eq('client_id', params.clientId)
    .order('tipo')
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mapear presencias para consistencia
  const referencias = (data ?? []).map((r) => ({
    ...r,
    presencias: (r.referencia_presencias ?? []) as Array<{
      id: string
      plataforma: string
      url: string | null
      handle: string | null
      id_publicitario: string | null
      activo: boolean
    }>,
    referencia_presencias: undefined,
  }))

  return NextResponse.json({ referencias })
}

interface PresenciaInput {
  plataforma:       string
  url?:             string
  handle?:          string
  id_publicitario?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { nombre, tipo, categoria, notas, presencias } = body

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return NextResponse.json({ error: 'nombre es obligatorio' }, { status: 400 })
  }
  if (!tipo || !['competidor_editorial', 'competidor_publicitario', 'referente'].includes(tipo as string)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 1. Crear la referencia
  const { data: ref, error: refError } = await supabase
    .from('referencias_externas')
    .insert({
      client_id: params.clientId,
      nombre:    (nombre as string).trim(),
      tipo,
      categoria: categoria || null,
      notas:     (notas as string | undefined)?.trim() || null,
    })
    .select()
    .single()

  if (refError || !ref) {
    return NextResponse.json({ error: refError?.message ?? 'Error creando referencia' }, { status: 500 })
  }

  // 2. Crear presencias si las hay
  const presenciasInput = Array.isArray(presencias) ? (presencias as PresenciaInput[]) : []
  let presenciasData: Array<Record<string, unknown>> = []

  if (presenciasInput.length > 0) {
    const rows = presenciasInput
      .filter((p) => p.plataforma)
      .map((p) => ({
        referencia_id:   ref.id,
        plataforma:      p.plataforma,
        url:             p.url?.trim() || null,
        handle:          p.handle?.trim() || null,
        id_publicitario: p.id_publicitario?.trim() || null,
      }))

    if (rows.length > 0) {
      const { data: pData, error: pError } = await supabase
        .from('referencia_presencias')
        .insert(rows)
        .select()

      if (pError) {
        console.error('[referencias] Error creando presencias:', pError.message)
      }
      presenciasData = (pData ?? []) as Array<Record<string, unknown>>
    }
  }

  return NextResponse.json({
    referencia: { ...ref, presencias: presenciasData },
  }, { status: 201 })
}
