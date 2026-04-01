import { createAdminClient } from '@/lib/supabase/admin'
import ContenidosPageClient from './contenidos-client'
import type { EstadoContenido } from '@/types'

export interface FilaContenido {
  id: string
  titulo: string
  cliente_id: string
  cliente_nombre: string
  proyecto_id: string
  proyecto_nombre: string
  keyword_principal?: string
  redactor?: string
  estado: EstadoContenido
  fecha_entrega?: string
}

export default async function ContenidosPage() {
  const supabase = createAdminClient()

  // ── Query principal — sin filtro de estado, sin JOIN a perfiles_autor
  // perfiles_autor se hacía con INNER JOIN implícito en PostgREST cuando
  // redactor_id era NULL, lo que filtraba las filas sin redactor asignado.
  // Solución: traer redactor_id como columna y hacer lookup separado.
  const { data, error } = await supabase
    .from('contenidos')
    .select(`
      id, titulo, estado, keyword_principal, fecha_entrega,
      cliente_id, proyecto_id, redactor_id,
      proyectos ( id, nombre ),
      clientes  ( id, nombre )
    `)
    .order('created_at', { ascending: false })

  console.log('[contenidos] rows fetched:', data?.length ?? 0, '| error:', error?.message ?? 'none')

  if (error) {
    console.error('[contenidos] Supabase error:', error)
  }

  // ── Lookup de nombres de redactor en query separada ──────────────────────
  const redactorIds = Array.from(
    new Set(
      (data ?? [])
        .map((c) => (c as unknown as { redactor_id: string | null }).redactor_id)
        .filter(Boolean) as string[]
    )
  )

  const autoresMap = new Map<string, string>()
  if (redactorIds.length > 0) {
    const { data: autores, error: autoresError } = await supabase
      .from('perfiles_autor')
      .select('id, nombre')
      .in('id', redactorIds)

    if (autoresError) {
      console.error('[contenidos] Error fetching autores:', autoresError.message)
    }
    ;(autores ?? []).forEach((a) => autoresMap.set(a.id, a.nombre))
    console.log('[contenidos] autores resueltos:', autoresMap.size)
  }

  // ── Mapeo a FilaContenido ─────────────────────────────────────────────────
  type Row = {
    id: string
    titulo: string
    estado: string
    keyword_principal: string | null
    fecha_entrega: string | null
    cliente_id: string
    proyecto_id: string
    redactor_id: string | null
    proyectos: { id: string; nombre: string } | null
    clientes:  { id: string; nombre: string } | null
  }

  const contenidos: FilaContenido[] = ((data ?? []) as unknown as Row[]).map((c) => ({
    id: c.id,
    titulo: c.titulo,
    cliente_id: c.cliente_id,
    cliente_nombre: c.clientes?.nombre ?? '—',
    proyecto_id: c.proyecto_id,
    proyecto_nombre: c.proyectos?.nombre ?? '—',
    keyword_principal: c.keyword_principal ?? undefined,
    redactor: c.redactor_id ? (autoresMap.get(c.redactor_id) ?? undefined) : undefined,
    estado: c.estado as EstadoContenido,
    fecha_entrega: c.fecha_entrega ?? undefined,
  }))

  console.log('[contenidos] mapeados:', contenidos.length)

  return <ContenidosPageClient contenidos={contenidos} />
}
