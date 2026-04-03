import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import MapaClient from './mapa-client'

interface PageProps {
  params: { sessionId: string }
}

export interface MapItem {
  id                : string
  title             : string
  slug              : string
  main_keyword      : string
  secondary_keywords: string[]
  cluster           : string | null
  funnel_stage      : 'tofu' | 'mofu' | 'bofu' | null
  volume            : number | null
  difficulty        : number | null
  priority          : number
  suggested_month   : string | null
  status            : string
  contenido_id      : string | null
  sort_order        : number
}

export default async function MapaPage({ params }: PageProps) {
  const supabase = createAdminClient()

  // ── Cargar sesión ──────────────────────────────────────────
  const { data: session } = await supabase
    .from('vista_strategy_sessions')
    .select('id, client_nombre, nombre, status, total_keywords, num_clusters')
    .eq('id', params.sessionId)
    .single()

  if (!session) notFound()

  // ── Cargar el mapa más reciente para la sesión ─────────────
  const { data: map } = await supabase
    .from('content_maps')
    .select('id, nombre, status, created_at, config')
    .eq('session_id', params.sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // ── Cargar artículos del mapa (si existe) ──────────────────
  let items: MapItem[] = []
  if (map) {
    const { data: rawItems } = await supabase
      .from('content_map_items')
      .select(
        'id, title, slug, main_keyword, secondary_keywords, cluster, funnel_stage, volume, difficulty, priority, suggested_month, status, contenido_id, sort_order',
      )
      .eq('map_id', map.id)
      .order('sort_order', { ascending: true })

    items = (rawItems ?? []).map((i) => ({
      id                : String(i.id),
      title             : String(i.title),
      slug              : String(i.slug ?? ''),
      main_keyword      : String(i.main_keyword),
      secondary_keywords: Array.isArray(i.secondary_keywords) ? (i.secondary_keywords as string[]) : [],
      cluster           : (i.cluster as string | null) ?? null,
      funnel_stage      : (i.funnel_stage as 'tofu' | 'mofu' | 'bofu' | null) ?? null,
      volume            : i.volume != null ? Number(i.volume) : null,
      difficulty        : i.difficulty != null ? Number(i.difficulty) : null,
      priority          : Number(i.priority ?? 2),
      suggested_month   : (i.suggested_month as string | null) ?? null,
      status            : String(i.status ?? 'planned'),
      contenido_id      : (i.contenido_id as string | null) ?? null,
      sort_order        : Number(i.sort_order ?? 0),
    }))
  }

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap">
        <Link href="/strategy" className="hover:text-gray-700 transition-colors">
          Estrategia
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
        <Link
          href={`/strategy/${params.sessionId}/clustering`}
          className="hover:text-gray-700 transition-colors truncate max-w-[160px]"
        >
          {String(session.nombre ?? '—')}
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
        <span className="text-gray-900 font-medium">Mapa de contenidos</span>
      </div>

      <MapaClient
        session={{
          id            : String(session.id),
          nombre        : String(session.nombre ?? '—'),
          client_nombre : String(session.client_nombre ?? '—'),
          status        : String(session.status ?? 'draft'),
        }}
        map={map ? {
          id       : String(map.id),
          nombre   : String(map.nombre ?? ''),
          status   : String(map.status ?? 'draft'),
          createdAt: String(map.created_at),
          config   : (map.config as Record<string, unknown>) ?? {},
        } : null}
        items={items}
      />
    </div>
  )
}
