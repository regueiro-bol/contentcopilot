'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Map,
  Download,
  Loader2,
  AlertCircle,
  ExternalLink,
  Layers,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Calendar,
  Plus,
  Search,
  Check,
  X,
  Minus,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { volumenLabel, dificultadLabel } from '@/lib/dataforseo'
import type { MapItem } from './page'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface SessionInfo {
  id           : string
  nombre       : string
  client_nombre: string
  status       : string
}

interface MapInfo {
  id       : string
  nombre   : string
  status   : string
  createdAt: string
  config   : Record<string, unknown>
}

interface Props {
  session : SessionInfo
  clientId: string | null
  map     : MapInfo | null
  items   : MapItem[]
}

interface SuggestResponse {
  suggested: {
    meses            : 3 | 6 | 9 | 12
    articulos_por_mes: number
    distribucion     : { tofu: number; mofu: number; bofu: number }
  }
  context: {
    total_keywords    : number
    total_clusters    : number
    distribucion_actual: { tofu: number; mofu: number; bofu: number }
    top_clusters      : Array<{ nombre: string; keywords: number; funnel: string; volume: number }>
    cobertura_estimada: number
  }
  razonamiento: string
}

const FOCUS_PRESETS = {
  balanced: { tofu: 40, mofu: 35, bofu: 25 },
  tofu    : { tofu: 60, mofu: 25, bofu: 15 },
  mofu    : { tofu: 25, mofu: 55, bofu: 20 },
  bofu    : { tofu: 20, mofu: 30, bofu: 50 },
} as const

// ─────────────────────────────────────────────────────────────
// Helpers de UI
// ─────────────────────────────────────────────────────────────

const FUNNEL_STYLE = {
  tofu: { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200', label: 'TOFU'  },
  mofu: { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200', label: 'MOFU'  },
  bofu: { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',   label: 'BOFU'  },
}

const PRIORITY_STYLE: Record<number, { label: string; cls: string }> = {
  1: { label: 'Alta',  cls: 'bg-indigo-100 text-indigo-700' },
  2: { label: 'Media', cls: 'bg-gray-100 text-gray-600' },
  3: { label: 'Baja',  cls: 'bg-gray-50 text-gray-400' },
}

// ── Sprint 2 helpers ──────────────────────────────────────────

function TipoArticuloBadge({ tipo }: { tipo: 'nuevo' | 'actualizacion' | 'mejora' | null }) {
  if (!tipo || tipo === 'nuevo') return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700">Nuevo</span>
  )
  if (tipo === 'mejora') return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700">Mejora</span>
  )
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700">Actual.</span>
  )
}

function PrioridadFinalBadge({ item }: { item: MapItem }) {
  const p = item.prioridad_final ?? item.priority
  const label = p === 1 ? 'P1' : p === 2 ? 'P2' : 'P3'
  const cls = p === 1
    ? 'bg-red-100 text-red-700'
    : p === 2
      ? 'bg-amber-100 text-amber-700'
      : 'bg-gray-100 text-gray-500'

  let tooltip = label
  if (item.p4_manual != null) {
    tooltip = `${label} forzado manualmente por consultor`
  } else if (item.p3_actualizacion) {
    tooltip = `${label} marcado manualmente por SEO`
  } else if (item.p2_oportunidad != null) {
    tooltip = `${label} por oportunidad (score ${item.p2_oportunidad.toLocaleString('es-ES')})`
    if (item.p1_volumen != null) tooltip += ` · ${item.p1_volumen.toLocaleString('es-ES')} búsquedas/mes`
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold cursor-help ${cls}`}
      title={tooltip}
    >
      {label}
    </span>
  )
}

const VALIDACION_STYLE: Record<string, { label: string; cls: string }> = {
  propuesto: { label: 'Propuesto', cls: 'bg-gray-100 text-gray-500'    },
  aprobado : { label: 'Aprobado',  cls: 'bg-green-100 text-green-700'  },
  rechazado: { label: 'Rechazado', cls: 'bg-red-100 text-red-700'      },
  revision : { label: 'Revisión',  cls: 'bg-amber-100 text-amber-700'  },
}

// ─────────────────────────────────────────────────────────────

function FunnelBadge({ stage }: { stage: 'tofu' | 'mofu' | 'bofu' | null }) {
  if (!stage) return <span className="text-gray-300 text-xs">—</span>
  const { bg, text, label } = FUNNEL_STYLE[stage]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${bg} ${text}`}>
      {label}
    </span>
  )
}

