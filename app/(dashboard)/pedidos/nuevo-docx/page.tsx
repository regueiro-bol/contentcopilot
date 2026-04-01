import { createAdminClient } from '@/lib/supabase/admin'
import NuevoDocxClient from './nuevo-docx-client'

export default async function NuevoDocxPage() {
  const supabase = createAdminClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  return <NuevoDocxClient clientes={clientes ?? []} />
}
