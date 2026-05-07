import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedClientIds } from '@/lib/server/allowed-clients'
import MapaUnificadoClient from './mapa-unificado-client'

export const dynamic = 'force-dynamic'

export default async function MapaPage() {
  const supabase = createAdminClient()
  const allowed  = await getAllowedClientIds()

  let cq = supabase.from('clientes').select('id, nombre').eq('activo', true)
  if (allowed !== null) cq = cq.in('id', allowed.length > 0 ? allowed : ['__none__'])
  const { data: clientesRaw } = await cq.order('nombre')

  const clientes = (clientesRaw ?? []).map((c) => ({
    id    : String(c.id),
    nombre: String(c.nombre ?? ''),
  }))

  return <MapaUnificadoClient clientes={clientes} />
}
