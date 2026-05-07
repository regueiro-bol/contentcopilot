import { createAdminClient }      from '@/lib/supabase/admin'
import { getAllowedClientIds }     from '@/lib/server/allowed-clients'
import StrategyDashboardClient    from './strategy-dashboard-client'

export const dynamic = 'force-dynamic'

export default async function StrategyPage() {
  const supabase = createAdminClient()
  const allowed  = await getAllowedClientIds()

  // Clientes activos (filtrados por asignación si no es admin)
  let cq = supabase.from('clientes').select('id, nombre, sector').eq('activo', true)
  if (allowed !== null) cq = cq.in('id', allowed.length > 0 ? allowed : ['__none__'])
  const { data: clientesRaw } = await cq.order('nombre')

  const clientes = (clientesRaw ?? []).map((c) => ({
    id    : String(c.id),
    nombre: String(c.nombre ?? ''),
    sector: (c.sector as string | null) ?? null,
  }))

  // Sesiones — últimas 20, con keywords > 0 prioritarias
  const { data: sesionesRaw } = await supabase
    .from('vista_strategy_sessions')
    .select('id, client_id, client_nombre, nombre, status, created_at, total_keywords, num_clusters')
    .order('created_at', { ascending: false })
    .limit(20)

  // Filtrar solo las del usuario si tiene restricción de clientes
  const clienteIds = new Set(clientes.map((c) => c.id))
  const sesiones = (sesionesRaw ?? [])
    .filter((s) => allowed === null || clienteIds.has(String(s.client_id ?? '')))
    .map((s) => ({
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
  const [
    { count: totalSesiones },
    { count: totalMapas },
    { count: totalKeywords },
  ] = await Promise.all([
    supabase.from('keyword_research_sessions').select('id', { count: 'exact', head: true }),
    supabase.from('content_maps').select('id', { count: 'exact', head: true }),
    supabase.from('keywords').select('id', { count: 'exact', head: true }).eq('incluida', true),
  ])

  // Mapas por cliente + link directo + artículos en banco por cliente
  const { data: mapasRaw } = await supabase
    .from('content_maps')
    .select('id, client_id, session_id, content_map_items(count)')

  const mapasPorCliente      : Record<string, number> = {}
  const mapaSessionPorCliente: Record<string, string> = {}
  const bancoPorCliente      : Record<string, number> = {}

  for (const m of mapasRaw ?? []) {
    const cid = String(m.client_id ?? '')
    if (!cid) continue

    mapasPorCliente[cid] = (mapasPorCliente[cid] ?? 0) + 1
    if (!mapaSessionPorCliente[cid] && m.session_id) {
      mapaSessionPorCliente[cid] = String(m.session_id)
    }

    const cnt = (m.content_map_items as unknown as { count: number }[])[0]?.count ?? 0
    bancoPorCliente[cid] = (bancoPorCliente[cid] ?? 0) + cnt
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
      bancoPorCliente={bancoPorCliente}
    />
  )
}
