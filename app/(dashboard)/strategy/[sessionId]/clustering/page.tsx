import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import ClusteringClient from './clustering-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { sessionId: string }
}

export interface ClusterGroup {
  nombre: string
  total : number
  tofu  : number
  mofu  : number
  bofu  : number
  keywords: {
    keyword   : string
    volume    : number | null
    funnel_stage: string | null
    priority  : number | null
  }[]
}

export default async function ClusteringPage({ params }: PageProps) {
  const supabase = createAdminClient()

  // ── Cargar sesión ──────────────────────────────────────────
  const { data: session } = await supabase
    .from('vista_strategy_sessions')
    .select('id, client_nombre, nombre, status, total_keywords, num_clusters, seed_topics')
    .eq('id', params.sessionId)
    .single()

  if (!session) notFound()

  // ── Cargar keywords con cluster info ──────────────────────
  const { data: keywords, error: kwError } = await supabase
    .from('keywords')
    .select('keyword, volume, keyword_difficulty, funnel_stage, cluster_name, priority, incluida')
    .eq('session_id', params.sessionId)
    .eq('incluida', true)
    .order('volume', { ascending: false, nullsFirst: false })

  if (kwError) {
    console.error(`[ClusteringPage] Error en query keywords:`, kwError.message)
  }

  // ── Agrupar por cluster ────────────────────────────────────
  const clusterMap = new Map<string, ClusterGroup>()
  let unclassifiedCount = 0

  for (const kw of keywords ?? []) {
    if (!kw.cluster_name) {
      unclassifiedCount++
      continue
    }
    if (!clusterMap.has(kw.cluster_name)) {
      clusterMap.set(kw.cluster_name, {
        nombre  : kw.cluster_name,
        total   : 0,
        tofu    : 0,
        mofu    : 0,
        bofu    : 0,
        keywords: [],
      })
    }
    const entry = clusterMap.get(kw.cluster_name)!
    entry.total++
    if (kw.funnel_stage === 'tofu') entry.tofu++
    if (kw.funnel_stage === 'mofu') entry.mofu++
    if (kw.funnel_stage === 'bofu') entry.bofu++
    entry.keywords.push({
      keyword     : String(kw.keyword),
      volume      : kw.volume != null ? Number(kw.volume) : null,
      funnel_stage: (kw.funnel_stage as string | null) ?? null,
      priority    : kw.priority != null ? Number(kw.priority) : null,
    })
  }

  const clusters: ClusterGroup[] = Array.from(clusterMap.values())
    .sort((a, b) => b.total - a.total)

  const totalIncluidas = (keywords ?? []).length

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap">
        <Link href="/strategy" className="hover:text-gray-700 transition-colors">
          Estrategia
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
        <Link
          href={`/strategy/${params.sessionId}/keywords`}
          className="hover:text-gray-700 transition-colors truncate max-w-[200px]"
        >
          {String(session.nombre ?? '—')}
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
        <span className="text-gray-900 font-medium">Clustering</span>
      </div>

      <ClusteringClient
        session={{
          id            : String(session.id),
          nombre        : String(session.nombre ?? '—'),
          client_nombre : String(session.client_nombre ?? '—'),
          status        : String(session.status ?? 'draft'),
          total_keywords: Number(session.total_keywords ?? 0),
          num_clusters  : Number(session.num_clusters ?? 0),
        }}
        clusters={clusters}
        totalIncluidas={totalIncluidas}
        unclassifiedCount={unclassifiedCount}
      />
    </div>
  )
}
