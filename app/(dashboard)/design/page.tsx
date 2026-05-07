import { Suspense }           from 'react'
import { createAdminClient }   from '@/lib/supabase/admin'
import { getAllowedClientIds }  from '@/lib/server/allowed-clients'
import { PermissionGuard }     from '@/components/PermissionGuard'
import DesignPageClient         from './design-page-client'

export const dynamic = 'force-dynamic'

export default async function DesignPage() {
  const supabase = createAdminClient()
  const allowed  = await getAllowedClientIds()

  let q = supabase.from('clientes').select('id, nombre')
  if (allowed !== null) q = q.in('id', allowed.length > 0 ? allowed : ['__none__'])

  const { data: clientes } = await q.order('nombre', { ascending: true })

  return (
    <PermissionGuard permission="module:panel_diseno">
      <Suspense fallback={<div className="p-6 text-gray-400 text-sm">Cargando…</div>}>
        <DesignPageClient clientes={clientes ?? []} />
      </Suspense>
    </PermissionGuard>
  )
}
