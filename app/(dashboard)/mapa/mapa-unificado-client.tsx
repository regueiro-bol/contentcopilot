'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Check, HelpCircle, X, CalendarPlus, Pencil, Zap, ExternalLink,
  Loader2, RefreshCw, Plus, ChevronUp, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ClienteOption { id: string; nombre: string }

interface UnifiedItem {
  id              : string
  source          : 'mapa' | 'oportunidad'
  titulo          : string
  keyword?        : string
  cluster?        : string
  funnel_stage?   : string
  prioridad_final?: number
  validacion      : 'propuesto' | 'aprobado' | 'rechazado' | 'revision'
  motivo_rechazo? : string
  contenido_id?   : string
  fecha_calendario?: string
  content_status? : string
  // oportunidad fields
  urgencia?       : string
  expires_at?     : string
  tipo?           : string
  fecha_evento?   : string
  contexto?       : string
}

type FiltroActivo = 'todos' | 'aprobados' | 'revision' | 'tofu' | 'mofu' | 'bofu'

// ─────────────────────────────────────────────────────────────
// Extension pills
// ─────────────────────────────────────────────────────────────

const EXTENSION_PILLS = [
  { label: '400–600',     min: 400,  max: 600  },
  { label: '800–1.000',   min: 800,  max: 1000 },
  { label: '1.200–1.500', min: 1200, max: 1500 },
  { label: '2.000–2.500', min: 2000, max: 2500 },
  { label: '3.000+',      min: 3000, max: 4000 },
] as const

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function proximoLunesHabil(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 1 : day === 6 ? 2 : 8 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function fmtFecha(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function funnelColor(f?: string) {
  if (f === 'tofu') return 'bg-sky-100 text-sky-700'
  if (f === 'mofu') return 'bg-violet-100 text-violet-700'
  if (f === 'bofu') return 'bg-emerald-100 text-emerald-700'
  return 'bg-gray-100 text-gray-500'
}

function urgenciaInfo(u?: string): { label: string; cls: string } | null {
  if (u === '24h')    return { label: '24h',   cls: 'bg-red-100 text-red-700' }
  if (u === 'semana') return { label: 'Semana', cls: 'bg-orange-100 text-orange-700' }
  if (u === 'mes')    return { label: 'Mes',    cls: 'bg-yellow-100 text-yellow-700' }
  return null
}

function gapBadge(cs?: string): { label: string; cls: string } | null {
  if (cs === 'existing_content') return { label: '🟡 Existe',  cls: 'bg-yellow-50 text-yellow-700 border border-yellow-200' }
  if (cs === 'partial')          return { label: '🔵 Parcial', cls: 'bg-blue-50 text-blue-700 border border-blue-200' }
  if (cs === 'gap')              return { label: '🟢 Nuevo',   cls: 'bg-green-50 text-green-700 border border-green-200' }
  return null
}

// ─────────────────────────────────────────────────────────────
// Sub-component: Validation buttons row
// ─────────────────────────────────────────────────────────────

function ValButtons({
  item, val, rechazandoId, motivoInput,
  onValidar, onStartRechazo, onCancelRechazo, onMotivoChange,
}: {
  item         : UnifiedItem
  val          : string
  rechazandoId : string | null
  motivoInput  : string
  onValidar    : (item: UnifiedItem, v: 'aprobado' | 'revision' | 'rechazado', motivo?: string) => void
  onStartRechazo: (id: string) => void
  onCancelRechazo: () => void
  onMotivoChange : (s: string) => void
}) {
  if (rechazandoId === item.id) {
    return (
      <div className="flex flex-col gap-1.5 min-w-[160px]">
        <input
          autoFocus
          placeholder="Motivo (opcional)"
          value={motivoInput}
          onChange={(e) => onMotivoChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter')  onValidar(item, 'rechazado', motivoInput)
            if (e.key === 'Escape') onCancelRechazo()
          }}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-300"
        />
        <div className="flex gap-1">
          <button
            onClick={() => onValidar(item, 'rechazado', motivoInput)}
            className="flex-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded px-2 py-0.5"
          >Confirmar</button>
          <button
            onClick={onCancelRechazo}
            className="text-xs text-gray-400 hover:text-gray-600 px-1"
          >✕</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 justify-center">
      <button
        onClick={() => onValidar(item, 'aprobado')}
        title="Aprobar"
        className={cn(
          'h-7 w-7 rounded flex items-center justify-center transition-colors',
          val === 'aprobado'
            ? 'bg-emerald-100 text-emerald-600'
            : 'bg-gray-50 text-gray-300 hover:bg-emerald-50 hover:text-emerald-500',
        )}
      ><Check className="h-3.5 w-3.5" /></button>
      <button
        onClick={() => onValidar(item, 'revision')}
        title="En revisión"
        className={cn(
          'h-7 w-7 rounded flex items-center justify-center transition-colors',
          val === 'revision'
            ? 'bg-amber-100 text-amber-600'
            : 'bg-gray-50 text-gray-300 hover:bg-amber-50 hover:text-amber-500',
        )}
      ><HelpCircle className="h-3.5 w-3.5" /></button>
      <button
        onClick={() => val === 'rechazado' ? onValidar(item, 'aprobado') : onStartRechazo(item.id)}
        title="Rechazar"
        className={cn(
          'h-7 w-7 rounded flex items-center justify-center transition-colors',
          val === 'rechazado'
            ? 'bg-red-100 text-red-500'
            : 'bg-gray-50 text-gray-300 hover:bg-red-50 hover:text-red-400',
        )}
      ><X className="h-3.5 w-3.5" /></button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export default function MapaUnificadoClient({ clientes }: { clientes: ClienteOption[] }) {
  // ── Cliente ──────────────────────────────────────────────
  const [clienteId, setClienteId] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('mapa_cliente_id') ?? ''
  })
  const handleSetCliente = (id: string) => {
    setClienteId(id)
    localStorage.setItem('mapa_cliente_id', id)
  }

  // ── Data ─────────────────────────────────────────────────
  const [mapItems,  setMapItems]  = useState<UnifiedItem[]>([])
  const [opItems,   setOpItems]   = useState<UnifiedItem[]>([])
  const [stats, setStats] = useState({ total: 0, aprobados: 0, revision: 0, rechazados: 0 })
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // ── Oportunidades toggle ─────────────────────────────────
  const [showOps, setShowOps] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('mapa_show_oportunidades') !== 'false'
  })
  const toggleOps = () => {
    setShowOps((v) => {
      localStorage.setItem('mapa_show_oportunidades', String(!v))
      return !v
    })
  }

  // ── Filtros ──────────────────────────────────────────────
  const [filtro,        setFiltro]        = useState<FiltroActivo>('todos')
  const [verRechazados, setVerRechazados] = useState(false)

  // ── Validación local ─────────────────────────────────────
  const [localVal,      setLocalVal]      = useState<Record<string, { validacion: string; motivo_rechazo?: string }>>({})
  const [rechazandoId,  setRechazandoId]  = useState<string | null>(null)
  const [motivoInput,   setMotivoInput]   = useState('')

  // ── Planificar ───────────────────────────────────────────
  interface PlanPopover { itemId: string; x: number; y: number; currentDate: string }
  const [planPopover,  setPlanPopover]  = useState<PlanPopover | null>(null)
  const [planDate,     setPlanDate]     = useState(proximoLunesHabil)
  const [planLoading,  setPlanLoading]  = useState(false)

  // ── Pedidos ──────────────────────────────────────────────
  const [pedidosEnProceso, setPedidosEnProceso] = useState<Set<string>>(new Set())
  const [pedidosCreados,   setPedidosCreados]   = useState<Record<string, string>>({})

  // ── Fechas planificadas localmente (optimistic) ──────────
  const [localFechas, setLocalFechas]   = useState<Record<string, string>>({})
  const [toastMsg,    setToastMsg]      = useState<string | null>(null)

  // ── Extension modal (pre-brief) ──────────────────────────
  const [pedidoItem,   setPedidoItem]   = useState<UnifiedItem | null>(null)
  const [extPillIdx,   setExtPillIdx]   = useState(1)   // default: 800–1.000
  const [extCustomMin, setExtCustomMin] = useState('')
  const [extCustomMax, setExtCustomMax] = useState('')

  // ── Modal pedir ──────────────────────────────────────────
  const [mostrarModal,    setMostrarModal]    = useState(false)
  const [esMasContenidos, setEsMasContenidos] = useState(false)
  const [cantidadPedir,   setCantidadPedir]   = useState(40)
  const [generando,       setGenerando]       = useState(false)
  const [errorGenerar,    setErrorGenerar]    = useState<string | null>(null)

  // ── Gap analysis ─────────────────────────────────────────
  const [gapState, setGapState] = useState<'idle' | 'loading' | 'done'>('idle')

  // ─────────────────────────────────────────────────────────
  // Fetch
  // ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async (cid: string) => {
    if (!cid) return
    setLoading(true); setError(null)

    try {
      const res  = await fetch(`/api/strategy/mapa/unified?client_id=${cid}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error cargando datos')

      const toMapItem = (i: Record<string, unknown>): UnifiedItem => ({
        id              : String(i.id),
        source          : 'mapa',
        titulo          : String(i.title ?? ''),
        keyword         : (i.main_keyword as string) || undefined,
        cluster         : (i.cluster as string) || undefined,
        funnel_stage    : (i.funnel_stage as string) || undefined,
        prioridad_final : typeof i.prioridad_final === 'number' ? i.prioridad_final : undefined,
        validacion      : (i.validacion as UnifiedItem['validacion']) ?? 'propuesto',
        motivo_rechazo  : (i.motivo_rechazo as string) || undefined,
        contenido_id    : (i.contenido_id as string) || undefined,
        fecha_calendario: (i.fecha_calendario as string) || undefined,
        content_status  : (i.content_status as string) || undefined,
      })

      const toOpItem = (o: Record<string, unknown>): UnifiedItem => ({
        id             : String(o.id),
        source         : 'oportunidad',
        titulo         : String(o.titulo ?? ''),
        keyword        : (o.keyword as string) || undefined,
        validacion     : (o.validacion as UnifiedItem['validacion']) ?? 'propuesto',
        motivo_rechazo : (o.motivo_rechazo as string) || undefined,
        contenido_id   : (o.contenido_id as string) || undefined,
        urgencia       : (o.urgencia as string) || undefined,
        expires_at     : (o.expires_at as string) || undefined,
        tipo           : (o.tipo as string) || undefined,
        fecha_evento   : (o.fecha_evento as string) || undefined,
        contexto       : (o.contexto as string) || undefined,
      })

      setMapItems((data.mapItems ?? []).map(toMapItem))
      setOpItems((data.oportunidades ?? []).map(toOpItem))
      setStats(data.stats ?? { total: 0, aprobados: 0, revision: 0, rechazados: 0 })
      setLocalVal({})
      setPedidosCreados({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (clienteId) fetchData(clienteId) }, [clienteId, fetchData])


  // ─────────────────────────────────────────────────────────
  // Filtering & sorting (map items only)
  // ─────────────────────────────────────────────────────────

  const effectiveVal = useCallback((item: UnifiedItem) =>
    localVal[item.id]?.validacion ?? item.validacion, [localVal])

  const sortedMapItems = useMemo(() => {
    const filtered = mapItems.filter((item) => {
      const v = effectiveVal(item)
      if (!verRechazados && v === 'rechazado') return false
      switch (filtro) {
        case 'aprobados': return v === 'aprobado'
        case 'revision' : return v === 'revision'
        case 'tofu'     : return item.funnel_stage === 'tofu'
        case 'mofu'     : return item.funnel_stage === 'mofu'
        case 'bofu'     : return item.funnel_stage === 'bofu'
        default         : return true
      }
    })
    return filtered.sort((a, b) => {
      const vA = effectiveVal(a), vB = effectiveVal(b)
      if (vA === 'aprobado' && vB !== 'aprobado') return -1
      if (vA !== 'aprobado' && vB === 'aprobado') return 1
      if (vA === 'aprobado' && vB === 'aprobado') {
        const fo: Record<string, number> = { bofu: 0, mofu: 1, tofu: 2 }
        return (fo[a.funnel_stage ?? ''] ?? 3) - (fo[b.funnel_stage ?? ''] ?? 3)
      }
      if (vA === 'propuesto' && vB === 'revision') return -1
      if (vA === 'revision'  && vB === 'propuesto') return 1
      return (a.prioridad_final ?? 99) - (b.prioridad_final ?? 99)
    })
  }, [mapItems, filtro, verRechazados, effectiveVal])

  // oportunidades: same validation filter as evergreen + sort by urgencia
  const sortedOpItems = useMemo(() => {
    const filtered = opItems.filter((item) => {
      const v = effectiveVal(item)
      if (!verRechazados && v === 'rechazado') return false
      switch (filtro) {
        case 'aprobados': return v === 'aprobado'
        case 'revision' : return v === 'revision'
        // tofu/mofu/bofu are evergreen-only; show all oportunidades in those views
        default         : return true
      }
    })
    return filtered.sort((a, b) => {
      const uo = (u?: string) => u === '24h' ? 0 : u === 'semana' ? 1 : u === 'mes' ? 2 : 3
      return uo(a.urgencia) - uo(b.urgencia)
    })
  }, [opItems, filtro, verRechazados, effectiveVal])

  // ─────────────────────────────────────────────────────────
  // Validación
  // ─────────────────────────────────────────────────────────

  const handleValidar = useCallback(async (
    item   : UnifiedItem,
    newVal : 'aprobado' | 'revision' | 'rechazado',
    motivo?: string,
  ) => {
    const prev = localVal[item.id] ?? { validacion: item.validacion, motivo_rechazo: item.motivo_rechazo }
    setLocalVal((cur) => ({ ...cur, [item.id]: { validacion: newVal, motivo_rechazo: motivo } }))
    setRechazandoId(null); setMotivoInput('')

    const endpoint = item.source === 'oportunidad'
      ? `/api/strategy/oportunidades/${item.id}`
      : `/api/strategy/mapa/items/${item.id}`

    try {
      const res = await fetch(endpoint, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ validacion: newVal, motivo_rechazo: motivo ?? null }),
      })
      if (!res.ok) throw new Error('Error guardando validación')
    } catch {
      setLocalVal((cur) => ({ ...cur, [item.id]: prev }))
    }
  }, [localVal])

  // ─────────────────────────────────────────────────────────
  // Planificar
  // ─────────────────────────────────────────────────────────

  const openPlan = (e: React.MouseEvent, item: UnifiedItem) => {
    e.stopPropagation()
    const rect        = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const popH        = 156
    const top         = rect.bottom + popH > window.innerHeight ? rect.top - popH - 8 : rect.bottom + 8
    const left        = Math.min(rect.left, window.innerWidth - 296)
    const currentDate = localFechas[item.id] ?? item.fecha_calendario ?? proximoLunesHabil()
    setPlanDate(currentDate)
    // Toggle: close if already open for same item
    setPlanPopover((cur) =>
      cur?.itemId === item.id ? null : { itemId: item.id, x: left, y: top, currentDate }
    )
  }

  const handlePlanificar = async (item: UnifiedItem, fechaOverride?: string) => {
    const fecha = fechaOverride ?? planDate
    if (!clienteId || !fecha) return
    setPlanLoading(true)
    try {
      const contenidoId = pedidosCreados[item.id] ?? item.contenido_id ?? null
      const body: Record<string, unknown> = {
        client_id        : clienteId,
        titulo           : item.titulo,
        keyword          : item.keyword,
        fecha_publicacion: fecha,
        fuente           : item.source === 'oportunidad' ? 'actualidad' : 'almacen',
        ...(contenidoId ? { contenido_id: contenidoId } : {}),
      }
      if (item.source === 'mapa')        body.map_item_id    = item.id
      if (item.source === 'oportunidad') body.oportunidad_id = item.id

      const res = await fetch('/api/strategy/calendario', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Error planificando')
      const data = await res.json()

      // Update local fecha state (optimistic)
      setLocalFechas((cur) => ({ ...cur, [item.id]: fecha }))

      if (item.source === 'mapa') {
        setMapItems((cur) => cur.map((i) => i.id === item.id ? { ...i, fecha_calendario: fecha } : i))
      } else {
        setOpItems((cur) => cur.map((i) => i.id === item.id
          ? { ...i, fecha_calendario: fecha, contenido_id: data.contenido_id ?? i.contenido_id }
          : i))
      }

      setPlanPopover(null)
      const fechaFmt = new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
      setToastMsg(`✓ Planificado para el ${fechaFmt}`)
      setTimeout(() => setToastMsg(null), 3500)
    } catch (e) { console.error(e) }
    finally { setPlanLoading(false) }
  }

  // ─────────────────────────────────────────────────────────
  // Pedidos
  // ─────────────────────────────────────────────────────────

  /** Abre el modal de extensión para el item seleccionado */
  const handlePedir = (item: UnifiedItem) => {
    if (pedidosEnProceso.has(item.id)) return
    setExtPillIdx(1)       // default 800–1.000
    setExtCustomMin('')
    setExtCustomMax('')
    setPedidoItem(item)
  }

  /** Confirma la extensión y llama al API */
  const handleConfirmarPedido = async () => {
    const item = pedidoItem
    if (!item) return
    setPedidoItem(null)
    setPedidosEnProceso((prev) => { const n = new Set(prev); n.add(item.id); return n })

    const pill   = EXTENSION_PILLS[extPillIdx]
    const extMin = extCustomMin ? parseInt(extCustomMin, 10) : pill.min
    const extMax = extCustomMax ? parseInt(extCustomMax, 10) : pill.max

    try {
      const body: Record<string, unknown> = {
        client_id           : clienteId,
        titulo              : item.titulo,
        keyword_principal   : item.keyword ?? '',
        keywords_secundarias: [],
        extension_min       : extMin,
        extension_max       : extMax,
      }

      if (item.source === 'mapa') {
        body.map_item_id = item.id
        if (item.content_status === 'existing_content') {
          body.tipo = 'actualizacion'; body.existing_url = item.keyword
        }
      } else {
        body.oportunidad_id = item.id
        body.urgencia       = item.urgencia
        body.contexto       = item.contexto
      }

      const res  = await fetch('/api/pedidos/desde-mapa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.contenido_id) {
        setPedidosCreados((cur) => ({ ...cur, [item.id]: data.contenido_id }))
      }
    } catch (e) { console.error(e) }
    finally {
      setPedidosEnProceso((prev) => { const n = new Set(prev); n.delete(item.id); return n })
    }
  }

  // ─────────────────────────────────────────────────────────
  // Generar contenidos
  // ─────────────────────────────────────────────────────────

  const handleGenerar = async () => {
    if (!clienteId) return
    setGenerando(true); setErrorGenerar(null)
    try {
      const excludeKeywords = esMasContenidos
        ? mapItems.map((i) => i.keyword).filter(Boolean) as string[]
        : []
      const res  = await fetch('/api/strategy/generate-map', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id       : clienteId,
          total_articles  : cantidadPedir,
          exclude_keywords: excludeKeywords,
          config          : { meses: 3, articulos_por_mes: Math.ceil(cantidadPedir / 3) },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error generando')
      setMostrarModal(false)
      await fetchData(clienteId)
    } catch (e) {
      setErrorGenerar(e instanceof Error ? e.message : 'Error desconocido')
    } finally { setGenerando(false) }
  }

  // ─────────────────────────────────────────────────────────
  // Gap analysis
  // ─────────────────────────────────────────────────────────

  const handleGaps = async () => {
    if (!clienteId || gapState === 'loading') return
    setGapState('loading')
    try {
      const res = await fetch('/api/strategy/check-existing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clienteId }),
      })
      if (res.ok) {
        await fetchData(clienteId)
        setGapState('done')
        setTimeout(() => setGapState('idle'), 3000)
      } else {
        setGapState('idle')
      }
    } catch (e) { console.error(e); setGapState('idle') }
  }

  // ─────────────────────────────────────────────────────────
  // Render: single item action cell
  // ─────────────────────────────────────────────────────────

  const renderAccion = (item: UnifiedItem) => {
    const v           = effectiveVal(item)
    const contenidoId = pedidosCreados[item.id] ?? item.contenido_id
    const enProceso   = pedidosEnProceso.has(item.id)
    const fechaActual = localFechas[item.id] ?? item.fecha_calendario

    // Non-approved: just show a static fecha badge (no planificar)
    if (v !== 'aprobado') {
      return fechaActual
        ? <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">📅 {fmtFecha(fechaActual)}</span>
        : null
    }

    // Approved: always show [Planificar/badge] + [Pedir/Ver]
    return (
      <div className="flex items-center gap-1.5 flex-wrap">

        {/* Planificar — date badge (clickable) or button */}
        {fechaActual ? (
          <button
            onClick={(e) => openPlan(e, item)}
            className="text-[10px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded transition-colors"
            title="Cambiar fecha"
          >
            📅 {fmtFecha(fechaActual)}
          </button>
        ) : (
          <button
            onClick={(e) => openPlan(e, item)}
            className="flex items-center gap-0.5 text-xs text-gray-600 hover:text-indigo-600 px-2 py-1 rounded border border-gray-200 hover:border-indigo-300 bg-white transition-colors"
          >
            <CalendarPlus className="h-3.5 w-3.5" /> Planificar
          </button>
        )}

        {/* Ver contenido o Pedir redacción */}
        {contenidoId ? (
          <Link
            href={`/contenidos/${contenidoId}`}
            className="flex items-center gap-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Ver <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <button
            onClick={() => handlePedir(item)}
            disabled={enProceso}
            className="flex items-center gap-0.5 text-xs text-gray-600 hover:text-indigo-600 px-2 py-1 rounded border border-gray-200 hover:border-indigo-300 bg-white disabled:opacity-50 transition-colors"
          >
            {enProceso
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Generando brief…</>
              : <><Pencil className="h-3.5 w-3.5" /> {item.source === 'oportunidad' ? 'Crear contenido' : 'Pedir redacción'}</>
            }
          </button>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────
  // Render: evergreen table
  // ─────────────────────────────────────────────────────────

  const renderEvergreenTable = () => (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-2.5 text-left w-8">#</th>
            <th className="px-4 py-2.5 text-left">Título + Keyword</th>
            <th className="px-4 py-2.5 text-left w-20">Tipo</th>
            <th className="px-4 py-2.5 text-left w-28">Gap</th>
            <th className="px-4 py-2.5 text-center w-32">Estado</th>
            <th className="px-4 py-2.5 text-left">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sortedMapItems.map((item, idx) => {
            const v   = effectiveVal(item)
            const gap = gapBadge(item.content_status)
            return (
              <tr key={item.id} className={cn('hover:bg-gray-50/60 transition-colors', v === 'rechazado' && 'opacity-50 bg-red-50/30')}>
                <td className="px-4 py-3 text-gray-400 tabular-nums text-xs">{idx + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <span className="font-medium text-gray-900">{item.titulo}</span>
                    {item.content_status === 'existing_content' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Existe</span>}
                    {item.content_status === 'partial'          && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Parcial</span>}
                  </div>
                  {item.keyword && <p className="text-xs text-gray-400 mt-0.5">{item.keyword}</p>}
                  {v === 'rechazado' && (localVal[item.id]?.motivo_rechazo ?? item.motivo_rechazo) && (
                    <p className="text-xs text-red-400 mt-0.5 italic">↳ {localVal[item.id]?.motivo_rechazo ?? item.motivo_rechazo}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {item.funnel_stage
                    ? <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded uppercase', funnelColor(item.funnel_stage))}>{item.funnel_stage}</span>
                    : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  {gap
                    ? <span className={cn('text-[11px] px-1.5 py-0.5 rounded', gap.cls)}>{gap.label}</span>
                    : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <ValButtons
                    item={item} val={v}
                    rechazandoId={rechazandoId} motivoInput={motivoInput}
                    onValidar={handleValidar}
                    onStartRechazo={(id) => { setRechazandoId(id); setMotivoInput('') }}
                    onCancelRechazo={() => { setRechazandoId(null); setMotivoInput('') }}
                    onMotivoChange={setMotivoInput}
                  />
                </td>
                <td className="px-4 py-3">{renderAccion(item)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  // ─────────────────────────────────────────────────────────
  // Render: oportunidades table
  // ─────────────────────────────────────────────────────────

  const renderOpTable = () => (
    <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-amber-100 bg-amber-50/60 text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-2.5 text-left w-8">#</th>
            <th className="px-4 py-2.5 text-left">Título + Keyword</th>
            <th className="px-4 py-2.5 text-left w-20">Tipo</th>
            <th className="px-4 py-2.5 text-left w-24">Fecha</th>
            <th className="px-4 py-2.5 text-left w-24">Urgencia</th>
            <th className="px-4 py-2.5 text-center w-32">Estado</th>
            <th className="px-4 py-2.5 text-left">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-50">
          {sortedOpItems.map((item, idx) => {
            const v      = effectiveVal(item)
            const urgInf = urgenciaInfo(item.urgencia)
            const fecha  = item.fecha_evento ? fmtFecha(item.fecha_evento) : fmtFecha(item.expires_at)
            return (
              <tr key={item.id} className={cn('hover:bg-amber-50/40 transition-colors', v === 'rechazado' && 'opacity-50')}>
                <td className="px-4 py-3 text-gray-400 tabular-nums text-xs">{idx + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="font-medium text-gray-900">{item.titulo}</span>
                  </div>
                  {item.keyword && <p className="text-xs text-gray-400 mt-0.5 ml-5">{item.keyword}</p>}
                  {v === 'rechazado' && (localVal[item.id]?.motivo_rechazo ?? item.motivo_rechazo) && (
                    <p className="text-xs text-red-400 mt-0.5 ml-5 italic">↳ {localVal[item.id]?.motivo_rechazo ?? item.motivo_rechazo}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500 capitalize">{item.tipo ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 font-medium">{fecha}</td>
                <td className="px-4 py-3">
                  {urgInf
                    ? <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded', urgInf.cls)}>{urgInf.label}</span>
                    : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <ValButtons
                    item={item} val={v}
                    rechazandoId={rechazandoId} motivoInput={motivoInput}
                    onValidar={handleValidar}
                    onStartRechazo={(id) => { setRechazandoId(id); setMotivoInput('') }}
                    onCancelRechazo={() => { setRechazandoId(null); setMotivoInput('') }}
                    onMotivoChange={setMotivoInput}
                  />
                </td>
                <td className="px-4 py-3">{renderAccion(item)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  // ─────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────

  const clienteNombre = clientes.find((c) => c.id === clienteId)?.nombre

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900">Mapa de Contenidos</h1>
            {clienteNombre && <span className="text-sm text-gray-500">— {clienteNombre}</span>}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={clienteId}
              onChange={(e) => handleSetCliente(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Selecciona cliente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {clienteId && (
              <>
                <button onClick={() => fetchData(clienteId)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="Recargar">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setEsMasContenidos(false); setMostrarModal(true) }}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                >
                  <Plus className="h-4 w-4" /> Pedir contenidos
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {!clienteId && (
          <div className="text-center py-20 text-gray-400">
            <p>Selecciona un cliente para ver el mapa de contenidos</p>
          </div>
        )}

        {clienteId && loading && (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /><span>Cargando mapa…</span>
          </div>
        )}

        {clienteId && error && (
          <div className="text-center py-20 text-red-500">{error}</div>
        )}

        {clienteId && !loading && !error && (
          <>
            {/* ── Stats ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total',       value: stats.total,      cls: 'text-gray-700' },
                { label: 'Aprobados',   value: stats.aprobados,  cls: 'text-emerald-600' },
                { label: 'En revisión', value: stats.revision,   cls: 'text-amber-600' },
                { label: 'Rechazados',  value: stats.rechazados, cls: 'text-red-500' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className={cn('text-2xl font-bold mt-0.5', cls)}>{value}</p>
                </div>
              ))}
            </div>

            {/* ── Filtros ─────────────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap mb-5">
              {([
                { key: 'todos',     label: 'Todos' },
                { key: 'aprobados', label: 'Aprobados' },
                { key: 'revision',  label: 'En revisión' },
                { key: 'tofu',      label: 'TOFU' },
                { key: 'mofu',      label: 'MOFU' },
                { key: 'bofu',      label: 'BOFU' },
              ] as { key: FiltroActivo; label: string }[]).map(({ key, label }) => (
                <button key={key}
                  onClick={() => setFiltro(key)}
                  className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    filtro === key
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300',
                  )}
                >{label}</button>
              ))}

              {/* Ver rechazados pill (toggle independiente) */}
              <button
                onClick={() => setVerRechazados((v) => !v)}
                className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1',
                  verRechazados
                    ? 'bg-red-100 text-red-700 border-red-300'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-red-200 hover:text-red-400',
                )}
              >
                <X className="h-3 w-3" /> Ver rechazados
              </button>

              {/* Analizar gaps */}
              <button
                onClick={handleGaps}
                disabled={gapState === 'loading'}
                className={cn(
                  'ml-auto px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1',
                  gapState === 'done'
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 disabled:opacity-50',
                )}
              >
                {gapState === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
                {gapState === 'done' && <Check className="h-3 w-3" />}
                {gapState === 'done' ? 'Gaps analizados' : gapState === 'loading' ? 'Analizando…' : 'Analizar gaps'}
              </button>
            </div>

            {/* ── SECCIÓN 1: Contenidos Evergreen ─────────────── */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Contenidos Evergreen
                <span className="ml-2 text-gray-400 font-normal">({sortedMapItems.length})</span>
              </h2>
              {sortedMapItems.length === 0 ? (
                <div className="text-center py-12 text-gray-400 bg-white rounded-lg border border-gray-200">
                  <p className="text-sm">No hay artículos con los filtros seleccionados.</p>
                  <button
                    onClick={() => { setEsMasContenidos(false); setMostrarModal(true) }}
                    className="mt-3 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >+ Generar contenidos con IA</button>
                </div>
              ) : renderEvergreenTable()}
            </div>

            {/* ── SECCIÓN 2: Oportunidades de Actualidad ──────── */}
            {sortedOpItems.length > 0 && (
              <div className="mb-6">
                <button
                  onClick={toggleOps}
                  className="flex items-center gap-2 text-sm font-semibold text-amber-700 mb-3 hover:text-amber-900 transition-colors"
                >
                  <Zap className="h-4 w-4" />
                  Oportunidades de Actualidad
                  <span className="text-amber-500 font-normal">({sortedOpItems.length})</span>
                  {showOps
                    ? <ChevronUp className="h-4 w-4 text-amber-500" />
                    : <ChevronDown className="h-4 w-4 text-amber-500" />
                  }
                </button>
                {showOps && renderOpTable()}
              </div>
            )}

            {/* ── Footer ──────────────────────────────────────── */}
            {mapItems.length > 0 && (
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>Mostrando {sortedMapItems.length} contenidos · {stats.aprobados} aprobados</span>
                <button
                  onClick={() => { setEsMasContenidos(true); setMostrarModal(true) }}
                  className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" /> Solicitar más contenidos
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Popover planificar (global, single instance) ─────── */}
      {planPopover && (() => {
        const allItems = [...mapItems, ...opItems]
        const item     = allItems.find((i) => i.id === planPopover.itemId)
        const hasFecha = !!(localFechas[planPopover.itemId] ?? item?.fecha_calendario)
        return (
          <>
            {/* Transparent backdrop — catches outside clicks */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 9998 }}
              onClick={() => setPlanPopover(null)}
            />
            {/* Popover — above backdrop */}
            <div
              style={{ position: 'fixed', top: planPopover.y, left: planPopover.x, width: 284, zIndex: 9999 }}
              className="bg-white rounded-lg shadow-xl border border-gray-200 p-4"
            >
              <p className="text-xs font-semibold text-gray-700 mb-2">Fecha de publicación</p>
              <input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 mb-3 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button
                onClick={() => { if (item && planDate) handlePlanificar(item, planDate) }}
                disabled={planLoading || !planDate}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded px-3 py-1.5 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {planLoading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Añadiendo…</>
                  : hasFecha ? 'Actualizar calendario' : 'Añadir al calendario'}
              </button>
            </div>
          </>
        )
      })()}

      {/* ── Toast planificación ──────────────────────────────── */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[10000] bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
          {toastMsg}
        </div>
      )}

      {/* ── Modal extensión (pre-brief) ──────────────────────── */}
      {pedidoItem && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setPedidoItem(null) }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Extensión del artículo</h2>
            <p className="text-sm text-gray-500 mb-4 line-clamp-2 italic">{pedidoItem.titulo}</p>

            {/* Pills de extensión */}
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">Selecciona el rango de palabras</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {EXTENSION_PILLS.map((pill, idx) => (
                <button
                  key={pill.label}
                  onClick={() => { setExtPillIdx(idx); setExtCustomMin(''); setExtCustomMax('') }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    extPillIdx === idx && !extCustomMin
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300',
                  )}
                >{pill.label}</button>
              ))}
            </div>

            {/* Custom inputs */}
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">O personaliza</p>
            <div className="flex items-center gap-2 mb-5">
              <input
                type="number" placeholder="Mín" min={100} value={extCustomMin}
                onChange={(e) => setExtCustomMin(e.target.value)}
                className="w-24 text-center text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <span className="text-gray-400 text-sm">—</span>
              <input
                type="number" placeholder="Máx" min={100} value={extCustomMax}
                onChange={(e) => setExtCustomMax(e.target.value)}
                className="w-24 text-center text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <span className="text-xs text-gray-400">palabras</span>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setPedidoItem(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button onClick={handleConfirmarPedido}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Generar brief →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal pedir contenidos ───────────────────────────── */}
      {mostrarModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setMostrarModal(false) }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              {esMasContenidos ? '¿Cuántos contenidos adicionales?' : '¿Cuántos contenidos necesitas?'}
            </h2>
            {esMasContenidos && (
              <p className="text-sm text-gray-500 mb-4">
                Ya tienes {mapItems.length} contenidos en el mapa.
                El sistema no repetirá los existentes ni los rechazados.
              </p>
            )}
            <div className="flex items-center gap-3 my-4">
              <input
                type="number" min={5} max={200} value={cantidadPedir}
                onChange={(e) => setCantidadPedir(Math.max(5, parseInt(e.target.value) || 40))}
                className="w-24 text-center text-xl font-bold border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-gray-600">artículos</span>
            </div>
            {!esMasContenidos && (
              <div className="text-sm text-gray-500 space-y-1 mb-5">
                <p className="font-medium text-gray-700 mb-1">El sistema usará:</p>
                {['Keywords con potencial', 'Contenido ya publicado', 'Artículos rechazados', 'Competencia', 'Distribución TOFU/MOFU/BOFU'].map((txt) => (
                  <p key={txt} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />{txt}
                  </p>
                ))}
              </div>
            )}
            {errorGenerar && <p className="text-sm text-red-500 mb-3">{errorGenerar}</p>}
            {generando && (
              <p className="text-sm text-indigo-600 flex items-center gap-1.5 mb-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando {cantidadPedir} artículos… (30-60 s)
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setMostrarModal(false); setErrorGenerar(null) }}
                disabled={generando} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleGenerar} disabled={generando || !clienteId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                {generando && <Loader2 className="h-4 w-4 animate-spin" />}
                {generando ? 'Generando…' : 'Generar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
