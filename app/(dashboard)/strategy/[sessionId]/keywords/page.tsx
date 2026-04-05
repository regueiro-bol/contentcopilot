import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import KeywordsClient from './keywords-client'

interface PageProps {
  params: { sessionId: string }
}

export default async function KeywordsPage({ params }: PageProps) {
  const supabase = createAdminClient()

  // ── Cargar sesión ──────────────────────────────────────────
  const { data: session } = await supabase
    .from('vista_strategy_sessions')
    .select('id, client_nombre, nombre, status, created_at, total_keywords, num_clusters, seed_topics, config')
    .eq('id', params.sessionId)
    .single()

  if (!session) notFound()

  // ── Cargar keywords ────────────────────────────────────────
  const { data: keywords } = await supabase
    .from('keywords')
    .select(
      'id, keyword, volume, keyword_difficulty, cpc, competition, competition_level, search_intent, monthly_searches, incluida, cluster_name, funnel_stage, notas, gsc_clicks, gsc_impressions, gsc_position, gsc_opportunity, competitor_source',
    )
    .eq('session_id', params.sessionId)
    .order('volume', { ascending: false, nullsFirst: false })

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-gray-500">
        <Link href="/strategy" className="hover:text-gray-700 transition-colors">
          Estrategia
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
        <span className="text-gray-900 font-medium truncate max-w-[300px]">{session.nombre}</span>
      </div>

      <KeywordsClient
        session={{
          id            : String(session.id),
          nombre        : String(session.nombre ?? '—'),
          client_nombre : String(session.client_nombre ?? '—'),
          status        : String(session.status ?? 'draft'),
          created_at    : String(session.created_at),
          total_keywords: Number(session.total_keywords ?? 0),
          seed_topics   : Array.isArray(session.seed_topics) ? session.seed_topics as string[] : [],
        }}
        keywords={(keywords ?? []).map((k) => ({
          id                : String(k.id),
          keyword           : String(k.keyword),
          volume            : k.volume != null ? Number(k.volume) : null,
          keyword_difficulty: k.keyword_difficulty != null ? Number(k.keyword_difficulty) : null,
          cpc               : k.cpc != null ? Number(k.cpc) : null,
          competition       : k.competition != null ? Number(k.competition) : null,
          competition_level : (k.competition_level as string | null) ?? null,
          search_intent     : (k.search_intent as string | null) ?? null,
          incluida          : Boolean(k.incluida ?? true),
          cluster_name      : (k.cluster_name as string | null) ?? null,
          funnel_stage      : (k.funnel_stage as string | null) ?? null,
          gsc_clicks        : k.gsc_clicks != null ? Number(k.gsc_clicks) : null,
          gsc_impressions   : k.gsc_impressions != null ? Number(k.gsc_impressions) : null,
          gsc_position      : k.gsc_position != null ? Number(k.gsc_position) : null,
          gsc_opportunity   : (k.gsc_opportunity as 'quick_win' | 'existing' | 'new' | null) ?? null,
          competitor_source : (k.competitor_source as string | null) ?? null,
        }))}
      />
    </div>
  )
}
