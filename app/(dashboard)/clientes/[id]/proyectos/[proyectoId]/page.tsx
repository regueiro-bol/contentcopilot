import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import ProyectoDetalleClient from './proyecto-detalle-client'
import type { Proyecto, Contenido, PerfilAutor } from '@/types'

export interface InspiracionSummary {
  id: string
  status: string | null
  created_at: string
  resultado: { oportunidades?: unknown[] } | null
  oportunidades_marcadas?: unknown
}

export interface StrategySummary {
  id: string
  status: string | null
  created_at: string
  total_keywords: number | null
  keywords_incluidas: number | null
  num_clusters: number | null
}

export interface GeoradarSummary {
  id: string
  fecha_scan: string
  score_global: number | null
  estado: string | null
  scores_por_llm: unknown
}

export default async function ProyectoDetallePage({
  params,
}: {
  params: { id: string; proyectoId: string }
}) {
  const supabase = createAdminClient()

  const [
    { data: proyectoRaw, error: errProyecto },
    { data: contenidosRaw },
    { data: clienteRaw, error: errCliente },
    { data: autoresRaw },
    { data: lastInspiracionRaw },
    { data: lastStrategyRaw },
    { data: lastGeoradarRaw },
  ] = await Promise.all([
    supabase.from('proyectos').select('*').eq('id', params.proyectoId).single(),
    supabase.from('contenidos').select('*').eq('proyecto_id', params.proyectoId).order('created_at', { ascending: false }),
    supabase.from('clientes').select('id, nombre').eq('id', params.id).single(),
    supabase.from('perfiles_autor').select('id, nombre, email, especialidad, activo').eq('activo', true).order('nombre'),
    supabase
      .from('inspiracion_sessions')
      .select('id, status, created_at, resultado, oportunidades_marcadas')
      .eq('client_id', params.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('vista_strategy_sessions')
      .select('id, status, created_at, total_keywords, keywords_incluidas, num_clusters')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('georadar_scans')
      .select('id, fecha_scan, score_global, estado, scores_por_llm')
      .eq('cliente_id', params.id)
      .eq('estado', 'completado')
      .order('fecha_scan', { ascending: false })
      .limit(2),
  ])

  if (errProyecto || !proyectoRaw || errCliente || !clienteRaw) notFound()

  const proyecto: Proyecto = {
    ...proyectoRaw,
    etiquetas_tono: (proyectoRaw.etiquetas_tono ?? []) as string[],
    keywords_objetivo: (proyectoRaw.keywords_objetivo ?? []) as string[],
    keywords_prohibidas: (proyectoRaw.keywords_prohibidas ?? []) as string[],
    tematicas_autorizadas: (proyectoRaw.tematicas_autorizadas ?? []) as string[],
    tematicas_vetadas: (proyectoRaw.tematicas_vetadas ?? []) as string[],
    documentos_subidos: (proyectoRaw.documentos_subidos ?? []) as Proyecto['documentos_subidos'],
  }

  const contenidos: Contenido[] = (contenidosRaw ?? []).map((c) => ({
    id: c.id,
    titulo: c.titulo,
    slug: c.slug,
    proyecto_id: c.proyecto_id,
    cliente_id: c.cliente_id,
    activo: c.activo,
    created_at: c.created_at,
    estado: c.estado as Contenido['estado'],
    redactor_id: c.redactor_id ?? undefined,
    keyword_principal: c.keyword_principal ?? undefined,
    url_destino: c.url_destino ?? undefined,
    fecha_entrega: c.fecha_entrega ?? undefined,
    tamanyo_texto_min: c.tamanyo_texto_min ?? undefined,
    tamanyo_texto_max: c.tamanyo_texto_max ?? undefined,
    brief: c.brief as Contenido['brief'],
    url_publicado: c.url_publicado ?? undefined,
    link_drive: c.link_drive ?? undefined,
    notas_iniciales: c.notas_iniciales ?? undefined,
  }))

  const autores: PerfilAutor[] = (autoresRaw ?? []).map((a) => ({
    id: a.id,
    nombre: a.nombre,
    email: a.email ?? undefined,
    especialidad: a.especialidad ?? undefined,
    activo: a.activo,
    created_at: '',
  }))

  const lastInspiracion = (lastInspiracionRaw ?? null) as InspiracionSummary | null
  const lastStrategy = (lastStrategyRaw ?? null) as StrategySummary | null
  const lastGeoradar = (lastGeoradarRaw ?? []) as GeoradarSummary[]

  return (
    <ProyectoDetalleClient
      proyecto={proyecto}
      contenidos={contenidos}
      cliente={{ id: clienteRaw.id, nombre: clienteRaw.nombre }}
      autores={autores}
      lastInspiracion={lastInspiracion}
      lastStrategy={lastStrategy}
      lastGeoradar={lastGeoradar}
    />
  )
}
