import { createAdminClient } from '@/lib/supabase/admin'
import NuevoExcelClient from './nuevo-excel-client'

export default async function NuevoExcelPage() {
  const supabase = createAdminClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  return <NuevoExcelClient clientes={clientes ?? []} />
}
