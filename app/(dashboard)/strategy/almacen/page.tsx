import { createAdminClient }  from '@/lib/supabase/admin'
import { getAllowedClientIds } from '@/lib/server/allowed-clients'
import BancoClient             from './almacen-client'

export const dynamic = 'force-dynamic'

export default async function AlmacenPage() {
  const supabase = createAdminClient()
  const allowed  = await getAllowedClientIds()

  // Clientes activos (filtrados por asignación si no es admin)
  let q = supabase.from('clientes').select('id, nombre').eq('activo', true)
  if (allowed !== null) q = q.in('id', allowed.length > 0 ? allowed : ['__none__'])

  const { data: clientesRaw } = await q.order('nombre', { ascending: true })

  const clientes = (clientesRaw ?? []).map((c) => ({
    id    : String(c.id),
    nombre: String(c.nombre),
  }))

  return (
    <div className="space-y-4 max-w-7xl">
      <BancoClient clientes={clientes} />
    </div>
  )
}
