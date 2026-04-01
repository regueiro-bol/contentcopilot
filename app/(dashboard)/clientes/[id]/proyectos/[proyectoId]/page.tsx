import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import ProyectoDetalleClient from './proyecto-detalle-client'
import type { Proyecto, Contenido, PerfilAutor } from '@/types'

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
  ] = await Promise.all([
    supabase.from('proyectos').select('*').eq('id', params.proyectoId).single(),
    supabase.from('contenidos').select('*').eq('proyecto_id', params.proyectoId).order('created_at', { ascending: false }),
    supabase.from('clientes').select('id, nombre').eq('id', params.id).single(),
    supabase.from('perfiles_autor').select('id, nombre, email, especialidad, activo').eq('activo', true).order('nombre'),
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

  return (
    <ProyectoDetalleClient
      proyecto={proyecto}
      contenidos={contenidos}
      cliente={{ id: clienteRaw.id, nombre: clienteRaw.nombre }}
      autores={autores}
    />
  )
}
