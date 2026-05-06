import { createAdminClient } from '@/lib/supabase/admin'
import { PermissionGuard } from '@/components/PermissionGuard'
import CostesDashboard from './costes-dashboard'

// ─── Tipos de datos pasados al cliente ───────────────────────────────────────

export type FilaTablaContenido = {
  contenido_id   : string
  titulo         : string
  cliente_nombre : string
  proyecto_nombre: string
  fecha          : string
  coste_texto    : number
  coste_imagenes : number
  coste_total    : number
  estado         : string
}

export type CosteCliente = {
  cliente_id  : string
  nombre      : string
  coste_total : number
}

export type DesgloseTipo = {
  tipo        : string
  label       : string
  llamadas    : number
  coste_total : number
  tokens      : number
  unidades    : number
}

export type DesgloseServicio = {
  servicio   : string
  label      : string
  color      : string
  coste_total: number
  llamadas   : number
}

export type CostesDashboardData = {
  mes                 : number
  anyo                : number
  totalMes            : number
  costeMedioContenido : number
  numContenidos       : number
  proyeccionFinMes    : number
  tablaContenidos     : FilaTablaContenido[]
  costesPorCliente    : CosteCliente[]
  desglosePorTipo     : DesgloseTipo[]
  desgloseServicio    : DesgloseServicio[]
  clientes            : Array<{ id: string; nombre: string }>
  filtroCliente       : string | null
  pagina              : number
  totalPaginas        : number
}

const ETIQUETAS_TIPO: Record<string, string> = {
  borrador           : 'Generación de borradores',
  copiloto           : 'Conversaciones copiloto',
  revision           : 'Revisiones GEO-SEO',
  brief_seo          : 'Brief SEO',
  prompt_imagen      : 'Prompts de imagen',
  rag_embedding      : 'Embeddings RAG',
  imagen_flux        : 'Imágenes destacadas',
  ad_creative        : 'Piezas sociales (FLUX)',
  video_reel         : 'Vídeos Reel (FLUX)',
  video_story        : 'Vídeos Story (FLUX)',
  humanizacion       : 'Humanización de texto',
  georadar_claude    : 'GEORadar · Claude',
  georadar_gpt4      : 'GEORadar · GPT-4o',
  georadar_gemini    : 'GEORadar · Gemini',
  georadar_perplexity: 'GEORadar · Perplexity',
  serpapi_search     : 'Búsquedas SerpApi',
  dataforseo_keywords: 'DataForSEO Ideas',
  dataforseo_volume  : 'DataForSEO Volúmenes',
  competitor_keywords: 'DataForSEO Competidores',
  analisis_web       : 'Análisis web (Claude)',
}

const SERVICIOS_GRUPOS: Array<{ id: string; label: string; color: string; tipos: string[] }> = [
  { id: 'claude',     label: 'Claude (Anthropic)',  color: 'bg-orange-500',  tipos: ['borrador','copiloto','revision','brief_seo','prompt_imagen','humanizacion','georadar_claude','analisis_web'] },
  { id: 'flux',       label: 'FLUX (FAL.ai)',        color: 'bg-pink-500',    tipos: ['imagen_flux','ad_creative','video_reel','video_story'] },
  { id: 'apis',       label: 'APIs externas',        color: 'bg-amber-500',   tipos: ['serpapi_search','dataforseo_keywords','dataforseo_volume','competitor_keywords'] },
  { id: 'rag',        label: 'RAG (OpenAI Embed)',   color: 'bg-teal-500',    tipos: ['rag_embedding'] },
  { id: 'gpt4',       label: 'GPT-4o (OpenAI)',      color: 'bg-emerald-500', tipos: ['georadar_gpt4'] },
  { id: 'gemini',     label: 'Gemini (Google)',       color: 'bg-blue-500',    tipos: ['georadar_gemini'] },
  { id: 'perplexity', label: 'Perplexity',            color: 'bg-purple-500',  tipos: ['georadar_perplexity'] },
]

const POR_PAGINA = 20