function PriorityBadge({ p }: { p: number }) {
  const { label, cls } = PRIORITY_STYLE[p] ?? PRIORITY_STYLE[2]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

function GapBadge({ status, url, score }: { status: 'gap' | 'existing_content' | 'partial' | null; url: string | null; score: number | null }) {
  if (!status) return null
  const pct = score != null ? `${Math.round(score * 100)}%` : null
  const cfg = {
    gap:              { label: 'Nuevo',     emoji: '🟢', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    existing_content: { label: 'Ya existe', emoji: '🟡', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    partial:          { label: 'Parcial',   emoji: '🔵', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  }[status]
  const tooltipText = {
    gap: 'Sin contenido similar en el blog. Oportunidad virgen — crear desde cero.',
    partial: `Existe contenido relacionado pero no cubre este tema exactamente.${pct ? ` Similitud: ${pct}.` : ''} Valorar nuevo artículo o ampliar el existente.`,
    existing_content: `Contenido muy similar ya publicado.${pct ? ` Similitud: ${pct}.` : ''} Mejor actualizar que crear nuevo.`,
  }[status]
  const inner = (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
      {cfg.emoji} {cfg.label}
    </span>
  )
  const wrapper = (children: React.ReactNode) => (
    <div style={{ position: 'relative', display: 'inline-block' }} className="group">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-gray-900 text-white text-[11px] leading-snug rounded-lg px-2.5 py-1.5 w-52 z-20 whitespace-normal shadow-lg pointer-events-none">
        {tooltipText}
      </div>
    </div>
  )
  if (status === 'existing_content' && url) {
    return wrapper(
      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
        {inner}
      </a>,
    )
  }
  return wrapper(inner)
}

/** Formatea "2026-05" → "Mayo 2026" */
function formatMonth(ym: string): string {
  if (!ym) return '—'
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const [year, month] = ym.split('-').map(Number)
  return `${MESES[(month - 1) % 12]} ${year}`
}

// ─────────────────────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────────────────────

function exportarCSV(items: MapItem[]) {
  const HEADERS = ['Mes', 'Título', 'Keyword principal', 'Cluster', 'Funnel', 'Volumen', 'Dificultad', 'Prioridad', 'Slug']
  const rows = items.map((i) => [
    i.suggested_month ?? '',
    i.title,
    i.main_keyword,
    i.cluster ?? '',
    (i.funnel_stage ?? '').toUpperCase(),
    i.volume ?? '',
    i.difficulty ?? '',
    i.priority === 1 ? 'Alta' : i.priority === 3 ? 'Baja' : 'Media',
    i.slug,
  ])
  const csv = [HEADERS, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `mapa-contenidos-${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export default function MapaClient({ session, clientId, map, items }: Props) {
  const router = useRouter()

  // ── Estado: generar nuevo mapa ─────────────────────────────
  const [mostrarConfig, setMostrarConfig]         = useState(false)
  const [meses, setMeses]                         = useState<3 | 6 | 9 | 12>(6)
  const [artMes, setArtMes]                       = useState(6)
  const [distribucion, setDistribucion]           = useState({ tofu: 40, mofu: 35, bofu: 25 })
  const [sugerencia, setSugerencia]               = useState<SuggestResponse | null>(null)
  const [cargandoSugerencia, setCargandoSugerencia] = useState(false)
  const [generando, setGenerando]                 = useState(false)
  const [errorGen, setErrorGen]                   = useState<string | null>(null)

  // ── Estado: crear pedidos desde mapa ───────────────────────
  // Tracks: map_item_id → contenido_id (cuando se crea exitosamente)
  const [pedidosCreados, setPedidosCreados] = useState<Record<string, string>>({})
  const [creandoPedido, setCreandoPedido]   = useState<string | null>(null)
  const [errorPedidoId, setErrorPedidoId]   = useState<string | null>(null) // qué item falló
  const [errorPedidoMsg, setErrorPedidoMsg] = useState<string | null>(null)

  // ── Estado: gap analysis ────────────────────────────────────
  const [analizandoGaps, setAnalizandoGaps] = useState(false)
  const [errorGaps, setErrorGaps]           = useState<string | null>(null)

  // ── Estado: exportar Excel ───────────────────────────────────
  const [exportandoExcel, setExportandoExcel] = useState(false)
  const [errorExcel, setErrorExcel]           = useState<string | null>(null)

  async function exportarExcel() {
    if (!map) return
    setExportandoExcel(true)
    setErrorExcel(null)
    try {
      const res = await fetch(`/api/strategy/${session.id}/export-excel`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Error ${res.status}` }))
        throw new Error(err.error ?? `Error ${res.status}`)
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') ?? ''
      const fnMatch = cd.match(/filename="([^"]+)"/)
      a.download = fnMatch?.[1] ?? `mapa-contenidos-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[exportarExcel]', e)
      setErrorExcel(e instanceof Error ? e.message : 'Error al generar el Excel')
    } finally {
      setExportandoExcel(false)
    }
  }
  // gapSummary: se deriva de los items para que persista entre recargas
  // Si ningún item tiene content_status, el análisis no se ha ejecutado aún
  const [gapForcedHide, setGapForcedHide] = useState(false)

  // ── Estado Sprint 2: filtros ──────────────────────────────────
  const [filtroTipo, setFiltroTipo]             = useState<'todos' | 'nuevo' | 'mejora' | 'actualizacion'>('todos')
  const [filtroValidacion, setFiltroValidacion] = useState<'todos' | 'propuesto' | 'aprobado' | 'rechazado' | 'revision'>('todos')
  const [filtroPrioridad, setFiltroPrioridad]   = useState<'todos' | '1' | '2' | '3'>('todos')
  const [filtroPedido, setFiltroPedido]         = useState<'todos' | 'con_pedido' | 'sin_pedido'>('todos')

  // ── Estado Sprint 2: validación ───────────────────────────────
  const [validandoItems, setValidandoItems]       = useState<Set<string>>(new Set())
  const [motivoPendiente, setMotivoPendiente]     = useState<Record<string, string>>({})
  const [rechazoPendienteId, setRechazoPendienteId] = useState<string | null>(null)
  // Overrides optimistas: itemId → cambios parciales
  const [localOverrides, setLocalOverrides]       = useState<Record<string, Partial<MapItem>>>({})

  async function handleAnalizarGaps() {
    if (!clientId || !map) return
    setAnalizandoGaps(true)
    setErrorGaps(null)
    setGapForcedHide(false)
    try {
      const res = await fetch('/api/strategy/check-existing', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ map_id: map.id, client_id: clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error analizando gaps')
      // El resumen se derivará automáticamente de los items tras router.refresh()
      router.refresh()
    } catch (e) {
      setErrorGaps(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setAnalizandoGaps(false)
    }
  }

  async function handleCrearPedido(item: MapItem) {
    if (!clientId || creandoPedido) return // evitar clicks simultáneos
    setCreandoPedido(item.id)
    setErrorPedidoId(null)
    setErrorPedidoMsg(null)
    try {
      const res = await fetch('/api/pedidos/desde-mapa', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          map_item_id         : item.id,
          client_id           : clientId,
          titulo              : item.title,
          keyword_principal   : item.main_keyword,
          keywords_secundarias: item.secondary_keywords,
          ...(item.content_status === 'existing_content' && {
            tipo        : 'actualizacion',
            existing_url: item.existing_url,
          }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error creando pedido')
      setPedidosCreados((prev) => ({ ...prev, [item.id]: data.contenido_id as string }))
    } catch (e) {
      setErrorPedidoId(item.id)
      setErrorPedidoMsg(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCreandoPedido(null)
    }
  }

  async function handleValidar(
    itemId : string,
    mapId  : string,
    validacion: 'propuesto' | 'aprobado' | 'rechazado' | 'revision',
    motivo?: string,
  ) {
    setValidandoItems((prev) => new Set(prev).add(itemId))
    // Optimistic update
    setLocalOverrides((prev) => ({
      ...prev,
      [itemId]: { validacion, motivo_rechazo: motivo ?? null, fecha_validacion: new Date().toISOString() },
    }))
    setRechazoPendienteId(null)
    try {
      const res = await fetch(`/api/strategy/mapa/${mapId}/validar`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify([{ item_id: itemId, validacion, motivo_rechazo: motivo }]),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
    } catch {
      // revertir optimistic update si falla
      setLocalOverrides((prev) => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
    } finally {
      setValidandoItems((prev) => { const n = new Set(prev); n.delete(itemId); return n })
    }
  }

  // ── Estado: colapso de secciones de mes ───────────────────
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set<string>())

  // ── Items con overrides optimistas aplicados ──────────────
  const itemsMerged: MapItem[] = useMemo(
    () => items.map((i) => localOverrides[i.id] ? { ...i, ...localOverrides[i.id] } : i),
    [items, localOverrides],
  )

  // ── Filtrado ───────────────────────────────────────────────
  const filteredItems: MapItem[] = useMemo(() => {
    return itemsMerged.filter((i) => {
      if (filtroTipo !== 'todos' && (i.tipo_articulo ?? 'nuevo') !== filtroTipo) return false
      if (filtroValidacion !== 'todos' && (i.validacion ?? 'propuesto') !== filtroValidacion) return false
      if (filtroPrioridad !== 'todos' && String(i.prioridad_final ?? i.priority) !== filtroPrioridad) return false
      const tienePedido = !!(pedidosCreados[i.id] ?? i.contenido_id)
      if (filtroPedido === 'con_pedido'  && !tienePedido) return false
      if (filtroPedido === 'sin_pedido'  &&  tienePedido) return false
      return true
    })
  }, [itemsMerged, filtroTipo, filtroValidacion, filtroPrioridad, filtroPedido, pedidosCreados])

  // ── Agrupar por mes ────────────────────────────────────────
  const monthGroups: [string, MapItem[]][] = useMemo(() => {
    const groupMap: Record<string, MapItem[]> = {}
    for (const item of filteredItems) {
      const key = item.suggested_month ?? 'Sin mes'
      if (!groupMap[key]) groupMap[key] = []
      groupMap[key].push(item)
    }
    return Object.entries(groupMap).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredItems])

  // ── Gap summary derivado de los datos (persistente) ───────
  const gapSummaryDerived = useMemo(() => {
    const itemsConGap = itemsMerged.filter((i) => i.content_status !== null)
    if (itemsConGap.length === 0) return null
    return {
      gap             : itemsMerged.filter((i) => i.content_status === 'gap').length,
      existing_content: itemsMerged.filter((i) => i.content_status === 'existing_content').length,
      partial         : itemsMerged.filter((i) => i.content_status === 'partial').length,
    }
  }, [itemsMerged])

  const gapEjecutado = gapSummaryDerived !== null

  // ── KPIs ───────────────────────────────────────────────────
  const totalNuevos        = itemsMerged.filter((i) => (i.tipo_articulo ?? 'nuevo') === 'nuevo').length
  const totalMejoras       = itemsMerged.filter((i) => i.tipo_articulo === 'mejora').length
  const totalActualizacion = itemsMerged.filter((i) => i.tipo_articulo === 'actualizacion').length
  const totalValidados     = itemsMerged.filter((i) => (i.validacion ?? 'propuesto') !== 'propuesto').length
  const totalConPedido     = itemsMerged.filter((i) => !!(pedidosCreados[i.id] ?? i.contenido_id)).length

  // ── Acción: sugerir configuración ────────────────────────
  async function fetchSugerencia() {
    setCargandoSugerencia(true)
    setSugerencia(null)
    try {
      const res = await fetch('/api/strategy/suggest-map-config', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ session_id: session.id }),
      })
      if (!res.ok) return
      const data = await res.json() as SuggestResponse
      setSugerencia(data)
      // Auto-aplicar sugerencia
      setMeses(data.suggested.meses)
      setArtMes(data.suggested.articulos_por_mes)
      setDistribucion(data.suggested.distribucion)
    } catch (e) {
      console.error('[SuggestConfig]', e)
    } finally {
      setCargandoSugerencia(false)
    }
  }

  function aplicarSugerencia() {
    if (!sugerencia) return
    setMeses(sugerencia.suggested.meses)
    setArtMes(sugerencia.suggested.articulos_por_mes)
    setDistribucion(sugerencia.suggested.distribucion)
  }

  function handleDistChange(stage: 'tofu' | 'mofu' | 'bofu', rawValue: number) {
    const newVal = Math.max(10, Math.min(80, rawValue))
    const others = (['tofu', 'mofu', 'bofu'] as const).filter((s) => s !== stage)
    const remaining    = 100 - newVal
    const prevOtherSum = distribucion[others[0]] + distribucion[others[1]]
    let new0 = prevOtherSum > 0
      ? Math.max(10, Math.round((distribucion[others[0]] / prevOtherSum) * remaining))
      : Math.max(10, Math.round(remaining / 2))
    let new1 = remaining - new0
    if (new1 < 10) { new1 = 10; new0 = remaining - new1 }
    if (new0 < 10) return // no satisfacible, ignorar
    setDistribucion((prev) => ({
      ...prev,
      [stage]    : newVal,
      [others[0]]: new0,
      [others[1]]: new1,
    }))
  }

  // ── Acción: generar mapa ───────────────────────────────────
  async function handleGenerarMapa() {
    setGenerando(true)
    setErrorGen(null)
    try {
      const res = await fetch('/api/strategy/generate-map', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          session_id: session.id,
          config    : { meses, articulos_por_mes: artMes, distribucion },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error generando mapa')
      router.refresh()
      setMostrarConfig(false)
    } catch (e) {
      setErrorGen(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setGenerando(false)
    }
  }

  function toggleMonth(mes: string) {
    setCollapsedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(mes)) next.delete(mes)
      else next.add(mes)
      return next
    })
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{session.nombre}</h1>
          <p className="text-sm text-gray-500">{session.client_nombre}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/strategy/${session.id}/clustering`}>
              <Layers className="h-4 w-4 mr-1" />
              Clustering
            </Link>
          </Button>
          {items.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAnalizarGaps}
                disabled={analizandoGaps || !clientId || !map}
                className="gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              >
                {analizandoGaps
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Analizando...</>
                  : gapEjecutado
                    ? <><Search className="h-4 w-4" />Re-analizar gaps</>
                    : <><Search className="h-4 w-4" />Analizar gaps</>
                }
              </Button>
              {/* Filtros */}
              <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1">
                <Filter className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
                  className="text-xs text-gray-600 bg-transparent outline-none cursor-pointer"
                >
                  <option value="todos">Tipo: todos</option>
                  <option value="nuevo">Nuevo</option>
                  <option value="mejora">Mejora</option>
                  <option value="actualizacion">Actualización</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1">
                <select
                  value={filtroValidacion}
                  onChange={(e) => setFiltroValidacion(e.target.value as typeof filtroValidacion)}
                  className="text-xs text-gray-600 bg-transparent outline-none cursor-pointer"
                >
                  <option value="todos">Validación: todos</option>
                  <option value="propuesto">Propuesto</option>
                  <option value="aprobado">Aprobado</option>
                  <option value="rechazado">Rechazado</option>
                  <option value="revision">En revisión</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1">
                <select
                  value={filtroPrioridad}
                  onChange={(e) => setFiltroPrioridad(e.target.value as typeof filtroPrioridad)}
                  className="text-xs text-gray-600 bg-transparent outline-none cursor-pointer"
                >
                  <option value="todos">Prioridad: todos</option>
                  <option value="1">P1</option>
                  <option value="2">P2</option>
                  <option value="3">P3</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1">
                <select
                  value={filtroPedido}
                  onChange={(e) => setFiltroPedido(e.target.value as typeof filtroPedido)}
                  className="text-xs text-gray-600 bg-transparent outline-none cursor-pointer"
                >
                  <option value="todos">Pedido: todos</option>
                  <option value="con_pedido">Con pedido</option>
                  <option value="sin_pedido">Sin pedido</option>
                </select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => exportarCSV(items)}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportarExcel}
                disabled={exportandoExcel || !map}
                className="gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                title={errorExcel ?? undefined}
              >
                {exportandoExcel
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Generando...</>
                  : errorExcel
                    ? <><AlertCircle className="h-4 w-4 text-red-500" />Error Excel</>
                    : <><Download className="h-4 w-4" />Exportar Excel</>
                }
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const opening = !mostrarConfig
              setMostrarConfig(opening)
              if (opening) fetchSugerencia()
            }}
            className="gap-2 text-violet-700 border-violet-200 hover:bg-violet-50"
          >
            <Map className="h-4 w-4" />
            {map ? 'Nuevo mapa' : 'Generar mapa'}
          </Button>
        </div>
      </div>

      {/* KPIs + barra de validación */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: 'Total',         value: items.length,       color: 'text-gray-700'   },
              { label: 'Nuevos',        value: totalNuevos,        color: 'text-green-700'  },
              { label: 'Mejoras',       value: totalMejoras,       color: 'text-amber-700'  },
              { label: 'Actualizac.',   value: totalActualizacion, color: 'text-blue-700'   },
              { label: 'Validados',     value: totalValidados,     color: 'text-indigo-700' },
              { label: 'Con pedido',    value: totalConPedido,     color: 'text-violet-700' },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="p-2.5">
                  <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Barra de progreso de validación */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 shrink-0">
              {totalValidados}/{items.length} artículos validados
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${items.length > 0 ? Math.round(totalValidados / items.length * 100) : 0}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-indigo-600 shrink-0 tabular-nums">
              {items.length > 0 ? Math.round(totalValidados / items.length * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {/* Gap analysis feedback */}
      {analizandoGaps && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Comparando {items.length} artículos con la base documental del cliente...
        </div>
      )}
      {errorGaps && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {errorGaps}
        </div>
      )}
      {gapSummaryDerived && !analizandoGaps && !gapForcedHide && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-xs bg-gray-50 rounded-lg px-4 py-2.5">
            <span className="font-semibold text-gray-600">Gap analysis:</span>
            <span className="text-emerald-700">🟢 {gapSummaryDerived.gap} nuevos</span>
            <span className="text-amber-700">🟡 {gapSummaryDerived.existing_content} existentes</span>
            <span className="text-blue-700">🔵 {gapSummaryDerived.partial} parciales</span>
            <button
              type="button"
              onClick={() => setGapForcedHide(true)}
              className="ml-auto text-gray-400 hover:text-gray-600 text-[11px]"
            >
              Ocultar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { emoji: '🟢', title: 'Nuevo', desc: 'No existe contenido similar. Crear desde cero.', border: 'border-emerald-200', bg: 'bg-emerald-50/50', text: 'text-emerald-800' },
              { emoji: '🔵', title: 'Parcial', desc: 'Existe contenido relacionado pero incompleto. Crear nuevo enfoque o ampliar el existente.', border: 'border-blue-200', bg: 'bg-blue-50/50', text: 'text-blue-800' },
              { emoji: '🟡', title: 'Ya existe', desc: 'Contenido muy similar ya publicado. Valorar actualización en lugar de crear nuevo.', border: 'border-amber-200', bg: 'bg-amber-50/50', text: 'text-amber-800' },
            ].map((item) => (
              <div key={item.title} className={`flex items-start gap-2.5 rounded-lg border ${item.border} ${item.bg} px-3 py-2.5`}>
                <span className="text-base leading-none mt-0.5">{item.emoji}</span>
                <div>
                  <p className={`text-xs font-semibold ${item.text}`}>{item.title}</p>
                  <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panel generar mapa */}
      {mostrarConfig && (
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="p-5 space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Map className="h-4 w-4 text-violet-600" />
                Configurar mapa editorial
              </p>
              <button
                type="button"
                onClick={() => { setMostrarConfig(false); setErrorGen(null) }}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >
                Cancelar
              </button>
            </div>

            {/* Análisis IA */}
            {cargandoSugerencia && (
              <div className="flex items-center gap-2 rounded-lg bg-violet-100 border border-violet-200 px-3 py-2.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600 shrink-0" />
                <span className="text-xs text-violet-700">Analizando tus keywords y clusters…</span>
              </div>
            )}

            {sugerencia && !cargandoSugerencia && (
              <div className="rounded-lg border border-violet-200 bg-white p-3 space-y-3">
                {/* Stats de contexto */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-gray-50 px-2 py-2">
                    <p className="text-base font-bold text-gray-900 tabular-nums">{sugerencia.context.total_clusters}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">clusters</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-2 py-2">
                    <p className="text-base font-bold text-gray-900 tabular-nums">{sugerencia.context.total_keywords}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">keywords</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-2 py-2">
                    <p className="text-base font-bold text-violet-700 tabular-nums">{sugerencia.context.cobertura_estimada}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">art. estimados</p>
                  </div>
                </div>

                {/* Distribución actual del funnel */}
                <div className="flex items-center gap-2">
                  {([['tofu', 'bg-green-400'], ['mofu', 'bg-amber-400'], ['bofu', 'bg-red-400']] as const).map(([stage, color]) => (
                    <div key={stage} className="flex items-center gap-1">
                      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
                      <span className="text-[10px] text-gray-500 uppercase font-medium">{stage}</span>
                      <span className="text-[10px] font-bold text-gray-700">{sugerencia.context.distribucion_actual[stage]}%</span>
                    </div>
                  ))}
                  <span className="text-[10px] text-gray-400 ml-auto">distribución actual</span>
                </div>

                {/* Recomendación */}
                <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2.5 space-y-2">
                  <p className="text-[11px] font-semibold text-violet-700">✨ Sugerencia IA</p>
                  <p className="text-[11px] text-violet-600 leading-relaxed">{sugerencia.razonamiento}</p>
                  <button
                    type="button"
                    onClick={aplicarSugerencia}
                    className="text-[11px] font-semibold text-violet-700 underline hover:text-violet-900 transition-colors"
                  >
                    Restaurar sugerencia →
                  </button>
                </div>
              </div>
            )}

            {/* Duración + Artículos / mes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-600">Duración del plan</p>
                <div className="flex gap-1.5">
                  {([3, 6, 9, 12] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMeses(m)}
                      className={cn(
                        'flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors',
                        meses === m
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400',
                      )}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-600">
                  Artículos / mes
                  <span className="ml-1.5 font-bold text-violet-700">{artMes}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setArtMes((v) => Math.max(2, v - 1))}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:border-violet-400 hover:text-violet-600 text-xs font-bold transition-colors"
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={2}
                    max={15}
                    step={1}
                    value={artMes}
                    onChange={(e) => setArtMes(Number(e.target.value))}
                    className="flex-1 h-1.5 appearance-none rounded-full bg-gray-200 accent-violet-600 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setArtMes((v) => Math.min(15, v + 1))}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:border-violet-400 hover:text-violet-600 text-xs font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Distribución por embudo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">Distribución por embudo</p>
                {/* Presets rápidos */}
                <div className="flex gap-1">
                  {(Object.entries(FOCUS_PRESETS) as [keyof typeof FOCUS_PRESETS, { tofu: number; mofu: number; bofu: number }][]).map(([key, preset]) => {
                    const isActive =
                      distribucion.tofu === preset.tofu &&
                      distribucion.mofu === preset.mofu &&
                      distribucion.bofu === preset.bofu
                    const labels = { balanced: 'Equil.', tofu: '↑TOFU', mofu: '↑MOFU', bofu: '↑BOFU' }
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDistribucion(preset)}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-semibold border transition-colors',
                          isActive
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-violet-400 hover:text-violet-600',
                        )}
                      >
                        {labels[key]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Sliders TOFU / MOFU / BOFU */}
              {([
                ['tofu', 'TOFU', 'text-green-700',  'accent-green-500' ],
                ['mofu', 'MOFU', 'text-amber-700',  'accent-amber-500' ],
                ['bofu', 'BOFU', 'text-red-700',    'accent-red-500'   ],
              ] as const).map(([stage, label, textCls, accentCls]) => (
                <div key={stage} className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold w-9 shrink-0 ${textCls}`}>{label}</span>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    step={5}
                    value={distribucion[stage]}
                    onChange={(e) => handleDistChange(stage, Number(e.target.value))}
                    className={`flex-1 h-1.5 appearance-none rounded-full bg-gray-200 cursor-pointer ${accentCls}`}
                  />
                  <span className="text-[10px] font-bold text-gray-700 w-7 text-right tabular-nums shrink-0">
                    {distribucion[stage]}%
                  </span>
                </div>
              ))}

              <p className="text-[10px] text-gray-400 text-right">
                Suma: <span className={cn('font-bold', (distribucion.tofu + distribucion.mofu + distribucion.bofu) === 100 ? 'text-gray-500' : 'text-red-500')}>
                  {distribucion.tofu + distribucion.mofu + distribucion.bofu}%
                </span>
              </p>
            </div>

            {/* Resumen del plan */}
            <p className="text-xs text-violet-700 font-medium bg-violet-100 rounded-lg px-3 py-2">
              Plan: {meses} meses × {artMes} art/mes ={' '}
              <strong>hasta {meses * artMes} artículos</strong>
              {sugerencia && (
                <span className="ml-1.5 text-violet-500 font-normal">
                  ({((meses * artMes) / sugerencia.context.total_clusters).toFixed(1)} art/cluster)
                </span>
              )}
            </p>

            {generando && (
              <div className="flex items-center gap-2 text-sm text-violet-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando mapa con Claude… (30-60 segundos)
              </div>
            )}
            {errorGen && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {errorGen}
              </div>
            )}

            <Button
              onClick={handleGenerarMapa}
              disabled={generando}
              className="gap-2 bg-violet-600 hover:bg-violet-700"
              size="sm"
            >
              {generando
                ? <><Loader2 className="h-4 w-4 animate-spin" />Generando…</>
                : <><TrendingUp className="h-4 w-4" />Generar mapa</>
              }
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state: sin mapa */}
      {!map && !mostrarConfig && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Map className="h-10 w-10 text-gray-300 mx-auto mb-4" />
            <p className="text-sm font-semibold text-gray-500">Sin mapa de contenidos todavía</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              Ejecuta el clustering primero y luego genera el mapa editorial
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/strategy/${session.id}/clustering`}>
                  <Layers className="h-4 w-4 mr-1" />
                  Ir a clustering
                </Link>
              </Button>
              <Button
                size="sm"
                onClick={() => setMostrarConfig(true)}
                className="gap-2 bg-violet-600 hover:bg-violet-700"
              >
                <Map className="h-4 w-4" />
                Generar mapa
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Artículos agrupados por mes */}
      {monthGroups.length > 0 && (
        <div className="space-y-4">
          {monthGroups.map(([mes, monthItems]: [string, MapItem[]]) => {
            const collapsed = collapsedMonths.has(mes)
            return (
              <div key={mes} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {/* Header del mes */}
                <button
                  type="button"
                  onClick={() => toggleMonth(mes)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800">
                      {mes === 'Sin mes' ? 'Sin mes asignado' : formatMonth(mes)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {monthItems.length} artículo{monthItems.length !== 1 ? 's' : ''}
                    </span>
                    {/* Mini funnel stats */}
                    <div className="hidden sm:flex items-center gap-1.5">
                      {monthItems.filter((i: MapItem) => i.funnel_stage === 'tofu').length > 0 && (
                        <span className="text-[10px] font-semibold text-green-600 bg-green-50 rounded px-1.5 py-0.5">
                          {monthItems.filter((i: MapItem) => i.funnel_stage === 'tofu').length} TOFU
                        </span>
                      )}
                      {monthItems.filter((i: MapItem) => i.funnel_stage === 'mofu').length > 0 && (
                        <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                          {monthItems.filter((i: MapItem) => i.funnel_stage === 'mofu').length} MOFU
                        </span>
                      )}
                      {monthItems.filter((i: MapItem) => i.funnel_stage === 'bofu').length > 0 && (
                        <span className="text-[10px] font-semibold text-red-600 bg-red-50 rounded px-1.5 py-0.5">
                          {monthItems.filter((i: MapItem) => i.funnel_stage === 'bofu').length} BOFU
                        </span>
                      )}
                    </div>
                  </div>
                  {collapsed
                    ? <ChevronRight className="h-4 w-4 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 text-gray-400" />
                  }
                </button>

                {/* Tabla de artículos */}
                {!collapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-6">#</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Título</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">Keyword principal</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Cluster</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Funnel</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 hidden sm:table-cell">Volumen</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">Dificultad</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Prioridad</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 hidden sm:table-cell">Tipo</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 hidden md:table-cell">Validación</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {monthItems.map((item: MapItem, idx: number) => (
                          <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{idx + 1}</td>
                            <td className="px-3 py-3 max-w-[280px]">
                              <p className="font-medium text-gray-900 leading-snug line-clamp-2">
                                {item.title}
                              </p>
                              {item.slug && (
                                <p className="text-[11px] text-gray-400 mt-0.5 font-mono truncate">
                                  /{item.slug}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3 hidden lg:table-cell">
                              <span className="text-xs text-gray-600 font-medium">{item.main_keyword}</span>
                              {item.secondary_keywords.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.secondary_keywords.slice(0, 2).map((kw: string) => (
                                    <span key={kw} className="text-[10px] text-gray-400 bg-gray-50 rounded px-1">
                                      {kw}
                                    </span>
                                  ))}
                                  {item.secondary_keywords.length > 2 && (
                                    <span className="text-[10px] text-gray-300">
                                      +{item.secondary_keywords.length - 2}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 hidden md:table-cell">
                              <span className="text-xs text-gray-500 line-clamp-2">{item.cluster ?? '—'}</span>
                            </td>
                            <td className="px-3 py-3">
                              <FunnelBadge stage={item.funnel_stage} />
                            </td>
                            <td className="px-3 py-3 text-right hidden sm:table-cell">
                              <span className="text-sm font-semibold tabular-nums text-gray-700">
                                {item.volume != null ? volumenLabel(item.volume) : <span className="text-gray-300">—</span>}
                              </span>
                            </td>
                            <td className="px-3 py-3 hidden sm:table-cell">
                              {item.difficulty != null ? (
                                <span className="text-xs text-gray-600">
                                  {item.difficulty} · {dificultadLabel(item.difficulty)}
                                </span>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-3 py-3 hidden md:table-cell">
                              <PrioridadFinalBadge item={item} />
                            </td>
                            <td className="px-3 py-3 text-center hidden sm:table-cell">
                              <TipoArticuloBadge tipo={item.tipo_articulo} />
                            </td>
                            <td className="px-3 py-3 text-center hidden md:table-cell">
                              {rechazoPendienteId === item.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    placeholder="Motivo..."
                                    value={motivoPendiente[item.id] ?? ''}
                                    onChange={(e) => setMotivoPendiente((p) => ({ ...p, [item.id]: e.target.value }))}
                                    className="text-[11px] border border-red-200 rounded px-1.5 py-0.5 w-28 focus:outline-none focus:border-red-400"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleValidar(item.id, map!.id, 'rechazado', motivoPendiente[item.id])
                                      if (e.key === 'Escape') setRechazoPendienteId(null)
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleValidar(item.id, map!.id, 'rechazado', motivoPendiente[item.id])}
                                    className="text-red-600 hover:text-red-800"
                                    title="Confirmar rechazo"
                                  >
                                    <Check className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : validandoItems.has(item.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 mx-auto" />
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  {(item.validacion ?? 'propuesto') !== 'propuesto' && (
                                    <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${VALIDACION_STYLE[item.validacion ?? 'propuesto']?.cls ?? ''}`}>
                                      {VALIDACION_STYLE[item.validacion ?? 'propuesto']?.label}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    title="Aprobar"
                                    onClick={() => handleValidar(item.id, map!.id, 'aprobado')}
                                    className="rounded p-0.5 hover:bg-green-100 text-gray-400 hover:text-green-700 transition-colors"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Rechazar"
                                    onClick={() => setRechazoPendienteId(item.id)}
                                    className="rounded p-0.5 hover:bg-red-100 text-gray-400 hover:text-red-700 transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="En revisión"
                                    onClick={() => handleValidar(item.id, map!.id, 'revision')}
                                    className="rounded p-0.5 hover:bg-amber-100 text-gray-400 hover:text-amber-700 transition-colors"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {(() => {
                                // Comprobar si ya tiene contenido (original o recién creado)
                                const contenidoId = pedidosCreados[item.id] ?? item.contenido_id
                                if (contenidoId) {
                                  return (
                                    <Link
                                      href={`/contenidos/${contenidoId}`}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Ver pedido
                                    </Link>
                                  )
                                }
                                if (creandoPedido === item.id) {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-1.5 rounded-lg">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      Creando...
                                    </span>
                                  )
                                }
                                const isUpdate = item.content_status === 'existing_content'
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleCrearPedido(item)}
                                    disabled={!clientId || creandoPedido !== null}
                                    className={cn(
                                      'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50',
                                      isUpdate
                                        ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                                        : 'text-gray-600 bg-gray-100 hover:bg-gray-200',
                                    )}
                                  >
                                    <Plus className="h-3 w-3" />
                                    {isUpdate ? 'Actualizar' : 'Pedido'}
                                  </button>
                                )
                              })()}
                              {errorPedidoId === item.id && errorPedidoMsg && (
                                <p className="text-[10px] text-red-500 mt-1">{errorPedidoMsg}</p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Info del mapa */}
      {map && (
        <div className="flex items-center justify-between text-xs text-gray-400 px-1 pb-4">
          <span>
            Mapa generado el{' '}
            {new Date(map.createdAt).toLocaleDateString('es-ES', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </span>
          <button
            type="button"
            onClick={() => { setMostrarConfig(true) }}
            className="flex items-center gap-1 text-violet-600 hover:text-violet-800"
          >
            <Map className="h-3 w-3" />
            Regenerar mapa
          </button>
        </div>
      )}
    </div>
  )
}
