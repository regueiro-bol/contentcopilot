'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  Check, HelpCircle, X, CalendarPlus, Pencil, Zap, ExternalLink,
  Loader2, RefreshCw, Plus, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ClienteOption { id: string; nombre: string }

interface UnifiedItem {
  id             : string
  source         : 'mapa' | 'oportunidad'
  titulo         : string
  keyword?       : string
  cluster?       : string
  funnel_stage?  : string
  prioridad_final?: number
  validacion     : 'propuesto' | 'aprobado' | 'rechazado' | 'revision'
  motivo_rechazo?: string
  contenido_id?  : string
  fecha_calendario?: string
  content_status?: string
  urgencia?      : string
  expires_at?    : string
  tipo?          : string  // trending | estacional
}

type FiltroActivo = 'todos' | 'aprobados' | 'revision' | 'oportunidad' | 'tofu' | 'mofu' | 'bofu'

interface Props { clientes: ClienteOption[] }

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

function funnelColor(f?: string) {
  if (f === 'tofu') return 'bg-sky-100 text-sky-700'
  if (f === 'mofu') return 'bg-violet-100 text-violet-700'
  if (f === 'bofu') return 'bg-emerald-100 text-emerald-700'
  return 'bg-gray-100 text-gray-500'
}

function urgenciaLabel(u?: string) {
  if (u === '24h')    return { label: '24h',   cls: 'bg-red-100 text-red-700' }
  if (u === 'semana') return { label: 'Semana', cls: 'bg-orange-100 text-orange-700' }
  if (u === 'mes')    return { label: 'Mes',    cls: 'bg-yellow-100 text-yellow-700' }
  return null
}

