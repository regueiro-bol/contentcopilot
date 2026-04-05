import { createAdminClient } from '@/lib/supabase/admin'
import StrategyDashboardClient from './strategy-dashboard-client'

export const dynamic = 'force-dynamic'

export default async function StrategyPage() {
  const supabase = createAdminClient()

  // Clientes activos
  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('id, nombre, sector')
    .eq('activo', true)
    .order('nombre')

  const clientes = (clientesRaw ?? []).map((c) => ({
    id    : String(c.id),
    nombre: String(c.nombre ?? ''),
    sector: (c.sector as string | null) ?? null,
  }))

  // Últimas 20 sesiones (necesitamos client_id para filtrar)
  const { data: sesionesRaw } = await supabase
    .from('vista_strategy_sessions')
    .select('id, client_id, client_nombre, nombre, status, created_at, total_keywords, num_clusters')
    .order('created_at', { ascending: false })
    .limit(20)

  const sesiones = (sesionesRaw ?? []).map((s) => ({
    id            : String(s.id),
    client_id     : String(s.client_id ?? ''),
    client_nombre : String(s.client_nombre ?? '—'),
    nombre        : String(s.nombre ?? '—'),
    status        : String(s.status ?? 'draft'),
    created_at    : String(s.created_at),
    total_keywords: Number(s.total_keywords ?? 0),
    num_clusters  : Number(s.num_clusters  ?? 0),
  }))

  // KPIs globales
  const { count: totalSesiones } = await supabase
    .from('keyword_research_sessions')
    .select('id', { count: 'exact', head: true })

  const { count: totalMapas } = await supabase
    .from('content_maps')
    .select('id', { count: 'exact', head: true })

  const { count: totalKeywords } = await supabase
    .from('keywords')
    .select('id', { count: 'exact', head: true })
    .eq('incluida', true)

  // Mapas por cliente (para el KPI filtrado + link directo si solo hay 1)
  const { data: mapasPorClienteRaw } = await supabase
    .from('content_maps')
    .select('id, client_id, session_id')

  const mapasPorCliente: Record<string, number> = {}
  // session_id del mapa más reciente por cliente (para link directo)
  const mapaSessionPorCliente: Record<string, string> = {}
  for (const m of mapasPorClienteRaw ?? []) {
    const cid = String(m.client_id ?? '')
    if (cid) {
      mapasPorCliente[cid] = (mapasPorCliente[cid] ?? 0) + 1
      // Guardar solo si es el primero (más reciente por orden de insert)
      if (!mapaSessionPorCliente[cid] && m.session_id) {
        mapaSessionPorCliente[cid] = String(m.session_id)
      }
    }
  }

  return (
    <StrategyDashboardClient
      clientes={clientes}
      sesiones={sesiones}
      totalSesiones={totalSesiones ?? 0}
      totalKeywords={totalKeywords ?? 0}
      totalMapas={totalMapas ?? 0}
      mapasPorCliente={mapasPorCliente}
      mapaSessionPorCliente={mapaSessionPorCliente}
    />
  )
}
