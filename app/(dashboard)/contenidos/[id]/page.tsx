import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import ContenidoDetalleClient from './contenido-detalle-client'
import type { Contenido, Proyecto, Cliente, PerfilAutor } from '@/types'

export default async function ContenidoDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createAdminClient()

  const { data: raw, error } = await supabase
    .from('contenidos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !raw) notFound()

  const [
    { data: proyectoRaw },
    { data: conversacionesRaw },
    { data: autoresRaw },
    { data: socialPiezasRaw },
  ] = await Promise.all([
    supabase
      .from('proyectos')
      .select('id, nombre, slug, cliente_id, modo_entrega, activo, created_at, descripcion, tono_voz, etiquetas_tono, keywords_objetivo, keywords_prohibidas, tematicas_autorizadas, tematicas_vetadas, perfil_lector, modo_creativo, documentos_subidos, rag_num_documentos, rag_ultima_actualizacion')
      .eq('id', raw.proyecto_id)
      .single(),
    supabase
      .from('conversaciones')
      .select('id, mensajes, modelo, tokens_input, tokens_output, created_at')
      .eq('contenido_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('perfiles_autor')
      .select('id, nombre, email, especialidad, activo')
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('ad_creatives')
      .select('id, image_url, format, status, created_at, copy, publication_intent')
      .eq('contenido_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  // Fetch cliente from proyecto
  let clienteRaw = null
  if (proyectoRaw?.cliente_id) {
    const { data } = await supabase
      .from('clientes')
      .select('id, nombre, slug, sector, url_web, activo, created_at, descripcion, restricciones_globales, identidad_corporativa, account_manager_id')
      .eq('id', proyectoRaw.cliente_id)
      .single()
    clienteRaw = data
  }

  // Costes acumulados del contenido (vista puede no existir aún → maybeSingle + try/catch)
  let costesRaw: { coste_total: number; coste_texto: number; coste_imagenes: number; coste_rag: number } | null = null
  try {
    const { data } = await supabase
      .from('vista_costes_contenido')
      .select('coste_total, coste_texto, coste_imagenes, coste_rag')
      .eq('contenido_id', params.id)
      .maybeSingle()
    costesRaw = data as typeof costesRaw
  } catch {
    // vista aún no existe o error — ignorar
  }

  const contenido: Contenido & {
    texto_contenido?: string
    notas_iniciales?: string
    notas_revision?: string
    imagen_destacada?: string
  } = {
    id: raw.id,
    titulo: raw.titulo,
    slug: raw.slug,
    proyecto_id: raw.proyecto_id,
    cliente_id: raw.cliente_id,
    activo: raw.activo,
    created_at: raw.created_at,
    estado: raw.estado,
    redactor_id: raw.redactor_id ?? undefined,
    keyword_principal: raw.keyword_principal ?? undefined,
    url_destino: raw.url_destino ?? undefined,
    fecha_entrega: raw.fecha_entrega ?? undefined,
    tamanyo_texto_min: raw.tamanyo_texto_min ?? undefined,
    tamanyo_texto_max: raw.tamanyo_texto_max ?? undefined,
    brief: raw.brief ?? undefined,
    url_publicado: raw.url_publicado ?? undefined,
    link_drive: raw.link_drive ?? undefined,
    texto_contenido: raw.texto_contenido ?? undefined,
    notas_iniciales: raw.notas_iniciales ?? undefined,
    notas_revision: raw.notas_revision ?? undefined,
    imagen_destacada: raw.imagen_destacada ?? undefined,
  }

  const proyecto = proyectoRaw ? {
    ...proyectoRaw,
    etiquetas_tono: (proyectoRaw.etiquetas_tono ?? []) as string[],
    keywords_objetivo: (proyectoRaw.keywords_objetivo ?? []) as string[],
    keywords_prohibidas: (proyectoRaw.keywords_prohibidas ?? []) as string[],
    tematicas_autorizadas: (proyectoRaw.tematicas_autorizadas ?? []) as string[],
    tematicas_vetadas: (proyectoRaw.tematicas_vetadas ?? []) as string[],
    documentos_subidos: (proyectoRaw.documentos_subidos ?? []) as Proyecto['documentos_subidos'],
  } as Proyecto : null

  const cliente = clienteRaw ? {
    ...clienteRaw,
    restricciones_globales: (clienteRaw.restricciones_globales ?? []) as string[],
  } as Cliente : null

  const autores: PerfilAutor[] = (autoresRaw ?? []).map((a) => ({
    id: a.id,
    nombre: a.nombre,
    email: a.email ?? undefined,
    especialidad: a.especialidad ?? undefined,
    activo: a.activo,
    created_at: '',
  }))

  const conversaciones = (conversacionesRaw ?? []).map((c) => ({
    id: c.id,
    // Los mensajes pueden venir en formato {role, content} o {rol, contenido}
    // según si fueron creados por el revisor IA o por el copiloto legacy
    mensajes: (c.mensajes ?? []) as Array<Record<string, string>>,
    modelo: c.modelo,   // también almacena el nombre del agente para revisiones IA
    tokens_input: c.tokens_input,
    tokens_output: c.tokens_output,
    created_at: c.created_at,
  }))

  const socialPiezas = (socialPiezasRaw ?? []).map((p) => ({
    id:                p.id as string,
    image_url:         p.image_url as string | null,
    format:            p.format as string,
    status:            p.status as string,
    created_at:        p.created_at as string,
    copy:              (p.copy ?? null) as Record<string, string> | null,
    publication_intent: p.publication_intent as string,
  }))

  type CostesRow = { coste_total: number; coste_texto: number; coste_imagenes: number; coste_rag: number }
  const cr = costesRaw as CostesRow | null
  const costes = cr ? {
    coste_total   : Number(cr.coste_total)    || 0,
    coste_texto   : Number(cr.coste_texto)    || 0,
    coste_imagenes: Number(cr.coste_imagenes) || 0,
    coste_rag     : Number(cr.coste_rag)      || 0,
  } : null

  return (
    <ContenidoDetalleClient
      contenido={contenido}
      proyecto={proyecto}
      cliente={cliente}
      autores={autores}
      conversaciones={conversaciones}
      socialPiezas={socialPiezas}
      costes={costes}
    />
  )
}
