import Link from 'next/link'
import { ChevronLeft, Map, Calendar, FileText, Trash2 } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import MapasClient from './mapas-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { cliente?: string }
}

export default async function MapasPage({ searchParams }: PageProps) {
  const supabase  = createAdminClient()
  const clienteId = searchParams.cliente ?? null

  // ── Cargar mapas ──────────────────────────────────────────
  let query = supabase
    .from('content_maps')
    .select(`
      id, nombre, status, created_at, config, session_id, client_id,
      keyword_research_sessions ( nombre )
    `)
    .order('created_at', { ascending: false })

  if (clienteId) {
    query = query.eq('client_id', clienteId)
  }

  const { data: mapasRaw } = await query

  // ── Nombre del cliente ────────────────────────────────────
  let clienteNombre: string | null = null
  if (clienteId) {
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre')
      .eq('id', clienteId)
      .single()
    clienteNombre = cliente?.nombre ? String(cliente.nombre) : null
  }

  // ── Contar items por mapa con stats de estado ─────────────
  const mapIds = (mapasRaw ?? []).map((m) => String(m.id))

  let itemStats: Record<string, { total: number; planned: number; assigned: number; published: number }> = {}
  if (mapIds.length > 0) {
    const { data: itemsRaw } = await supabase
      .from('content_map_items')
      .select('map_id, status')
      .in('map_id', mapIds)

    for (const item of itemsRaw ?? []) {
      const mid = String(item.map_id)
      if (!itemStats[mid]) itemStats[mid] = { total: 0, planned: 0, assigned: 0, published: 0 }
      itemStats[mid].total++
      const st = String(item.status ?? 'planned')
      if (st === 'planned') itemStats[mid].planned++
      else if (st === 'assigned' || st === 'in_progress') itemStats[mid].assigned++
      else if (st === 'published') itemStats[mid].published++
    }
  }

  // ── Serializar para el client component ───────────────────
  const mapas = (mapasRaw ?? []).map((m) => {
    const mid   = String(m.id)
    const stats = itemStats[mid] ?? { total: 0, planned: 0, assigned: 0, published: 0 }
    const sesionNombre =
      (m.keyword_research_sessions as { nombre?: string } | null)?.nombre ?? null

    return {
      id           : mid,
      nombre       : String(m.nombre ?? ''),
      status       : String(m.status ?? 'draft'),
      created_at   : String(m.created_at),
      session_id   : m.session_id ? String(m.session_id) : null,
      sesion_nombre: sesionNombre ? String(sesionNombre) : null,
      total        : stats.total,
      planned      : stats.planned,
      assigned     : stats.assigned,
      published    : stats.published,
    }
  })

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/strategy" className="hover:text-gray-700 transition-colors">
          Estrategia
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
        <span className="text-gray-900 font-medium">Mapas de contenido</span>
      </div>

      <MapasClient
        mapas={mapas}
        clienteNombre={clienteNombre}
        clienteId={clienteId}
      />
    </div>
  )
}
