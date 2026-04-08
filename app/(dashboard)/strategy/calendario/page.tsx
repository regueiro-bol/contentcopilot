import { createAdminClient } from '@/lib/supabase/admin'
import CalendarioClient from './calendario-client'

export const dynamic = 'force-dynamic'

export default async function CalendarioPage() {
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
    <div className="space-y-4 max-w-7xl">
      <CalendarioClient clientes={clientes} />
    </div>
  )
}
