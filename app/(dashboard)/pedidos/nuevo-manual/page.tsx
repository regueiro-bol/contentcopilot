import { createAdminClient } from '@/lib/supabase/admin'
import NuevoManualClient from './nuevo-manual-client'

export default async function NuevoManualPage() {
  const supabase = createAdminClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  return <NuevoManualClient clientes={clientes ?? []} />
}
