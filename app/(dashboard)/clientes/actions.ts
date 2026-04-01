'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export async function crearCliente(data: {
  nombre: string
  sector: string
  url_web: string
  descripcion: string
  identidad_corporativa: string
}) {
  const supabase = createAdminClient()

  const slug = slugify(data.nombre)

  // Si el slug ya existe, añade un sufijo numérico
  const { data: existing } = await supabase
    .from('clientes')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  const slugFinal = existing
    ? `${slug}-${Date.now().toString(36)}`
    : slug

  const { error } = await supabase.from('clientes').insert({
    nombre: data.nombre.trim(),
    slug: slugFinal,
    sector: data.sector.trim(),
    url_web: data.url_web.trim(),
    descripcion: data.descripcion.trim(),
    identidad_corporativa: data.identidad_corporativa.trim(),
    restricciones_globales: [],
    account_manager_id: '',
    activo: true,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/clientes')
}
