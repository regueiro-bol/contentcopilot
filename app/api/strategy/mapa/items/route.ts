/**
 * POST /api/strategy/mapa/items
 * Crea un nuevo item en un mapa de contenido.
 */

import { auth }              from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminClient()

  try {
    const body = await request.json() as {
      map_id      : string
      title       : string
      main_keyword?: string
      funnel_stage?: string
      cluster?    : string
      fase?       : string
    }

    if (!body.map_id || !body.title) {
      return NextResponse.json({ error: 'map_id y title son requeridos' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('content_map_items')
      .insert({
        map_id      : body.map_id,
        title       : body.title,
        main_keyword: body.main_keyword ?? '',
        funnel_stage: body.funnel_stage ?? null,
        cluster     : body.cluster      ?? null,
        fase        : body.fase         ?? 'fase_1',
        validacion  : 'propuesto',
        status      : 'pendiente',
      })
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({ id: data.id, ok: true })
  } catch (err) {
    console.error('[mapa/items POST]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Error creando item' }, { status: 500 })
  }
}
