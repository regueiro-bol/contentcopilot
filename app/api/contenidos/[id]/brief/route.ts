/**
 * PATCH /api/contenidos/[id]/brief
 * Body: { texto_generado: string }
 *
 * Persists the edited brief text back to contenidos.brief (jsonb).
 * Also re-parses tamanyo_texto_min/max from the new text.
 */

import { auth }            from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'

function parseExtension(text: string): { min: number | null; max: number | null } {
  const patterns = [
    /(\d[\d.,]*)\s*[–\-a]\s*(\d[\d.,]*)\s*palabras/i,
    /entre\s*(\d[\d.,]*)\s*y\s*(\d[\d.,]*)\s*palabras/i,
    /(\d[\d.,]*)\s*palabras/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const min = parseInt(match[1].replace(/[.,]/g, ''), 10)
      const max = match[2]
        ? parseInt(match[2].replace(/[.,]/g, ''), 10)
        : min + Math.round(min * 0.25)
      if (!isNaN(min) && min > 0) return { min, max: isNaN(max) ? null : max }
    }
  }
  return { min: null, max: null }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { texto_generado?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const texto = body.texto_generado
  if (typeof texto !== 'string' || !texto.trim()) {
    return NextResponse.json({ error: 'texto_generado requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const updatePayload: Record<string, unknown> = {
    brief     : { texto_generado: texto },
    updated_at: new Date().toISOString(),
  }

  // Re-parse extension so tamanyo_texto_min/max stay in sync with edits
  const { min, max } = parseExtension(texto)
  if (min !== null) {
    updatePayload.tamanyo_texto_min = min
    updatePayload.tamanyo_texto_max = max
  }

  const { error } = await supabase
    .from('contenidos')
    .update(updatePayload)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, tamanyo_texto_min: min, tamanyo_texto_max: max })
}
