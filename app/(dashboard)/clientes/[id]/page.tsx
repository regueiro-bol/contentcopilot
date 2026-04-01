import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import ClienteDetalleClient from './cliente-detalle-client'
import type { Cliente, Proyecto } from '@/types'
import type { BrandAssetsCoverage } from '@/types/brand-assets'

export default async function ClienteDetallePage({ params }: { params: { id: string } }) {
  const supabase = createAdminClient()

  const [
    { data: clienteRaw, error: errCliente },
    { data: proyectosRaw },
    { data: coverageRaw },
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
  ])

  if (errCliente || !clienteRaw) notFound()

  const cliente: Cliente = {
    ...clienteRaw,
    restricciones_globales: (clienteRaw.restricciones_globales ?? []) as string[],
  }

  type ProyectoRow = Omit<Proyecto, 'etiquetas_tono' | 'keywords_objetivo' | 'keywords_prohibidas' | 'tematicas_autorizadas' | 'tematicas_vetadas' | 'documentos_subidos'> & {
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
  const coverage = (coverageRaw ?? null) as BrandAssetsCoverage | null

  return <ClienteDetalleClient cliente={cliente} proyectos={proyectos} coverage={coverage} />
}
