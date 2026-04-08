import { createAdminClient } from '@/lib/supabase/admin'
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
  servicio    : string
  label       : string
  color       : string
  llamadas    : number
  coste_total : number
}

export type CostesDashboardData = {
  mes                  : number
  anyo                 : number
  totalMes             : number
  costeMedioContenido  : number
  numContenidos        : number
  proyeccionFinMes     : number
  tablaContenidos      : FilaTablaContenido[]
  costesPorCliente     : CosteCliente[]
  desglosePorTipo      : DesgloseTipo[]
  desgloseServicio     : DesgloseServicio[]
  clientes             : Array<{ id: string; nombre: string }>
  filtroCliente        : string | null
  pagina               : number
  totalPaginas         : number
}

const ETIQUETAS_TIPO: Record<string, string> = {
  // Claude API — contenidos
  borrador          : 'Generación de borradores',
  copiloto          : 'Conversaciones copiloto',
  revision          : 'Revisiones GEO-SEO',
  humanizacion      : 'Humanizador de texto',
  brief_seo         : 'Brief SEO',
  prompt_imagen     : 'Prompts de imagen',
  // Claude API — otros módulos
  inspiracion       : 'Agente Inspiración',
  estrategia_claude : 'Estrategia (Claude)',
  georadar_claude   : 'GEORadar — Claude',
  // OpenAI
  rag_embedding     : 'Embeddings RAG',
  georadar_gpt4     : 'GEORadar — GPT-4o',
  // Gemini / Perplexity
  georadar_gemini   : 'GEORadar — Gemini',
  georadar_perplexity: 'GEORadar — Perplexity',
  // Imágenes
  imagen_flux       : 'Imágenes destacadas (FLUX)',
  ad_creative       : 'Piezas sociales (FLUX)',
  video_reel        : 'Reels (FLUX)',
  video_story       : 'Stories (FLUX)',
  // APIs externas
  serpapi           : 'SerpApi',
  datasorseo        : 'DataForSEO',
  georadar_scan     : 'GEORadar (scan completo)',
}

// Agrupación de tipos en servicios para el desglose visual
const SERVICIOS: Array<{
  servicio : string
  label    : string
  color    : string
  tipos    : string[]
}> = [
  {
    servicio: 'claude',
    label   : 'Claude API',
    color   : 'bg-violet-500',
    tipos   : ['borrador','copiloto','revision','humanizacion','brief_seo',
               'prompt_imagen','inspiracion','estrategia_claude','georadar_claude'],
  },
  {
    servicio: 'gpt4',
    label   : 'OpenAI GPT-4o',
    color   : 'bg-emerald-500',
    tipos   : ['georadar_gpt4'],
  },
  {
    servicio: 'gemini',
    label   : 'Google Gemini',
    color   : 'bg-blue-500',
    tipos   : ['georadar_gemini'],
  },
  {
    servicio: 'perplexity',
    label   : 'Perplexity',
    color   : 'bg-cyan-500',
    tipos   : ['georadar_perplexity'],
  },
  {
    servicio: 'flux',
    label   : 'Imágenes FLUX',
    color   : 'bg-amber-500',
    tipos   : ['imagen_flux','ad_creative','video_reel','video_story'],
  },
  {
    servicio: 'embeddings',
    label   : 'Embeddings RAG',
    color   : 'bg-indigo-400',
    tipos   : ['rag_embedding'],
  },
  {
    servicio: 'serpapi',
    label   : 'SerpApi',
    color   : 'bg-orange-500',
    tipos   : ['serpapi'],
  },
  {
    servicio: 'dataforseo',
    label   : 'DataForSEO',
    color   : 'bg-rose-500',
    tipos   : ['datasorseo'],
  },
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

  // ── 2. Datos de contenidos, clientes y proyectos vinculados ──────────────
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

  // Clientes y proyectos de los contenidos
  const clienteIds   = Array.from(new Set((contenidosRaw ?? []).map(c => c.cliente_id).filter(Boolean)))  as string[]
  const proyIdsCont  = Array.from(new Set((contenidosRaw ?? []).map(c => c.proyecto_id).filter(Boolean))) as string[]
  const proyectoIds  = Array.from(new Set(regs.map(r => r.proyecto_id).filter(Boolean))) as string[]
  const todosProyIds = Array.from(new Set([...proyectoIds, ...proyIdsCont]))

  const [
    { data: clientesDetalle },
    { data: proyectosDetalle },
  ] = await Promise.all([
    clienteIds.length > 0
      ? supabase.from('clientes').select('id, nombre').in('id', clienteIds)
      : Promise.resolve({ data: [] }),
    todosProyIds.length > 0
      ? supabase.from('proyectos').select('id, nombre, cliente_id').in('id', todosProyIds)
      : Promise.resolve({ data: [] }),
  ])

  const clientesMap  = new Map((clientesDetalle ?? []).map(c => [c.id, c]))
  const proyectosMap = new Map((proyectosDetalle ?? []).map(p => [p.id, p]))

  // Mapa de clientes completo (para label de los registros directos)
  const clientesAllMap = new Map((clientesAll ?? []).map(c => [c.id, c]))

  // ── 3. Helper: obtener cliente_id efectivo de un registro ────────────────
  // Un registro puede tener cliente_id directamente (nuevo) o via contenido_id (antiguo)
  function getClienteIdEfectivo(r: typeof regs[0]): string | null {
    if (r.cliente_id) return r.cliente_id
    if (r.contenido_id) return contenidosMap.get(r.contenido_id)?.cliente_id ?? null
    return null
  }

  // ── 4. Filtrar por cliente ────────────────────────────────────────────────
  const regsFiltrados = filtroCliente
    ? regs.filter(r => getClienteIdEfectivo(r) === filtroCliente)
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

  // ── 7. Coste por cliente (incluye registros directos sin contenido_id) ───
  const aggCliente = new Map<string, { nombre: string; coste_total: number }>()
  regsFiltrados.forEach(r => {
    const cid = getClienteIdEfectivo(r)
    if (!cid) return
    const cli = clientesAllMap.get(cid) ?? clientesMap.get(cid)
    const nombre = cli?.nombre ?? '(sin cliente)'
    const curr = aggCliente.get(cid) ?? { nombre, coste_total: 0 }
    curr.coste_total += Number(r.coste_usd)
    aggCliente.set(cid, curr)
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

  // ── 9. Desglose por servicio ──────────────────────────────────────────────
  const desgloseServicio: DesgloseServicio[] = SERVICIOS
    .map(srv => {
      const tiposSet = new Set(srv.tipos)
      let llamadas   = 0
      let coste_total = 0
      regsFiltrados.forEach(r => {
        if (tiposSet.has(r.tipo_operacion)) {
          llamadas    += 1
          coste_total += Number(r.coste_usd)
        }
      })
      return {
        servicio   : srv.servicio,
        label      : srv.label,
        color      : srv.color,
        llamadas,
        coste_total,
      }
    })
    .filter(s => s.coste_total > 0)
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

  return <CostesDashboard data={data} />
}
