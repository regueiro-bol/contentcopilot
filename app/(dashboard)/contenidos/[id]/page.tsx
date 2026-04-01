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

  const contenido: Contenido & { texto_contenido?: string; notas_iniciales?: string } = {
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

  return (
    <ContenidoDetalleClient
      contenido={contenido}
      proyecto={proyecto}
      cliente={cliente}
      autores={autores}
      conversaciones={conversaciones}
    />
  )
}
