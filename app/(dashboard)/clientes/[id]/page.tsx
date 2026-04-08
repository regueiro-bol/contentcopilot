import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import ClienteDetalleClient from './cliente-detalle-client'
import type { Cliente, Proyecto } from '@/types'
import type {
  BrandAssetRow,
  BrandAssetsCoverage,
  BrandContextRow,
} from '@/types/brand-assets'
import type {
  Competitor,
  CompetitorAdRow,
  CiReportRow,
} from './competitive-intelligence/page'
import type { AdCreative } from './ad-creatives/ad-creatives-client'
import type { VideoProject, ContenidoOption } from './videos/videos-client'

export default async function ClienteDetallePage({ params }: { params: { id: string } }) {
  const supabase = createAdminClient()

  const [
    { data: clienteRaw, error: errCliente },
    { data: proyectosRaw },
    { data: coverageRaw },
    { data: brandAssetsRaw },
    { data: brandContextRaw },
    { data: adCreativesRaw },
    { data: videoProjectsRaw },
    { data: videoContenidosRaw },
    { data: competitorsRaw },
    { data: competitorAdsRaw },
    { data: ciReportsRaw },
  ] = await Promise.all([
    supabase.from('clientes').select('*').eq('id', params.id).single(),
    supabase
      .from('proyectos')
      .select('*, contenidos(count)')
      .eq('cliente_id', params.id)
      .order('nombre'),
    supabase
      .from('brand_assets_coverage')
      .select('*')
      .eq('cliente_id', params.id)
      .single(),
    supabase
      .from('brand_assets')
      .select('*')
      .eq('client_id', params.id)
      .eq('active', true)
      .order('asset_type')
      .order('file_name'),
    supabase
      .from('brand_context')
      .select('*')
      .eq('client_id', params.id)
      .single(),
    supabase
      .from('ad_creatives')
      .select('*')
      .eq('client_id', params.id)
      .not('image_url', 'is', null)
      .order('created_at', { ascending: false })
      .order('variation_index', { ascending: true }),
    supabase
      .from('video_projects')
      .select('*')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('contenidos')
      .select('id, titulo, estado')
      .eq('cliente_id', params.id)
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('competitors')
      .select('*')
      .eq('client_id', params.id)
      .eq('active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('competitor_ads')
      .select('*, competitors(page_name)')
      .eq('client_id', params.id)
      .eq('is_active', true)
      .order('first_seen_at', { ascending: false })
      .limit(100),
    supabase
      .from('ci_reports')
      .select('*')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  if (errCliente || !clienteRaw) notFound()

  // Preload video scenes por proyecto (para <VideosClient />)
  const videoProjectIds = (videoProjectsRaw ?? []).map((p: { id: string }) => p.id)
  let videoScenesByProject: Record<string, unknown[]> = {}
  if (videoProjectIds.length > 0) {
    const { data: scenes } = await supabase
      .from('video_scenes')
      .select('*')
      .in('video_project_id', videoProjectIds)
      .order('scene_index', { ascending: true })
    videoScenesByProject = (scenes ?? []).reduce<Record<string, unknown[]>>((acc, s) => {
      const key = (s as { video_project_id: string }).video_project_id
      if (!acc[key]) acc[key] = []
      acc[key].push(s)
      return acc
    }, {})
  }

  const cliente: Cliente = {
    ...clienteRaw,
    restricciones_globales: (clienteRaw.restricciones_globales ?? []) as string[],
  }

  type ProyectoRow = Omit<
    Proyecto,
    | 'etiquetas_tono'
    | 'keywords_objetivo'
    | 'keywords_prohibidas'
    | 'tematicas_autorizadas'
    | 'tematicas_vetadas'
    | 'documentos_subidos'
  > & {
    etiquetas_tono: unknown
    keywords_objetivo: unknown
    keywords_prohibidas: unknown
    tematicas_autorizadas: unknown
    tematicas_vetadas: unknown
    documentos_subidos: unknown
    contenidos: { count: number }[]
  }

  const proyectos = ((proyectosRaw ?? []) as ProyectoRow[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    cliente_id: p.cliente_id,
    activo: p.activo,
    created_at: p.created_at,
    descripcion: p.descripcion,
    tono_voz: p.tono_voz,
    etiquetas_tono: (p.etiquetas_tono ?? []) as string[],
    keywords_objetivo: (p.keywords_objetivo ?? []) as string[],
    keywords_prohibidas: (p.keywords_prohibidas ?? []) as string[],
    tematicas_autorizadas: (p.tematicas_autorizadas ?? []) as string[],
    tematicas_vetadas: (p.tematicas_vetadas ?? []) as string[],
    perfil_lector: p.perfil_lector,
    modo_creativo: p.modo_creativo,
    modo_entrega: p.modo_entrega,
    cms_url: p.cms_url,
    drive_carpeta_url: p.drive_carpeta_url,
    wordpress_url: p.wordpress_url,
    excel_seo_url: p.excel_seo_url,
    contacto_aprobacion_nombre: p.contacto_aprobacion_nombre,
    contacto_aprobacion_email: p.contacto_aprobacion_email,
    documentos_subidos: (p.documentos_subidos ?? []) as Proyecto['documentos_subidos'],
    rag_ultima_actualizacion: p.rag_ultima_actualizacion,
    rag_num_documentos: p.rag_num_documentos,
    num_contenidos: p.contenidos?.[0]?.count ?? 0,
  }))

  // La vista puede no devolver fila si el cliente no tiene activos
  const baseCoverage = (coverageRaw ?? null) as BrandAssetsCoverage | null

  // Brand Assets: preparar props para <BrandAssetsClient />
  const brandAssets: BrandAssetRow[] = (brandAssetsRaw ?? []) as BrandAssetRow[]
  const brandContext: BrandContextRow | null = brandContextRaw
    ? (brandContextRaw as BrandContextRow)
    : null
  const hasContextDirect = brandContext !== null

  const coverageForBrandAssets: BrandAssetsCoverage = baseCoverage
    ? { ...baseCoverage, has_context: hasContextDirect }
    : {
        cliente_id: params.id,
        cliente_nombre: cliente.nombre,
        has_logo: false,
        has_brand_book: false,
        has_product_images: false,
        has_context: hasContextDirect,
        total_assets: 0,
        pending_review: 0,
        generation_status: 'blocked',
      }

  // Coverage para la tarjeta resumen (antes)
  const coverage = baseCoverage

  return (
    <ClienteDetalleClient
      cliente={cliente}
      proyectos={proyectos}
      coverage={coverage}
      // Brand Assets
      brandAssets={brandAssets}
      brandAssetsCoverage={coverageForBrandAssets}
      brandContext={brandContext}
      hasBrandContext={hasContextDirect}
      // Ad Creatives
      adCreatives={(adCreativesRaw ?? []) as AdCreative[]}
      // Videos
      videoProjects={(videoProjectsRaw ?? []) as VideoProject[]}
      videoScenesByProject={videoScenesByProject}
      videoContenidos={(videoContenidosRaw ?? []) as ContenidoOption[]}
      // Competitive Intelligence
      competitors={(competitorsRaw ?? []) as Competitor[]}
      competitorAds={(competitorAdsRaw ?? []) as CompetitorAdRow[]}
      latestCiReport={(ciReportsRaw?.[0] ?? null) as CiReportRow | null}
    />
  )
}
