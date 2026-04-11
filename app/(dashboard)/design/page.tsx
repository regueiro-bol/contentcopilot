import { Suspense }        from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import DesignPageClient      from './design-page-client'

export const dynamic = 'force-dynamic'

export default async function DesignPage() {
  const supabase = createAdminClient()
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre')
    .order('nombre', { ascending: true })

  return (
    <Suspense fallback={<div className="p-6 text-gray-400 text-sm">Cargando…</div>}>
      <DesignPageClient clientes={clientes ?? []} />
    </Suspense>
  )
}
