import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import CompetitiveIntelligenceClient from './competitive-intelligence-client'

export const dynamic = 'force-dynamic'

export default async function CompetitiveIntelligencePage({ params }: { params: { id: string } }) {
  const supabase = createAdminClient()

  const [
    { data: clienteRaw, error: errCliente },
    { data: competitorsRaw },
    { data: adsRaw },
    { data: reportsRaw },
  ] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('id', params.id).single(),
    supabase
      .from('competitors')
      .select('*')
      .eq('client_id', params.id)
      .eq('active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('competitor_ads')
      .select('*, competitors(page_name)')
      .eq('client_id', params.id)
      .eq('is_active', true)
      .order('first_seen_at', { ascending: false })
      .limit(100),
    supabase
      .from('ci_reports')
      .select('*')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  if (errCliente || !clienteRaw) notFound()

  return (
    <CompetitiveIntelligenceClient
      clientId={params.id}
      clientNombre={clienteRaw.nombre}
      initialCompetitors={(competitorsRaw ?? []) as Competitor[]}
      initialAds={(adsRaw ?? []) as CompetitorAdRow[]}
      latestReport={(reportsRaw?.[0] ?? null) as CiReportRow | null}
    />
  )
}

// Types exported for client component
export interface Competitor {
  id:                   string
  client_id:            string
  platform:             string
  page_name:            string
  page_id:              string | null
  active:               boolean
  check_frequency_days: number
  last_checked_at:      string | null
  created_at:           string
}

export interface CompetitorAdRow {
  id:               string
  competitor_id:    string
  client_id:        string
  platform:         string
  ad_id_external:   string
  creative_url:     string | null
  ad_snapshot_url:  string | null
  copy_text:        string | null
  cta_type:         string | null
  started_running:  string | null
  first_seen_at:    string
  last_seen_at:     string
  is_active:        boolean
  raw_data:         Record<string, unknown>
  competitors?:     { page_name: string } | null
}

export interface ReportContent {
  nota_metodologica:       string
  resumen_ejecutivo:       string
  analisis_por_competidor: Array<{
    nombre:                    string
    plataforma:                string
    num_ads:                   number
    formatos:                  Record<string, number>
    dias_promedio_activo:      number | null
    consistencia_inversion:    string
    mensajes_clave:            string[]
    ctas_usados:               string[]
    observaciones:             string[]
  }>
  patrones_generales: {
    formatos_dominantes:          string[]
    estrategias_de_inversion:     string[]
    propuestas_de_valor_comunes:  string[]
  }
  oportunidades:    string[]
  recomendaciones:  Array<{
    prioridad:     'alta' | 'media' | 'baja'
    recomendacion: string
    razonamiento:  string
  }>
}

export interface CiReportRow {
  id:                   string
  client_id:            string
  period_start:         string
  period_end:           string
  report_type:          string
  competitors_analyzed: number
  ads_analyzed:         number
  content:              ReportContent
  created_at:           string
}
