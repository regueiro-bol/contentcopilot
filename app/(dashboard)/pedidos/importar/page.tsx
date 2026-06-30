import { createAdminClient } from '@/lib/supabase/admin'
import ImportarClient from './importar-client'

export default async function ImportarPage() {
  const supabase = createAdminClient()

  const [{ data: clientesRaw }, { data: proyectosRaw }] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('proyectos').select('id, nombre, cliente_id').eq('activo', true).order('nombre'),
  ])

  // Agrupar proyectos por cliente
  const proyectosPorCliente: Record<string, { id: string; nombre: string }[]> = {}
  for (const p of proyectosRaw ?? []) {
    if (!proyectosPorCliente[p.cliente_id]) proyectosPorCliente[p.cliente_id] = []
    proyectosPorCliente[p.cliente_id].push({ id: p.id, nombre: p.nombre })
  }

  const clientes = (clientesRaw ?? []).map((c) => ({
    ...c,
    proyectos: proyectosPorCliente[c.id] ?? [],
  }))

  return <ImportarClient clientes={clientes} />
}
