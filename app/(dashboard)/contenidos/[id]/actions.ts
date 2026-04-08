'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EstadoContenido, BriefSEO } from '@/types'

function path(id: string) {
  return `/contenidos/${id}`
}

function revalidateListas() {
  revalidatePath('/contenidos')
  revalidatePath('/dashboard')
}

export async function actualizarEstadoContenido(
  id: string,
  estado: EstadoContenido,
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contenidos')
    .update({ estado })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Sincronizar estado con content_map_items si el artículo proviene del almacén
  if (estado === 'en_redaccion' || estado === 'publicado') {
    const statusMapa = estado === 'publicado' ? 'published' : 'in_progress'
    await supabase
      .from('content_map_items')
      .update({ status: statusMapa })
      .eq('contenido_id', id)
  }

  revalidatePath(path(id))
  revalidateListas()
}

export async function actualizarTextoContenido(
  id: string,
  texto_contenido: string,
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contenidos')
    .update({ texto_contenido })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(path(id))
}

export async function actualizarEntregaContenido(
  id: string,
  data: {
    url_publicado: string
    link_drive: string
  },
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contenidos')
    .update({
      url_publicado: data.url_publicado.trim() || null,
      link_drive: data.link_drive.trim() || null,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(path(id))
}

export async function actualizarBriefContenido(
  id: string,
  brief: Partial<BriefSEO>,
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contenidos')
    .update({ brief })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(path(id))
}

export async function actualizarImagenDestacada(
  id: string,
  imagen_destacada: string | null,
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contenidos')
    .update({ imagen_destacada })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(path(id))
}

export async function devolverContenido(
  id: string,
  notas_revision: string,
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contenidos')
    .update({ estado: 'devuelto', notas_revision: notas_revision || null })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(path(id))
  revalidateListas()
}

export async function publicarContenido(
  id: string,
  url_publicado: string,
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contenidos')
    .update({ estado: 'publicado', url_publicado: url_publicado.trim() || null })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Sincronizar: marcar el artículo del almacén como publicado
  await supabase
    .from('content_map_items')
    .update({ status: 'published' })
    .eq('contenido_id', id)

  revalidatePath(path(id))
  revalidateListas()
}

/**
 * Guarda una revisión de IA en la tabla conversaciones.
 * Usa el campo `modelo` para identificar el agente que generó la revisión.
 */
export async function guardarRevision(
  contenidoId: string,
  data: {
    agente: string
    mensajes: Array<{ role: string; content: string }>
  },
) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('conversaciones').insert({
    contenido_id: contenidoId,
    modelo: data.agente,   // reutilizamos modelo como identificador del agente
    mensajes: data.mensajes,
    tokens_input: 0,
    tokens_output: 0,
  })

  if (error) throw new Error(error.message)
  revalidatePath(path(contenidoId))
}
