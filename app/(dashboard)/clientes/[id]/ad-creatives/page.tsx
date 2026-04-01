import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import AdCreativesClient from './ad-creatives-client'
export default async function AdCreativesPage({
  params,
  searchParams,
}: {
  params:       { id: string }
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const supabase = createAdminClient()

  const [{ data: cliente, error }, { data: creatives }] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('id', params.id).single(),
    supabase
      .from('ad_creatives')
      .select('*')
      .eq('client_id', params.id)
      .not('image_url', 'is', null)
      .order('created_at', { ascending: false })
      .order('variation_index', { ascending: true }),
  ])

  if (error || !cliente) notFound()

  // Prefill params from "Generar social" button in contenido detail
  const openModal     = searchParams.open === '1'
  const prefillIntent = searchParams.intent as 'organic_informative' | 'organic_brand' | 'paid_campaign' | undefined
  const prefillSource = typeof searchParams.source === 'string' ? searchParams.source : undefined

  return (
    <AdCreativesClient
      clientId={params.id}
      clientNombre={cliente.nombre}
      initialCreatives={creatives ?? []}
      openModalOnMount={openModal}
      prefillSourceContent={prefillSource}
      prefillIntent={prefillIntent}
    />
  )
}
