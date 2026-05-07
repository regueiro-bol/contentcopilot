import { createAdminClient } from '@/lib/supabase/admin'
import { PermissionGuard }   from '@/components/PermissionGuard'
import EquipoClient          from './equipo-client'

export const dynamic = 'force-dynamic'

export default async function EquipoPage() {
  const supabase = createAdminClient()

  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre', { ascending: true })

  const clientes = (clientesRaw ?? []).map((c) => ({
    id    : String(c.id),
    nombre: String(c.nombre),
  }))

  return (
    <PermissionGuard permission="action:gestionar_equipo">
      <EquipoClient todosClientes={clientes} />
    </PermissionGuard>
  )
}