function gapBadge(cs?: string) {
  if (cs === 'existing_content') return { label: '🟡 Existe',  cls: 'bg-yellow-50 text-yellow-700 border border-yellow-200' }
  if (cs === 'partial')         return { label: '🔵 Parcial', cls: 'bg-blue-50 text-blue-700 border border-blue-200' }
  if (cs === 'gap')             return { label: '🟢 Nuevo',   cls: 'bg-green-50 text-green-700 border border-green-200' }
  return null
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function MapaUnificadoClient({ clientes }: Props) {
  // ── Selector de cliente ──────────────────────────────────
  const [clienteId, setClienteId] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('mapa_cliente_id') ?? ''
  })

  const handleSetCliente = (id: string) => {
    setClienteId(id)
    localStorage.setItem('mapa_cliente_id', id)
  }

  // ── Data ─────────────────────────────────────────────────
  const [items, setItems] = useState<UnifiedItem[]>([])
  const [stats, setStats] = useState({ total: 0, aprobados: 0, revision: 0, rechazados: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // ── Filtros ──────────────────────────────────────────────
  const [filtro, setFiltro]           = useState<FiltroActivo>('todos')
  const [verRechazados, setVerRechazados] = useState(false)

  // ── Validación local (optimista) ─────────────────────────
  const [localVal, setLocalVal] = useState<Record<string, { validacion: string; motivo_rechazo?: string }>>({})
  const [rechazandoId, setRechazandoId] = useState<string | null>(null)
  const [motivoInput, setMotivoInput]   = useState('')

  // ── Planificar ───────────────────────────────────────────
  const [planId, setPlanId]   = useState<string | null>(null)
  const [planFecha, setPlanFecha] = useState(proximoLunesHabil)
  const [planLoading, setPlanLoading] = useState(false)
  const planRef = useRef<HTMLDivElement>(null)

  // ── Pedidos en proceso ───────────────────────────────────
  const [pedidosEnProceso, setPedidosEnProceso] = useState<Set<string>>(new Set())
  const [pedidosCreados, setPedidosCreados]     = useState<Record<string, string>>({})

  // ── Modal pedir contenidos ───────────────────────────────
  const [mostrarModal, setMostrarModal] = useState(false)
  const [esMasContenidos, setEsMasContenidos] = useState(false)
  const [cantidadPedir, setCantidadPedir] = useState(40)
  const [generando, setGenerando]         = useState(false)
  const [errorGenerar, setErrorGenerar]   = useState<string | null>(null)

  // ── Gap analysis ─────────────────────────────────────────
  const [analizandoGaps, setAnalizandoGaps] = useState(false)

  // ─────────────────────────────────────────────────────────
  // Fetch data
  // ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async (cid: string) => {
    if (!cid) return
    setLoading(true)
    setError(null)

    try {
      const res  = await fetch(`/api/strategy/mapa/unified?client_id=${cid}`, { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Error cargando datos')

      const mapItems: UnifiedItem[] = (data.mapItems ?? []).map((i: Record<string, unknown>) => ({
        id             : String(i.id),
        source         : 'mapa' as const,
        titulo         : String(i.title ?? ''),
        keyword        : (i.main_keyword as string) ?? undefined,
        cluster        : (i.cluster as string) ?? undefined,
        funnel_stage   : (i.funnel_stage as string) ?? undefined,
        prioridad_final: typeof i.prioridad_final === 'number' ? i.prioridad_final : undefined,
        validacion     : (i.validacion as UnifiedItem['validacion']) ?? 'propuesto',
        motivo_rechazo : (i.motivo_rechazo as string) ?? undefined,
        contenido_id   : (i.contenido_id as string) ?? undefined,
        fecha_calendario: (i.fecha_calendario as string) ?? undefined,
        content_status : (i.content_status as string) ?? undefined,
      }))

      const oportunidades: UnifiedItem[] = (data.oportunidades ?? []).map((o: Record<string, unknown>) => ({
        id            : String(o.id),
        source        : 'oportunidad' as const,
        titulo        : String(o.titulo ?? ''),
        keyword       : (o.keyword as string) ?? undefined,
        validacion    : 'propuesto' as const,  // local-only for oportunidades
        urgencia      : (o.urgencia as string) ?? undefined,
        expires_at    : (o.expires_at as string) ?? undefined,
        tipo          : (o.tipo as string) ?? undefined,
      }))

      setItems([...mapItems, ...oportunidades])
      setStats(data.stats ?? { total: 0, aprobados: 0, revision: 0, rechazados: 0 })
      setLocalVal({})
      setPedidosCreados({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (clienteId) fetchData(clienteId)
  }, [clienteId, fetchData])

  // Close planificar popover on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (planRef.current && !planRef.current.contains(e.target as Node)) setPlanId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ─────────────────────────────────────────────────────────
  // Sorting + filtering
  // ─────────────────────────────────────────────────────────

  const sortedItems = useMemo(() => {
    const effectiveVal = (item: UnifiedItem) =>
      localVal[item.id]?.validacion ?? item.validacion

    const filtered = items.filter((item) => {
      const v = effectiveVal(item)
      if (!verRechazados && v === 'rechazado') return false
      switch (filtro) {
        case 'aprobados'  : return v === 'aprobado'
        case 'revision'   : return v === 'revision'
        case 'oportunidad': return item.source === 'oportunidad'
        case 'tofu'       : return item.funnel_stage === 'tofu'
        case 'mofu'       : return item.funnel_stage === 'mofu'
        case 'bofu'       : return item.funnel_stage === 'bofu'
        default           : return true
      }
    })

    return filtered.sort((a, b) => {
      const vA = effectiveVal(a)
      const vB = effectiveVal(b)

      // 1. Oportunidades urgentes primero
      const isUrgentOp = (i: UnifiedItem) =>
        i.source === 'oportunidad' && (i.urgencia === '24h' || i.urgencia === 'semana')
      if (isUrgentOp(a) && !isUrgentOp(b)) return -1
      if (!isUrgentOp(a) && isUrgentOp(b)) return 1
      if (isUrgentOp(a) && isUrgentOp(b)) {
        const uo = (u?: string) => u === '24h' ? 0 : 1
        return uo(a.urgencia) - uo(b.urgencia)
      }

      // 2. Aprobados por funnel (BOFU > MOFU > TOFU)
      if (vA === 'aprobado' && vB !== 'aprobado') return -1
      if (vA !== 'aprobado' && vB === 'aprobado') return 1
      if (vA === 'aprobado' && vB === 'aprobado') {
        const fo: Record<string, number> = { bofu: 0, mofu: 1, tofu: 2 }
        return (fo[a.funnel_stage ?? ''] ?? 3) - (fo[b.funnel_stage ?? ''] ?? 3)
      }

      // 3. Propuestos por prioridad
      if (vA === 'propuesto' && vB === 'revision') return -1
      if (vA === 'revision' && vB === 'propuesto') return 1

      return (a.prioridad_final ?? 99) - (b.prioridad_final ?? 99)
    })
  }, [items, filtro, verRechazados, localVal])

  // ─────────────────────────────────────────────────────────
  // Validación
  // ─────────────────────────────────────────────────────────

  const handleValidar = useCallback(async (
    item    : UnifiedItem,
    newVal  : 'aprobado' | 'revision' | 'rechazado',
    motivo ?: string,
  ) => {
    const prev = localVal[item.id] ?? { validacion: item.validacion, motivo_rechazo: item.motivo_rechazo }

    // Optimistic update
    setLocalVal((cur) => ({ ...cur, [item.id]: { validacion: newVal, motivo_rechazo: motivo } }))
    setRechazandoId(null)
    setMotivoInput('')

    // Only persist for mapa items (oportunidades don't have validacion in DB)
    if (item.source !== 'mapa') return

    try {
      const res = await fetch(`/api/strategy/mapa/items/${item.id}`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ validacion: newVal, motivo_rechazo: motivo ?? null }),
      })
      if (!res.ok) throw new Error('Error guardando validación')
    } catch {
      // Revert
      setLocalVal((cur) => ({ ...cur, [item.id]: prev }))
    }
  }, [localVal])

  // ─────────────────────────────────────────────────────────
  // Planificar
  // ─────────────────────────────────────────────────────────

  const handlePlanificar = async (item: UnifiedItem) => {
    if (!clienteId || !planFecha) return
    setPlanLoading(true)
    try {
      const body: Record<string, unknown> = {
        client_id        : clienteId,
        titulo           : item.titulo,
        keyword          : item.keyword,
        fecha_publicacion: planFecha,
        fuente           : item.source === 'oportunidad' ? 'actualidad' : 'almacen',
      }
      if (item.source === 'mapa')       body.map_item_id   = item.id
      if (item.source === 'oportunidad') body.oportunidad_id = item.id

      const res = await fetch('/api/strategy/calendario', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Error planificando')

      // Update item locally with fecha_calendario
      setItems((cur) => cur.map((i) =>
        i.id === item.id ? { ...i, fecha_calendario: planFecha } : i,
      ))
      setPlanId(null)
    } catch (e) {
      console.error(e)
    } finally {
      setPlanLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────
  // Pedir redacción (mapa items)
  // ─────────────────────────────────────────────────────────

  const handlePedirRedaccion = async (item: UnifiedItem) => {
    if (item.source !== 'mapa' || pedidosEnProceso.has(item.id)) return

    const next = new Set(pedidosEnProceso)
    next.add(item.id)
    setPedidosEnProceso(next)

    try {
      const res = await fetch('/api/pedidos/desde-mapa', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          map_item_id         : item.id,
          client_id           : clienteId,
          titulo              : item.titulo,
          keyword_principal   : item.keyword ?? '',
          keywords_secundarias: [],
          ...(item.content_status === 'existing_content' && {
            tipo        : 'actualizacion',
            existing_url: item.keyword,
          }),
        }),
      })
      const data = await res.json()
      if (data.contenido_id) {
        setPedidosCreados((cur) => ({ ...cur, [item.id]: data.contenido_id }))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setPedidosEnProceso((prev) => {
        const n = new Set(prev)
        n.delete(item.id)
        return n
      })
    }
  }

  // ─────────────────────────────────────────────────────────
  // Crear contenido (oportunidades)
  // ─────────────────────────────────────────────────────────

  const handleCrearContenidoOp = async (item: UnifiedItem) => {
    if (pedidosEnProceso.has(item.id)) return

    const next = new Set(pedidosEnProceso)
    next.add(item.id)
    setPedidosEnProceso(next)

    try {
      const res = await fetch('/api/strategy/actualidad/crear-contenido', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          client_id: clienteId,
          titulo   : item.titulo,
          keyword  : item.keyword,
          urgencia : item.urgencia,
        }),
      })
      const data = await res.json()
      if (data.contenido_id) {
        setPedidosCreados((cur) => ({ ...cur, [item.id]: data.contenido_id }))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setPedidosEnProceso((prev) => {
        const n = new Set(prev)
        n.delete(item.id)
        return n
      })
    }
  }

  // ─────────────────────────────────────────────────────────
  // Generar contenidos (modal)
  // ─────────────────────────────────────────────────────────

  const handleGenerarContenidos = async () => {
    if (!clienteId) return
    setGenerando(true)
    setErrorGenerar(null)

    try {
      const excludeKeywords = esMasContenidos
        ? items.filter((i) => i.source === 'mapa').map((i) => i.keyword).filter(Boolean) as string[]
        : []

      const res = await fetch('/api/strategy/generate-map', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          client_id       : clienteId,
          total_articles  : cantidadPedir,
          exclude_keywords: excludeKeywords,
          config          : { meses: 3, articulos_por_mes: Math.ceil(cantidadPedir / 3) },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error generando contenidos')

      setMostrarModal(false)
      await fetchData(clienteId)
    } catch (e) {
      setErrorGenerar(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setGenerando(false)
    }
  }

  // ─────────────────────────────────────────────────────────
  // Gap analysis
  // ─────────────────────────────────────────────────────────

  const handleAnalizarGaps = async () => {
    if (!clienteId || analizandoGaps) return
    setAnalizandoGaps(true)
    try {
      const res = await fetch('/api/strategy/check-existing', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ client_id: clienteId }),
      })
      if (res.ok) await fetchData(clienteId)
    } catch (e) {
      console.error(e)
    } finally {
      setAnalizandoGaps(false)
    }
  }

  // ─────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────

  function getValidacion(item: UnifiedItem): string {
    return localVal[item.id]?.validacion ?? item.validacion
  }

  function getMotivo(item: UnifiedItem): string | undefined {
    return localVal[item.id]?.motivo_rechazo ?? item.motivo_rechazo
  }

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  const clienteNombre = clientes.find((c) => c.id === clienteId)?.nombre

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900">Mapa de Contenidos</h1>
            {clienteNombre && (
              <span className="text-sm text-gray-500">— {clienteNombre}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Selector de cliente */}
            <select
              value={clienteId}
              onChange={(e) => handleSetCliente(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Selecciona cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>

            {clienteId && (
              <>
                <button
                  onClick={() => fetchData(clienteId)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  title="Recargar"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setEsMasContenidos(false); setMostrarModal(true) }}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Pedir contenidos
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {!clienteId && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">Selecciona un cliente para ver el mapa de contenidos</p>
          </div>
        )}

        {clienteId && loading && (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Cargando mapa...</span>
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
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {([
                { key: 'todos',      label: 'Todos' },
                { key: 'aprobados',  label: 'Aprobados' },
                { key: 'revision',   label: 'En revisión' },
                { key: 'oportunidad',label: '⚡ Actualidad' },
                { key: 'tofu',       label: 'TOFU' },
                { key: 'mofu',       label: 'MOFU' },
                { key: 'bofu',       label: 'BOFU' },
              ] as { key: FiltroActivo; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFiltro(key)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                    filtro === key
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300',
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setVerRechazados((v) => !v)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors border ml-auto',
                  verRechazados
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-red-200',
                )}
              >
                {verRechazados ? 'Ocultar rechazados' : 'Ver rechazados'}
              </button>
              <button
                onClick={handleAnalizarGaps}
                disabled={analizandoGaps}
                className="px-3 py-1 rounded-full text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:border-indigo-300 disabled:opacity-50 flex items-center gap-1"
              >
                {analizandoGaps ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Analizar gaps
              </button>
            </div>

            {/* ── Tabla ───────────────────────────────────────── */}
            {sortedItems.length === 0 ? (
              <div className="text-center py-16 text-gray-400 bg-white rounded-lg border border-gray-200">
                <p>No hay artículos con los filtros seleccionados.</p>
                <button
                  onClick={() => { setEsMasContenidos(false); setMostrarModal(true) }}
                  className="mt-4 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Generar contenidos con IA
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left w-8">#</th>
                      <th className="px-4 py-2.5 text-left">Título + Keyword</th>
                      <th className="px-4 py-2.5 text-left w-24">Tipo</th>
                      <th className="px-4 py-2.5 text-left w-28">Gap</th>
                      <th className="px-4 py-2.5 text-center w-32">Estado</th>
                      <th className="px-4 py-2.5 text-left w-52">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedItems.map((item, idx) => {
                      const val       = getValidacion(item)
                      const motivo    = getMotivo(item)
                      const contenidoId = pedidosCreados[item.id] ?? item.contenido_id
                      const enProceso   = pedidosEnProceso.has(item.id)
                      const gap         = gapBadge(item.content_status)
                      const urgInfo     = item.source === 'oportunidad' ? urgenciaLabel(item.urgencia) : null

                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            'hover:bg-gray-50/60 transition-colors',
                            val === 'rechazado' && 'opacity-50',
                          )}
                        >
                          {/* # */}
                          <td className="px-4 py-3 text-gray-400 tabular-nums">{idx + 1}</td>

                          {/* Título + Keyword */}
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              {item.source === 'oportunidad' && (
                                <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                              )}
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-gray-900">{item.titulo}</span>
                                  {item.content_status === 'existing_content' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Existe</span>
                                  )}
                                  {item.content_status === 'partial' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Parcial</span>
                                  )}
                                  {urgInfo && (
                                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold', urgInfo.cls)}>
                                      {urgInfo.label}
                                    </span>
                                  )}
                                </div>
                                {item.keyword && (
                                  <p className="text-xs text-gray-400 mt-0.5">{item.keyword}</p>
                                )}
                                {val === 'rechazado' && motivo && (
                                  <p className="text-xs text-red-400 mt-0.5 italic">↳ {motivo}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Tipo funnel */}
                          <td className="px-4 py-3">
                            {item.funnel_stage ? (
                              <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded uppercase', funnelColor(item.funnel_stage))}>
                                {item.funnel_stage}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>

                          {/* Gap */}
                          <td className="px-4 py-3">
                            {gap ? (
                              <span className={cn('text-[11px] px-1.5 py-0.5 rounded', gap.cls)}>{gap.label}</span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>

                          {/* Estado — 3 botones inline */}
                          <td className="px-4 py-3">
                            {rechazandoId === item.id ? (
                              <div className="flex flex-col gap-1.5">
                                <input
                                  autoFocus
                                  placeholder="Motivo (opcional)"
                                  value={motivoInput}
                                  onChange={(e) => setMotivoInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleValidar(item, 'rechazado', motivoInput)
                                    if (e.key === 'Escape') { setRechazandoId(null); setMotivoInput('') }
                                  }}
                                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-300"
                                />
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleValidar(item, 'rechazado', motivoInput)}
                                    className="flex-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded px-2 py-0.5"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    onClick={() => { setRechazandoId(null); setMotivoInput('') }}
                                    className="text-xs text-gray-400 hover:text-gray-600 px-1"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 justify-center">
                                <button
                                  onClick={() => handleValidar(item, 'aprobado')}
                                  title="Aprobar"
                                  className={cn(
                                    'h-7 w-7 rounded flex items-center justify-center transition-colors',
                                    val === 'aprobado'
                                      ? 'bg-emerald-100 text-emerald-600'
                                      : 'bg-gray-50 text-gray-300 hover:bg-emerald-50 hover:text-emerald-500',
                                  )}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleValidar(item, 'revision')}
                                  title="En revisión"
                                  className={cn(
                                    'h-7 w-7 rounded flex items-center justify-center transition-colors',
                                    val === 'revision'
                                      ? 'bg-amber-100 text-amber-600'
                                      : 'bg-gray-50 text-gray-300 hover:bg-amber-50 hover:text-amber-500',
                                  )}
                                >
                                  <HelpCircle className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (val === 'rechazado') {
                                      handleValidar(item, 'aprobado')
                                    } else {
                                      setRechazandoId(item.id)
                                      setMotivoInput('')
                                    }
                                  }}
                                  title="Rechazar"
                                  className={cn(
                                    'h-7 w-7 rounded flex items-center justify-center transition-colors',
                                    val === 'rechazado'
                                      ? 'bg-red-100 text-red-500'
                                      : 'bg-gray-50 text-gray-300 hover:bg-red-50 hover:text-red-400',
                                  )}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Acción */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Fecha calendario badge */}
                              {item.fecha_calendario && (
                                <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                                  📅 {item.fecha_calendario}
                                </span>
                              )}

                              {/* Contenido creado */}
                              {contenidoId ? (
                                <Link
                                  href={`/contenidos/${contenidoId}`}
                                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                                >
                                  Ver contenido <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : val === 'aprobado' ? (
                                <>
                                  {/* Planificar */}
                                  <div className="relative" ref={planId === item.id ? planRef : undefined}>
                                    <button
                                      onClick={() => setPlanId(planId === item.id ? null : item.id)}
                                      className="flex items-center gap-0.5 text-xs text-gray-600 hover:text-indigo-600 px-2 py-1 rounded border border-gray-200 hover:border-indigo-300 bg-white"
                                    >
                                      <CalendarPlus className="h-3.5 w-3.5" />
                                      Planificar
                                    </button>

                                    {planId === item.id && (
                                      <div
                                        ref={planRef}
                                        className="absolute z-20 left-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-56"
                                      >
                                        <p className="text-xs font-medium text-gray-700 mb-1.5">Fecha de publicación:</p>
                                        <input
                                          type="date"
                                          value={planFecha}
                                          onChange={(e) => setPlanFecha(e.target.value)}
                                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 mb-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                        />
                                        <button
                                          onClick={() => handlePlanificar(item)}
                                          disabled={planLoading}
                                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded px-2 py-1.5 disabled:opacity-50"
                                        >
                                          {planLoading ? 'Añadiendo…' : 'Añadir al calendario'}
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Pedir redacción / Crear contenido */}
                                  {item.source === 'mapa' ? (
                                    <button
                                      onClick={() => handlePedirRedaccion(item)}
                                      disabled={enProceso}
                                      className="flex items-center gap-0.5 text-xs text-gray-600 hover:text-indigo-600 px-2 py-1 rounded border border-gray-200 hover:border-indigo-300 bg-white disabled:opacity-50"
                                    >
                                      {enProceso
                                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Generando brief…</>
                                        : <><Pencil className="h-3.5 w-3.5" /> Pedir redacción</>
                                      }
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleCrearContenidoOp(item)}
                                      disabled={enProceso}
                                      className="flex items-center gap-0.5 text-xs text-gray-600 hover:text-amber-600 px-2 py-1 rounded border border-gray-200 hover:border-amber-300 bg-white disabled:opacity-50"
                                    >
                                      {enProceso
                                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Creando…</>
                                        : <><Pencil className="h-3.5 w-3.5" /> Crear contenido</>
                                      }
                                    </button>
                                  )}
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Footer ──────────────────────────────────────── */}
            {items.length > 0 && (
              <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                <span>
                  Mostrando {sortedItems.length} contenidos · {stats.aprobados} aprobados
                </span>
                <button
                  onClick={() => { setEsMasContenidos(true); setMostrarModal(true) }}
                  className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Solicitar más contenidos
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal: pedir / solicitar más contenidos ──────────── */}
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
                Ya tienes {items.filter((i) => i.source === 'mapa').length} contenidos en el mapa.
                El sistema no repetirá los existentes ni los rechazados.
              </p>
            )}

            <div className="flex items-center gap-3 my-4">
              <input
                type="number"
                min={5}
                max={200}
                value={cantidadPedir}
                onChange={(e) => setCantidadPedir(Math.max(5, parseInt(e.target.value) || 40))}
                className="w-24 text-center text-xl font-bold border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-gray-600">artículos</span>
            </div>

            {!esMasContenidos && (
              <div className="text-sm text-gray-500 space-y-1 mb-5">
                <p className="font-medium text-gray-700 mb-1">
                  El sistema generará los mejores contenidos para este cliente basándose en:
                </p>
                {['Keywords con potencial', 'Contenido ya publicado', 'Artículos rechazados', 'Competencia', 'Distribución TOFU/MOFU/BOFU'].map((txt) => (
                  <p key={txt} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />{txt}
                  </p>
                ))}
              </div>
            )}

            {errorGenerar && (
              <p className="text-sm text-red-500 mb-3">{errorGenerar}</p>
            )}

            {generando && (
              <p className="text-sm text-indigo-600 flex items-center gap-1.5 mb-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando {cantidadPedir} artículos… (puede tardar 30-60s)
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setMostrarModal(false); setErrorGenerar(null) }}
                disabled={generando}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerarContenidos}
                disabled={generando || !clienteId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              >
                {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {generando ? 'Generando…' : 'Generar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