export default async function CostesPage({
  searchParams,
}: {
  searchParams: { mes?: string; anyo?: string; cliente?: string; pagina?: string }
}) {
  const supabase = createAdminClient()
  const hoy = new Date()

  const mes    = parseInt(searchParams.mes   ?? String(hoy.getMonth() + 1))
  const anyo   = parseInt(searchParams.anyo  ?? String(hoy.getFullYear()))
  const pagina = Math.max(1, parseInt(searchParams.pagina ?? '1'))
  const filtroCliente = searchParams.cliente ?? null

  // Rango del mes seleccionado
  const inicioMes = new Date(anyo, mes - 1, 1)
  const finMes    = new Date(anyo, mes, 0, 23, 59, 59, 999)

  // ── 1. Todos los registros de costes del mes ──────────────────────────────
  const { data: registros } = await supabase
    .from('registros_costes')
    .select('id, created_at, tipo_operacion, agente, coste_usd, tokens_input, tokens_output, unidades, contenido_id, proyecto_id, cliente_id')
    .gte('created_at', inicioMes.toISOString())
    .lte('created_at', finMes.toISOString())
    .order('created_at', { ascending: false })

  const regs = registros ?? []

  // ── 2. Datos de contenidos y sus relaciones ──────────────────────────────
  const contenidoIds = Array.from(new Set(regs.map(r => r.contenido_id).filter(Boolean))) as string[]

  const [
    { data: contenidosRaw },
    { data: clientesAll },
  ] = await Promise.all([
    contenidoIds.length > 0
      ? supabase
          .from('contenidos')
          .select('id, titulo, estado, cliente_id, proyecto_id, created_at')
          .in('id', contenidoIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('clientes')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre'),
  ])

  const contenidosMap = new Map((contenidosRaw ?? []).map(c => [c.id, c]))

  // Recopilar todos los cliente_ids: directos en los registros + via contenidos
  const clienteIdsDirectos = regs.map(r => r.cliente_id).filter(Boolean) as string[]
  const clienteIdsCont     = (contenidosRaw ?? []).map(c => c.cliente_id).filter(Boolean) as string[]
  const todosClienteIds    = Array.from(new Set([...clienteIdsDirectos, ...clienteIdsCont]))

  const proyIdsCont  = Array.from(new Set((contenidosRaw ?? []).map(c => c.proyecto_id).filter(Boolean))) as string[]
  const proyectoIds  = Array.from(new Set(regs.map(r => r.proyecto_id).filter(Boolean))) as string[]
  const todosProyIds = Array.from(new Set([...proyectoIds, ...proyIdsCont]))

  const [
    { data: clientesDetalle },
    { data: proyectosDetalle },
  ] = await Promise.all([
    todosClienteIds.length > 0
      ? supabase.from('clientes').select('id, nombre').in('id', todosClienteIds)
      : Promise.resolve({ data: [] }),
    todosProyIds.length > 0
      ? supabase.from('proyectos').select('id, nombre, cliente_id').in('id', todosProyIds)
      : Promise.resolve({ data: [] }),
  ])

  const clientesMap  = new Map((clientesDetalle ?? []).map(c => [c.id, c]))
  const proyectosMap = new Map((proyectosDetalle ?? []).map(p => [p.id, p]))

  // Helper para obtener el cliente_id efectivo de un registro
  function getClienteId(r: (typeof regs)[0]): string | null {
    return r.cliente_id
      ?? (r.contenido_id ? (contenidosMap.get(r.contenido_id)?.cliente_id ?? null) : null)
  }

  // ── 3. KPIs ──────────────────────────────────────────────────────────────
  const regsFiltrados = filtroCliente
    ? regs.filter(r => getClienteId(r) === filtroCliente)
    : regs

  // ── 5. KPIs ───────────────────────────────────────────────────────────────
  const totalMes = regsFiltrados.reduce((s, r) => s + Number(r.coste_usd), 0)

  const contenidosConCoste = new Set(regsFiltrados.map(r => r.contenido_id).filter(Boolean))
  const numContenidos = contenidosConCoste.size

  const costeMedioContenido = numContenidos > 0 ? totalMes / numContenidos : 0

  const diasEnMes = new Date(anyo, mes, 0).getDate()
  const diaActual = (anyo === hoy.getFullYear() && mes === hoy.getMonth() + 1)
    ? hoy.getDate()
    : diasEnMes
  const costeDiario = diaActual > 0 ? totalMes / diaActual : 0
  const proyeccionFinMes = costeDiario * diasEnMes

  // ── 6. Tabla de costes por contenido ─────────────────────────────────────
  type AggContenido = {
    coste_texto   : number
    coste_imagenes: number
    coste_total   : number
  }
  const aggContenido = new Map<string, AggContenido>()

  regsFiltrados.forEach(r => {
    if (!r.contenido_id) return
    const curr = aggContenido.get(r.contenido_id) ?? { coste_texto: 0, coste_imagenes: 0, coste_total: 0 }
    const esImagen = ['imagen_flux', 'ad_creative', 'video_reel', 'video_story'].includes(r.tipo_operacion)
    if (esImagen) curr.coste_imagenes += Number(r.coste_usd)
    else          curr.coste_texto    += Number(r.coste_usd)
    curr.coste_total += Number(r.coste_usd)
    aggContenido.set(r.contenido_id, curr)
  })

  const tablaCompleta: FilaTablaContenido[] = Array.from(aggContenido.entries())
    .map(([cid, costes]) => {
      const cont    = contenidosMap.get(cid)
      const cliente = cont ? clientesMap.get(cont.cliente_id) : null
      const proyecto = cont ? proyectosMap.get(cont.proyecto_id) : null
      return {
        contenido_id   : cid,
        titulo         : cont?.titulo         ?? '(sin título)',
        cliente_nombre : cliente?.nombre      ?? '—',
        proyecto_nombre: proyecto?.nombre     ?? '—',
        fecha          : cont?.created_at     ?? '',
        coste_texto    : costes.coste_texto,
        coste_imagenes : costes.coste_imagenes,
        coste_total    : costes.coste_total,
        estado         : cont?.estado         ?? '—',
      }
    })
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

  const totalPaginas = Math.max(1, Math.ceil(tablaCompleta.length / POR_PAGINA))
  const tablaContenidos = tablaCompleta.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  // ── 5. Coste por cliente (incluye registros sin contenido) ───────────────
  const aggCliente = new Map<string, { nombre: string; coste_total: number }>()
  regsFiltrados.forEach(r => {
    const clienteId = getClienteId(r)
    if (!clienteId) return
    const cli    = clientesMap.get(clienteId)
    const nombre = cli?.nombre ?? '(sin cliente)'
    const curr   = aggCliente.get(clienteId) ?? { nombre, coste_total: 0 }
    curr.coste_total += Number(r.coste_usd)
    aggCliente.set(clienteId, curr)
  })

  const costesPorCliente: CosteCliente[] = Array.from(aggCliente.entries())
    .map(([id, v]) => ({ cliente_id: id, nombre: v.nombre, coste_total: v.coste_total }))
    .sort((a, b) => b.coste_total - a.coste_total)

  // ── 8. Desglose por tipo de operación ────────────────────────────────────
  const aggTipo = new Map<string, { llamadas: number; coste_total: number; tokens: number; unidades: number }>()
  regsFiltrados.forEach(r => {
    const curr = aggTipo.get(r.tipo_operacion) ?? { llamadas: 0, coste_total: 0, tokens: 0, unidades: 0 }
    curr.llamadas    += 1
    curr.coste_total += Number(r.coste_usd)
    curr.tokens      += (r.tokens_input ?? 0) + (r.tokens_output ?? 0)
    curr.unidades    += r.unidades ?? 1
    aggTipo.set(r.tipo_operacion, curr)
  })

  const desglosePorTipo: DesgloseTipo[] = Array.from(aggTipo.entries())
    .map(([tipo, v]) => ({
      tipo,
      label      : ETIQUETAS_TIPO[tipo] ?? tipo,
      llamadas   : v.llamadas,
      coste_total: v.coste_total,
      tokens     : v.tokens,
      unidades   : v.unidades,
    }))
    .sort((a, b) => b.coste_total - a.coste_total)

  // ── 7. Desglose por servicio / proveedor ─────────────────────────────────
  const desgloseServicio: DesgloseServicio[] = SERVICIOS_GRUPOS
    .map(grupo => {
      const registrosGrupo = regsFiltrados.filter(r => grupo.tipos.includes(r.tipo_operacion))
      return {
        servicio   : grupo.id,
        label      : grupo.label,
        color      : grupo.color,
        coste_total: registrosGrupo.reduce((s, r) => s + Number(r.coste_usd), 0),
        llamadas   : registrosGrupo.length,
      }
    })
    .filter(g => g.coste_total > 0)
    .sort((a, b) => b.coste_total - a.coste_total)

  // ── Props para el cliente ─────────────────────────────────────────────────
  const data: CostesDashboardData = {
    mes,
    anyo,
    totalMes,
    costeMedioContenido,
    numContenidos,
    proyeccionFinMes,
    tablaContenidos,
    costesPorCliente,
    desglosePorTipo,
    desgloseServicio,
    clientes     : (clientesAll ?? []).map(c => ({ id: c.id, nombre: c.nombre })),
    filtroCliente,
    pagina,
    totalPaginas,
  }

  return (
    <PermissionGuard permission="module:costes">
      <CostesDashboard data={data} />
    </PermissionGuard>
  )
}
