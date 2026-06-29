/**
 * GET /api/rag/status?proyecto_id=UUID
 *
 * Devuelve el número de chunks en documentos_rag por documento_id
 * para un proyecto dado. Usado para detectar si un documento ya
 * ha sido procesado independientemente del campo estado_rag del JSONB.
 *
 * Response: { [documento_id: string]: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const proyectoId = request.nextUrl.searchParams.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'proyecto_id requerido' }, { status: 400 })

  const supabase = createAdminClient()

  // Traemos solo el campo metadatos para extraer documento_id
  const { data, error } = await supabase
    .from('documentos_rag')
    .select('metadatos')
    .eq('proyecto_id', proyectoId)

  if (error) {
    console.error('[RAG status]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Agrupar por documento_id
  const chunksPorDoc: Record<string, number> = {}
  for (const row of data ?? []) {
    const docId = (row.metadatos as Record<string, string> | null)?.documento_id
    if (docId) {
      chunksPorDoc[docId] = (chunksPorDoc[docId] ?? 0) + 1
    }
  }

  return NextResponse.json(chunksPorDoc)
}
