'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type ContenidoLista = {
  id: string
  titulo: string
  estado: string
  cliente_id: string
  proyecto_id: string
  cliente_nombre: string
  proyecto_nombre: string
}

export type ContenidoCompleto = {
  id: string
  titulo: string
  estado: string
  proyecto_id: string | null   // campo directo — fuente primaria para RAG
  texto_contenido: string | null
  brief: { texto_generado?: string } | null
  keyword_principal: string | null
  notas_iniciales: string | null
  tamanyo_texto_min: number | null
  tamanyo_texto_max: number | null
  proyectos: {
    id: string
    nombre: string
    tono_voz: string
    keywords_objetivo: string[]
  } | null
  clientes: {
    id: string
    nombre: string
  } | null
}

export async function cargarContenidosList(): Promise<ContenidoLista[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('contenidos')
    .select(`
      id, titulo, estado, cliente_id, proyecto_id,
      proyectos (nombre),
      clientes (nombre)
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((c: any) => ({
    id: c.id,
    titulo: c.titulo,
    estado: c.estado,
    cliente_id: c.cliente_id,
    proyecto_id: c.proyecto_id,
    cliente_nombre: c.clientes?.nombre ?? 'Sin cliente',
    proyecto_nombre: c.proyectos?.nombre ?? 'Sin proyecto',
  }))
}

export async function cargarContenidoCompleto(id: string): Promise<ContenidoCompleto> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('contenidos')
    .select(`
      id, titulo, estado, proyecto_id, texto_contenido, brief,
      keyword_principal, notas_iniciales,
      tamanyo_texto_min, tamanyo_texto_max,
      proyectos (id, nombre, tono_voz, keywords_objetivo),
      clientes (id, nombre)
    `)
    .eq('id', id)
    .single()

  if (error || !data) throw new Error('Contenido no encontrado')
  return data as unknown as ContenidoCompleto
}

export async function guardarTextoEnSupabase(id: string, texto: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contenidos')
    .update({ texto_contenido: texto })
    .eq('id', id)

  if (error) throw new Error(error.message)
}
