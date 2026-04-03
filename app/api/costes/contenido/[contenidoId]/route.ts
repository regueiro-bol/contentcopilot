/**
 * GET /api/costes/contenido/[contenidoId]
 *
 * Devuelve el desglose de costes de un contenido consultando la vista
 * `vista_costes_contenido`. Usado para actualizar el badge de coste
 * en tiempo real en el detalle de contenido.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: { contenidoId: string } },
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('vista_costes_contenido')
      .select('coste_total, coste_texto, coste_imagenes, coste_rag')
      .eq('contenido_id', params.contenidoId)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      return NextResponse.json({ costes: null })
    }

    return NextResponse.json({
      costes: {
        coste_total   : Number(data.coste_total)    || 0,
        coste_texto   : Number(data.coste_texto)    || 0,
        coste_imagenes: Number(data.coste_imagenes) || 0,
        coste_rag     : Number(data.coste_rag)      || 0,
      },
    })
  } catch {
    // La vista puede no existir en entornos sin la migración aplicada
    return NextResponse.json({ costes: null })
  }
}
