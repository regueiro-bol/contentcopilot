import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import ClienteSubNav from './cliente-subnav'
import type { GenerationStatus } from '@/types/brand-assets'

export default async function ClienteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const supabase = createAdminClient()

  const [{ data: cliente, error }, { data: coverage }] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('id', params.id).single(),
    supabase
      .from('brand_assets_coverage')
      .select('generation_status')
      .eq('cliente_id', params.id)
      .single(),
  ])

  if (error || !cliente) notFound()

  const generationStatus = (coverage?.generation_status ?? null) as GenerationStatus | null

  return (
    <div className="max-w-5xl">
      <ClienteSubNav
        clientId={params.id}
        clientNombre={cliente.nombre}
        generationStatus={generationStatus}
      />
      {children}
    </div>
  )
}
