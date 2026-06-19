/**
 * GET /api/strategy/project-stats?proyecto_id=UUID
 *
 * KPIs rápidos de un proyecto para la portada de Estrategia:
 * - total_keywords : keywords incluidas en sesiones de este proyecto
 * - total_clusters : clusters distintos (cluster_name únicos)
 * - total_banco    : artículos en los content_maps de este proyecto
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

  // ── Sesiones de este proyecto ─────────────────────────────
  const { data: sessions } = await supabase
    .from('keyword_research_sessions')
    .select('id')
    .eq('proyecto_id', proyectoId)

  const sessionIds = (sessions ?? []).map((s) => s.id as string)

  if (sessionIds.length === 0) {
    return NextResponse.json({ total_keywords: 0, total_clusters: 0, total_banco: 0 })
  }

  // ── Queries paralelas ─────────────────────────────────────
  const [kwRes, mapRes] = await Promise.all([
    // Keywords incluidas (devolvemos cluster_name para contar clusters únicos)
    supabase
      .from('keywords')
      .select('cluster_name')
      .in('session_id', sessionIds)
      .eq('incluida', true),

    // Mapas + recuento de artículos
    supabase
      .from('content_maps')
      .select('id, content_map_items(count)')
      .in('session_id', sessionIds),
  ])

  const kwData        = kwRes.data ?? []
  const totalKeywords = kwData.length
  const totalClusters = new Set(
    kwData.map((k) => k.cluster_name).filter(Boolean),
  ).size

  const totalBanco = (mapRes.data ?? []).reduce((sum, m) => {
    const cnt = (m.content_map_items as unknown as { count: number }[])[0]?.count ?? 0
    return sum + cnt
  }, 0)

  return NextResponse.json({ total_keywords: totalKeywords, total_clusters: totalClusters, total_banco: totalBanco })
}
