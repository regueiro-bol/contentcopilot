import { createAdminClient } from '@/lib/supabase/admin'
import PedidosPageClient from './pedidos-client'
import type { Pedido, Cliente, Proyecto } from '@/types'

export default async function PedidosPage() {
  const supabase = createAdminClient()

  // Traer pedidos con cliente y proyecto
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      clientes:cliente_id (id, nombre),
      proyectos:proyecto_id (id, nombre)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[pedidos] Error fetching pedidos:', error)
  }

  type Row = Omit<Pedido, 'cliente' | 'proyecto'> & {
    clientes: Pick<Cliente, 'id' | 'nombre'> | null
    proyectos: Pick<Proyecto, 'id' | 'nombre'> | null
  }

  const pedidos: Pedido[] = ((data ?? []) as Row[]).map((p) => ({
    id: p.id,
    tipo: p.tipo,
    cliente_id: p.cliente_id,
    proyecto_id: p.proyecto_id,
    nombre_archivo: p.nombre_archivo,
    estado: p.estado,
    contenidos_generados: p.contenidos_generados,
    errores: p.errores ?? [],
    created_at: p.created_at,
    cliente: p.clientes ?? undefined,
    proyecto: p.proyectos ?? undefined,
  }))

  // Traer todos los clientes activos para los selectores de los modales
  const { data: clientesData } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  const clientes = (clientesData ?? []) as Pick<Cliente, 'id' | 'nombre'>[]

  return <PedidosPageClient pedidos={pedidos} clientes={clientes} />
}
