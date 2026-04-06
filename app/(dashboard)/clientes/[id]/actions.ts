'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Proyecto } from '@/types'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    + '-' + Date.now().toString(36)
}

// ─── Cliente ────────────────────────────────────────────────────────────────

export async function actualizarClienteIdentidad(
  id: string,
  data: {
    nombre: string
    sector: string
    url_web: string
    descripcion: string
    account_manager_id: string
  },
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('clientes')
    .update({
      nombre: data.nombre.trim(),
      sector: data.sector.trim(),
      url_web: data.url_web.trim(),
      descripcion: data.descripcion.trim(),
      account_manager_id: data.account_manager_id.trim(),
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${id}`)
}

export async function actualizarClienteMarca(
  id: string,
  data: {
    identidad_corporativa: string
    restricciones_globales: string[]
  },
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('clientes')
    .update({
      identidad_corporativa: data.identidad_corporativa.trim(),
      restricciones_globales: data.restricciones_globales,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${id}`)
}

// ─── Estado del cliente ─────────────────────────────────────────────────────

export async function archivarCliente(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('clientes')
    .update({ estado: 'archivado', activo: false })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${id}`)
  revalidatePath('/clientes')
}

export async function reactivarCliente(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('clientes')
    .update({ estado: 'activo', activo: true })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${id}`)
  revalidatePath('/clientes')
}

export async function eliminarCliente(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('clientes')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/clientes')
}

// ─── Proyectos ───────────────────────────────────────────────────────────────

export async function crearProyecto(
  clienteId: string,
  data: {
    nombre: string
    descripcion: string
    tono_voz: string
    modo_entrega: Proyecto['modo_entrega']
  },
): Promise<{ id: string }> {
  const supabase = createAdminClient()
  const slug = slugify(data.nombre)

  const { data: proyecto, error } = await supabase
    .from('proyectos')
    .insert({
      cliente_id: clienteId,
      nombre: data.nombre.trim(),
      slug,
      descripcion: data.descripcion.trim(),
      tono_voz: data.tono_voz.trim(),
      modo_entrega: data.modo_entrega,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${clienteId}`)
  return proyecto
}
