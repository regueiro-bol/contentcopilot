/**
 * GET /api/strategy/mapa/unified?client_id=...
 *
 * Devuelve en paralelo:
 *   - content_map_items del cliente (via JOIN content_maps)
 *   - oportunidades_actualidad activas y no caducadas
 *   - stats: total / aprobados / revision / rechazados
 *
 * También limpia oportunidades caducadas en background (fire-and-forget).
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { userId } = await auth().catch(() => ({ userId: null as string | null }))
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const client_id = request.nextUrl.searchParams.get('client_id')
  if (!client_id) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // ── Limpiar oportunidades caducadas (fire-and-forget) ────
  void supabase
    .from('oportunidades_actualidad')
    .update({ activa: false })
    .eq('client_id', client_id)
    .eq('activa', true)
    .lt('expires_at', now)
    .then(undefined, (e: unknown) => console.error('[mapa/unified] limpieza caducadas:', e))

  // ── Queries paralelas ────────────────────────────────────
  const [mapsResult, opResult, gscOpResult] = await Promise.allSettled([
    // 1. IDs de content_maps para este cliente
    supabase
      .from('content_maps')
      .select('id')
      .eq('client_id', client_id),

    // 2. Oportunidades activas y no caducadas
    supabase
      .from('oportunidades_actualidad')
      .select('id, tipo, titulo, keyword, descripcion, urgencia, relevancia, fecha_evento, trending_pct, contexto, activa, expires_at, validacion, motivo_rechazo, contenido_id')
      .eq('client_id', client_id)
      .eq('activa', true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false }),

    // 3. Oportunidades GSC activas
    supabase
      .from('content_opportunities')
      .select('id, type, titulo, descripcion, keyword, cluster, current_position, impressions, clicks, priority, status, funnel_stage, fase')
      .eq('client_id', client_id)
      .eq('status', 'activa')
      .order('impressions', { ascending: false })
      .limit(10),
  ])

  // ── Obtener content_map_items vía los map IDs ────────────
  let mapItems: Record<string, unknown>[] = []

  if (mapsResult.status === 'fulfilled' && mapsResult.value.data) {
    const mapIds = mapsResult.value.data.map((m) => m.id as string)

    if (mapIds.length > 0) {
      const { data: items } = await supabase
        .from('content_map_items')
        .select(
          'id, map_id, title, main_keyword, secondary_keywords, cluster, funnel_stage, ' +
          'volume, difficulty, tipo_articulo, prioridad_final, validacion, motivo_rechazo, ' +
          'fecha_validacion, fecha_calendario, contenido_id, content_status, existing_url, ' +
          'fase, status, sort_order',
        )
        .in('map_id', mapIds)
        .order('prioridad_final', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true })
        .limit(1000)

      mapItems = (items ?? []) as unknown as Record<string, unknown>[]

      // ── Fallback: rellenar fecha_calendario desde calendario_editorial ──
      // Para items planificados desde Contenidos o Calendario (no desde Mapa)
      // que aún tienen fecha_calendario = null en content_map_items.
      const missingIds = mapItems
        .filter((i) => !i.fecha_calendario && i.contenido_id)
        .map((i) => i.contenido_id as string)

      if (missingIds.length > 0) {
        const { data: calEntradas } = await supabase
          .from('calendario_editorial')
          .select('contenido_id, fecha_publicacion')
          .in('contenido_id', missingIds)
          .neq('status', 'cancelado')
          .order('fecha_publicacion', { ascending: false })

        if (calEntradas && calEntradas.length > 0) {
          // One entry per contenido_id (first = latest due to desc order)
          const calMap = new Map<string, string>()
          for (const e of calEntradas) {
            if (e.contenido_id && !calMap.has(e.contenido_id)) {
              calMap.set(e.contenido_id, e.fecha_publicacion)
            }
          }
          mapItems = mapItems.map((item) => {
            if (!item.fecha_calendario && item.contenido_id) {
              const fallback = calMap.get(item.contenido_id as string)
              if (fallback) return { ...item, fecha_calendario: fallback }
            }
            return item
          })
        }
      }
    }
  }

  const oportunidades    = opResult.status    === 'fulfilled' ? (opResult.value.data    ?? []) : []
  const gscOpportunities = gscOpResult.status === 'fulfilled' ? (gscOpResult.value.data ?? []) : []

  // ── Stats (sobre map items) ──────────────────────────────
  const stats = {
    total     : mapItems.filter((i) => i.validacion !== 'rechazado').length,
    aprobados : mapItems.filter((i) => i.validacion === 'aprobado').length,
    revision  : mapItems.filter((i) => i.validacion === 'revision').length,
    rechazados: mapItems.filter((i) => i.validacion === 'rechazado').length,
  }

  return NextResponse.json({ mapItems, oportunidades, gscOpportunities, stats })
}
