import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import RevisionClient from './revision-client'

interface Props {
  searchParams: { id?: string; proyecto_id?: string }
}

export default async function RevisionPage({ searchParams }: Props) {
  const { id, proyecto_id: proyectoIdDefault } = searchParams

  if (!id) notFound()

  const supabase = createAdminClient()

  const { data: importacion } = await supabase
    .from('importaciones_pedidos')
    .select('id, cliente_id, archivo_nombre, pedidos_detectados, estado')
    .eq('id', id)
    .single()

  if (!importacion) notFound()

  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('id', importacion.cliente_id)
    .single()

  const { data: proyectos } = await supabase
    .from('proyectos')
    .select('id, nombre')
    .eq('cliente_id', importacion.cliente_id)
    .eq('activo', true)
    .order('nombre')

  return (
    <RevisionClient
      importacion={importacion as {
        id: string
        cliente_id: string
        archivo_nombre: string | null
        pedidos_detectados: unknown[]
        estado: string
      }}
      cliente={cliente ?? { id: importacion.cliente_id, nombre: 'Cliente' }}
      proyectos={proyectos ?? []}
      proyectoIdDefault={proyectoIdDefault ?? null}
    />
  )
}
