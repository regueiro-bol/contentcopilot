import { createAdminClient } from '@/lib/supabase/admin'
import NuevaEstrategiaClient from './nueva-estrategia-client'

export default async function NuevaEstrategiaPage() {
  const supabase = createAdminClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  return <NuevaEstrategiaClient clientes={clientes ?? []} />
}
