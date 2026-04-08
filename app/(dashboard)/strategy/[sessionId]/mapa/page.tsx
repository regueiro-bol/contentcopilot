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
  content_status    : 'gap' | 'existing_content' | 'partial' | null
  existing_url      : string | null
  similarity_score  : number | null
  // Sprint 2
  tipo_articulo     : 'nuevo' | 'actualizacion' | 'mejora' | null
  p1_volumen        : number | null
  p2_oportunidad    : number | null
  p3_actualizacion  : boolean
  p4_manual         : number | null
  prioridad_final   : number | null
  validacion        : 'propuesto' | 'aprobado' | 'rechazado' | 'revision' | null
  motivo_rechazo    : string | null
  fecha_validacion  : string | null
  fecha_calendario  : string | null
  redactor_asignado : string | null
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
    .select('id, nombre, status, created_at, config, client_id')
    .eq('session_id', params.sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // ── Cargar artículos del mapa (si existe) ──────────────────
  // Intentamos con los campos Sprint 2; si la migración 029 no está aplicada,
  // reintentamos solo con los campos base para no romper la carga de la página.
  const SELECT_FULL = 'id, title, slug, main_keyword, secondary_keywords, cluster, funnel_stage, volume, difficulty, priority, suggested_month, status, contenido_id, sort_order, content_status, existing_url, similarity_score, tipo_articulo, p1_volumen, p2_oportunidad, p3_actualizacion, p4_manual, prioridad_final, validacion, motivo_rechazo, fecha_validacion, fecha_calendario, redactor_asignado'
  const SELECT_BASE = 'id, title, slug, main_keyword, secondary_keywords, cluster, funnel_stage, volume, difficulty, priority, suggested_month, status, contenido_id, sort_order, content_status, existing_url, similarity_score'

  let items: MapItem[] = []
  if (map) {
    let { data: rawItems, error: itemsError } = await supabase
      .from('content_map_items')
      .select(SELECT_FULL)
      .eq('map_id', map.id)
      .order('sort_order', { ascending: true })

    // Fallback: migración 029 aún no aplicada
    if (itemsError?.code === 'PGRST204') {
      const { data: fallbackItems } = await supabase
        .from('content_map_items')
        .select(SELECT_BASE)
        .eq('map_id', map.id)
        .order('sort_order', { ascending: true })
      rawItems = fallbackItems
    }

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
      content_status    : (i.content_status as 'gap' | 'existing_content' | 'partial' | null) ?? null,
      existing_url      : (i.existing_url as string | null) ?? null,
      similarity_score  : i.similarity_score != null ? Number(i.similarity_score) : null,
      tipo_articulo     : (i.tipo_articulo as 'nuevo' | 'actualizacion' | 'mejora' | null) ?? null,
      p1_volumen        : i.p1_volumen != null ? Number(i.p1_volumen) : null,
      p2_oportunidad    : i.p2_oportunidad != null ? Number(i.p2_oportunidad) : null,
      p3_actualizacion  : Boolean(i.p3_actualizacion),
      p4_manual         : i.p4_manual != null ? Number(i.p4_manual) : null,
      prioridad_final   : i.prioridad_final != null ? Number(i.prioridad_final) : null,
      validacion        : (i.validacion as 'propuesto' | 'aprobado' | 'rechazado' | 'revision' | null) ?? null,
      motivo_rechazo    : (i.motivo_rechazo as string | null) ?? null,
      fecha_validacion  : (i.fecha_validacion as string | null) ?? null,
      fecha_calendario  : (i.fecha_calendario as string | null) ?? null,
      redactor_asignado : (i.redactor_asignado as string | null) ?? null,
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
        clientId={map ? String(map.client_id) : null}
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
