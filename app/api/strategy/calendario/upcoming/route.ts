/**
 * GET /api/strategy/calendario/upcoming?clientId=xxx&days=7
 *
 * Devuelve los próximos N días de publicaciones del calendario editorial.
 * Usado en el bloque "Próximas publicaciones" del dashboard de Estrategia.
 */

import { auth }          from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export interface UpcomingItem {
  id               : string
  titulo           : string
  keyword          : string | null
  fecha_publicacion: string
  status           : string
  fuente           : string | null
  funnel_stage     : string | null
  cluster          : string | null
  oportunidad_id   : string | null
}

export async function GET(req: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientId = req.nextUrl.searchParams.get('clientId')
  const days     = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') ?? '7', 10), 1), 30)

  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const supabase = createAdminClient()

  const hoy     = new Date()
  const inicio  = hoy.toISOString().slice(0, 10)
  const fin     = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + days)
    .toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('calendario_editorial')
    .select('id, titulo, keyword, fecha_publicacion, status, fuente, funnel_stage, cluster, oportunidad_id')
    .eq('client_id', clientId)
    .gte('fecha_publicacion', inicio)
    .lte('fecha_publicacion', fin)
    .neq('status', 'cancelado')
    .order('fecha_publicacion', { ascending: true })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: (data ?? []) as UpcomingItem[] })
}
