/**
 * GET /api/contenidos/[id]/preview
 *
 * Returns a lightweight preview of a contenido for the calendar panel:
 * { titulo, keyword_principal, estado, texto_contenido, brief }
 *
 * texto_contenido is truncated at ~2000 chars for performance.
 */

import { auth }            from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('contenidos')
    .select('id, titulo, keyword_principal, estado, texto_contenido, brief')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'No encontrado' }, { status: 404 })
  }

  // Truncate texto_contenido to ~2000 chars (saves bandwidth)
  const texto = typeof data.texto_contenido === 'string'
    ? data.texto_contenido.slice(0, 2200)
    : null

  return NextResponse.json({
    id                : data.id,
    titulo            : data.titulo,
    keyword_principal : data.keyword_principal,
    estado            : data.estado,
    texto_contenido   : texto,
    brief             : data.brief,
  })
}
