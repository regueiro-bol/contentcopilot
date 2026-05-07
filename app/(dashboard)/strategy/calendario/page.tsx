import { createAdminClient }  from '@/lib/supabase/admin'
import { getAllowedClientIds } from '@/lib/server/allowed-clients'
import CalendarioClient        from './calendario-client'

export const dynamic = 'force-dynamic'

export default async function CalendarioPage() {
  const supabase = createAdminClient()
  const allowed  = await getAllowedClientIds()

  let q = supabase.from('clientes').select('id, nombre').eq('activo', true)
  if (allowed !== null) q = q.in('id', allowed.length > 0 ? allowed : ['__none__'])

  const { data: clientesRaw } = await q.order('nombre', { ascending: true })

  const clientes = (clientesRaw ?? []).map((c) => ({
    id    : String(c.id),
    nombre: String(c.nombre),
  }))

  return (
    <div className="space-y-4 max-w-7xl">
      <CalendarioClient clientes={clientes} />
    </div>
  )
}
