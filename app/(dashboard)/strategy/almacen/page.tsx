import { createAdminClient } from '@/lib/supabase/admin'
import AlmacenClient from './almacen-client'

export const dynamic = 'force-dynamic'

export default async function AlmacenPage() {
  const supabase = createAdminClient()

  // Clientes activos con al menos un content_map_item
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
    <div className="space-y-4 max-w-7xl">
      <AlmacenClient clientes={clientes} />
    </div>
  )
}
