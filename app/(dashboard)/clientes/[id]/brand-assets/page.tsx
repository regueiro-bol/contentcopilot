import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import BrandAssetsClient from './brand-assets-client'
import type { BrandAssetRow, BrandAssetsCoverage, BrandContextRow } from '@/types/brand-assets'

export const dynamic = 'force-dynamic'

export default async function BrandAssetsPage({ params }: { params: { id: string } }) {
  const supabase = createAdminClient()

  const [
    { data: clienteRaw, error: errCliente },
    { data: assetsRaw },
    { data: coverageRaw },
    { data: contextRaw },
  ] = await Promise.all([
    supabase.from('clientes').select('id, nombre').eq('id', params.id).single(),
    supabase
      .from('brand_assets')
      .select('*')
      .eq('client_id', params.id)
      .eq('active', true)
      .order('asset_type')
      .order('file_name'),
    supabase
      .from('brand_assets_coverage')
      .select('*')
      .eq('cliente_id', params.id)
      .single(),
    supabase
      .from('brand_context')
      .select('*')
      .eq('client_id', params.id)
      .single(),
  ])

  if (errCliente || !clienteRaw) notFound()

  const assets: BrandAssetRow[] = (assetsRaw ?? []) as BrandAssetRow[]

  // La vista puede no tener fila si el cliente nunca ha tenido activos
  const coverage: BrandAssetsCoverage = coverageRaw
    ? (coverageRaw as BrandAssetsCoverage)
    : {
        cliente_id: params.id,
        cliente_nombre: clienteRaw.nombre,
        has_logo: false,
        has_brand_book: false,
        has_product_images: false,
        has_context: false,
        total_assets: 0,
        pending_review: 0,
        generation_status: 'blocked',
      }

  const brandContext: BrandContextRow | null = contextRaw
    ? (contextRaw as BrandContextRow)
    : null

  // La vista brand_assets_coverage usa (bc.processed_at IS NOT NULL) para has_context,
  // lo que puede dar falso negativo si el registro existe pero processed_at es null.
  // Derivamos el valor directamente de la consulta a brand_context para mayor fiabilidad.
  const hasContextDirect = brandContext !== null
  const coverageWithContext: BrandAssetsCoverage = {
    ...coverage,
    has_context: hasContextDirect,
  }

  return (
    <BrandAssetsClient
      clientId={params.id}
      clientNombre={clienteRaw.nombre}
      initialAssets={assets}
      coverage={coverageWithContext}
      hasContext={hasContextDirect}
      initialContext={brandContext}
    />
  )
}
