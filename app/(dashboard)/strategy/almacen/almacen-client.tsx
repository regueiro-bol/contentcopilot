'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Archive,
  Search,
  Loader2,
  ExternalLink,
  Calendar,
  AlertCircle,
  ChevronDown,
  RefreshCw,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Cliente {
  id    : string
  nombre: string
}

interface AlmacenItem {
  id               : string
  map_id           : string
  client_id        : string
  title            : string
  slug             : string | null
  main_keyword     : string
  cluster          : string | null
  funnel_stage     : 'tofu' | 'mofu' | 'bofu' | null
  tipo_articulo    : 'nuevo' | 'actualizacion' | 'mejora' | null
  prioridad_final  : number | null
  validacion       : string | null
  status           : string
  fecha_calendario : string | null
  contenido_id     : string | null
  notas            : string | null
  estado_almacen   : string
  sesion_nombre    : string
}

interface Props {
  clientes: Cliente[]
}

// ─── Constantes de estado ─────────────────────────────────────────────────────

const ESTADOS: { value: string; label: string; color: string }[] = [
  { value: 'propuesto',              label: 'Propuesto',              color: 'bg-gray-100 text-gray-600'     },
  { value: 'en_revision',            label: 'En revisión',            color: 'bg-amber-100 text-amber-700'   },
  { value: 'aprobado',               label: 'Aprobado',               color: 'bg-green-100 text-green-700'   },
  { value: 'rechazado',              label: 'Rechazado',              color: 'bg-red-100 text-red-700'       },
  { value: 'en_calendario',          label: 'En calendario',          color: 'bg-blue-100 text-blue-700'     },
  { value: 'en_redaccion',           label: 'En redacción',           color: 'bg-violet-100 text-violet-700' },
  { value: 'revision_editorial',     label: 'Revisión editorial',     color: 'bg-orange-100 text-orange-700' },
  { value: 'publicado',              label: 'Publicado',              color: 'bg-emerald-100 text-emerald-700'},
  { value: 'actualizacion_pendiente',label: 'Actualiz. pendiente',    color: 'bg-rose-100 text-rose-700'     },
]

function estadoStyle(estado: string) {
  return ESTADOS.find((e) => e.value === estado) ?? { label: estado, color: 'bg-gray-100 text-gray-500' }
}

function EstadoBadge({ estado }: { estado: string }) {
  const { label, color } = estadoStyle(estado)
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${color}`}>
      {label}
    </span>
  )
}

function TipoBadge({ tipo }: { tipo: string | null }) {
  if (!tipo || tipo === 'nuevo') return <span className="text-[10px] font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">Nuevo</span>
  if (tipo === 'mejora')         return <span className="text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">Mejora</span>
  return <span className="text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">Actual.</span>
}

function PrioridadBadge({ p }: { p: number | null }) {
  const val = p ?? 2
  const cls = val === 1 ? 'bg-red-100 text-red-700' : val === 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
  return <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${cls}`}>P{val}</span>
}

function FunnelBadge({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-gray-300 text-xs">—</span>
  const map: Record<string, string> = {
    tofu: 'bg-green-100 text-green-700',
    mofu: 'bg-amber-100 text-amber-700',
    bofu: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${map[stage] ?? 'bg-gray-100 text-gray-500'}`}>
      {stage.toUpperCase()}
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AlmacenClient({ clientes }: Props) {
  // Selección de cliente
  const [clienteId, setClienteId]       = useState<string>(clientes[0]?.id ?? '')

  // Items y paginación
  const [items, setItems]               = useState<AlmacenItem[]>([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [cargando, setCargando]         = useState(false)
  const [error, setError]               = useState<string | null>(null)

  // Filtros
  const [filtroEstado, setFiltroEstado]         = useState('')
  const [filtroTipo, setFiltroTipo]             = useState('')
  const [filtroFunnel, setFiltroFunnel]         = useState('')
  const [filtroPrioridad, setFiltroPrioridad]   = useState('')
  const [filtroCluster, setFiltroCluster]       = useState('')
  const [busqueda, setBusqueda]                 = useState('')
  const [busquedaInput, setBusquedaInput]       = useState('')

  // Acciones por item
  const [asignandoFecha, setAsignandoFecha]     = useState<string | null>(null)
  const [fechaInput, setFechaInput]             = useState('')
  const [guardandoId, setGuardandoId]           = useState<string | null>(null)
  const [localOverrides, setLocalOverrides]     = useState<Record<string, Partial<AlmacenItem>>>({})

  // ── Clusters únicos del cliente (para el select dinámico) ──
  const clustersUnicos = useMemo(() => {
    const set = new Set(items.map((i) => i.cluster).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [items])

  // ── Cargar items ───────────────────────────────────────────
  const cargarItems = useCallback(async (resetPage = false) => {
    if (!clienteId) return
    setCargando(true)
    setError(null)
    const currentPage = resetPage ? 1 : page
    if (resetPage) setPage(1)

    const params = new URLSearchParams({ client_id: clienteId, page: String(currentPage) })
    if (filtroEstado)    params.set('estado', filtroEstado)
    if (filtroTipo)      params.set('tipo_articulo', filtroTipo)
    if (filtroFunnel)    params.set('funnel_stage', filtroFunnel)
    if (filtroPrioridad) params.set('prioridad_final', filtroPrioridad)
    if (filtroCluster)   params.set('cluster', filtroCluster)
    if (busqueda)        params.set('q', busqueda)

    try {
      const res  = await fetch(`/api/strategy/almacen?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error cargando almacén')

      if (resetPage || currentPage === 1) {
        setItems(data.items)
      } else {
        setItems((prev) => [...prev, ...data.items])
      }
      setTotal(data.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCargando(false)
    }
  }, [clienteId, page, filtroEstado, filtroTipo, filtroFunnel, filtroPrioridad, filtroCluster, busqueda])

  // Recargar cuando cambia cliente o filtros (reset a página 1)
  useEffect(() => { cargarItems(true) }, [clienteId, filtroEstado, filtroTipo, filtroFunnel, filtroPrioridad, filtroCluster, busqueda]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar más páginas
  const cargarMas = () => {
    setPage((p) => p + 1)
    cargarItems(false)
  }

  // ── Asignar fecha_calendario ───────────────────────────────
  async function handleAsignarFecha(item: AlmacenItem) {
    if (!fechaInput) return
    setGuardandoId(item.id)
    // Optimistic
    setLocalOverrides((prev) => ({
      ...prev,
      [item.id]: {
        fecha_calendario: fechaInput,
        estado_almacen  : item.validacion === 'aprobado' ? 'en_calendario' : item.estado_almacen,
      },
    }))
    setAsignandoFecha(null)
    setFechaInput('')
    try {
      const res = await fetch(`/api/strategy/almacen/${item.id}`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ fecha_calendario: fechaInput }),
      })
      if (!res.ok) throw new Error('Error guardando fecha')
      const data = await res.json()
      // Si se creó pedido, actualizar contenido_id
      if (data.pedido_id) {
        setLocalOverrides((prev) => ({
          ...prev,
          [item.id]: {
            ...prev[item.id],
            contenido_id  : data.pedido_id,
            estado_almacen: 'en_calendario',
          },
        }))
      }
    } catch {
      setLocalOverrides((prev) => { const n = { ...prev }; delete n[item.id]; return n })
    } finally {
      setGuardandoId(null)
    }
  }

  // ── Cambiar estado manualmente ─────────────────────────────
  async function handleCambiarEstado(item: AlmacenItem, nuevoStatus: string) {
    setGuardandoId(item.id)
    setLocalOverrides((prev) => ({ ...prev, [item.id]: { status: nuevoStatus } }))
    try {
      const res = await fetch(`/api/strategy/almacen/${item.id}`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ status: nuevoStatus }),
      })
      if (!res.ok) throw new Error('Error actualizando estado')
    } catch {
      setLocalOverrides((prev) => { const n = { ...prev }; delete n[item.id]; return n })
    } finally {
      setGuardandoId(null)
    }
  }

  // ── Items con overrides aplicados ──────────────────────────
  const itemsMerged = useMemo(
    () => items.map((i) => localOverrides[i.id] ? { ...i, ...localOverrides[i.id] } : i),
    [items, localOverrides],
  )

  // ── KPIs ───────────────────────────────────────────────────
  // Calculados sobre todos los items del cliente (no solo la página actual)
  // Para KPIs fieles necesitamos items sin filtro — los derivamos de itemsMerged (aproximación de la página)
  const kpis = useMemo(() => ({
    total          : total,
    aprobados      : itemsMerged.filter((i) => i.estado_almacen === 'aprobado').length,
    en_calendario  : itemsMerged.filter((i) => i.estado_almacen === 'en_calendario').length,
    en_redaccion   : itemsMerged.filter((i) => i.estado_almacen === 'en_redaccion').length,
    publicados     : itemsMerged.filter((i) => i.estado_almacen === 'publicado').length,
    pend_actualizac: itemsMerged.filter((i) => i.estado_almacen === 'actualizacion_pendiente').length,
  }), [itemsMerged, total])

  const clienteNombre = clientes.find((c) => c.id === clienteId)?.nombre ?? '—'

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Archive className="h-6 w-6 text-indigo-600 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Almacén de Contenidos</h1>
            <p className="text-sm text-gray-500">Estrategia editorial permanente por cliente</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector de cliente */}
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <select
              value={clienteId}
              onChange={(e) => { setClienteId(e.target.value); setFiltroCluster('') }}
              className="text-sm text-gray-700 font-medium bg-transparent outline-none cursor-pointer"
            >
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => cargarItems(true)}
            disabled={cargando}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', cargando && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: 'Total',             value: kpis.total,           color: 'text-gray-700'    },
          { label: 'Aprobados',         value: kpis.aprobados,       color: 'text-green-700'   },
          { label: 'En calendario',     value: kpis.en_calendario,   color: 'text-blue-700'    },
          { label: 'En redacción',      value: kpis.en_redaccion,    color: 'text-violet-700'  },
          { label: 'Publicados',        value: kpis.publicados,      color: 'text-emerald-700' },
          { label: 'Pend. actualiz.',   value: kpis.pend_actualizac, color: 'text-rose-700'    },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-2.5">
              <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center bg-gray-50 rounded-xl px-3 py-2.5">
        {/* Búsqueda */}
        <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1 bg-white">
          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Título o keyword..."
            value={busquedaInput}
            onChange={(e) => setBusquedaInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setBusqueda(busquedaInput) }}
            onBlur={() => setBusqueda(busquedaInput)}
            className="text-xs text-gray-600 bg-transparent outline-none w-36"
          />
          {busquedaInput && (
            <button type="button" onClick={() => { setBusquedaInput(''); setBusqueda('') }}>
              <X className="h-3 w-3 text-gray-400" />
            </button>
          )}
        </div>

        {/* Estado */}
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none cursor-pointer"
        >
          <option value="">Estado: todos</option>
          {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>

        {/* Tipo */}
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none cursor-pointer"
        >
          <option value="">Tipo: todos</option>
          <option value="nuevo">Nuevo</option>
          <option value="mejora">Mejora</option>
          <option value="actualizacion">Actualización</option>
        </select>

        {/* Funnel */}
        <select
          value={filtroFunnel}
          onChange={(e) => setFiltroFunnel(e.target.value)}
          className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none cursor-pointer"
        >
          <option value="">Funnel: todos</option>
          <option value="tofu">TOFU</option>
          <option value="mofu">MOFU</option>
          <option value="bofu">BOFU</option>
        </select>

        {/* Prioridad */}
        <select
          value={filtroPrioridad}
          onChange={(e) => setFiltroPrioridad(e.target.value)}
          className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none cursor-pointer"
        >
          <option value="">Prioridad: todas</option>
          <option value="1">P1</option>
          <option value="2">P2</option>
          <option value="3">P3</option>
        </select>

        {/* Cluster (dinámico) */}
        {clustersUnicos.length > 0 && (
          <select
            value={filtroCluster}
            onChange={(e) => setFiltroCluster(e.target.value)}
            className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none cursor-pointer max-w-[180px]"
          >
            <option value="">Cluster: todos</option>
            {clustersUnicos.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {/* Limpiar filtros */}
        {(filtroEstado || filtroTipo || filtroFunnel || filtroPrioridad || filtroCluster || busqueda) && (
          <button
            type="button"
            onClick={() => {
              setFiltroEstado(''); setFiltroTipo(''); setFiltroFunnel('')
              setFiltroPrioridad(''); setFiltroCluster(''); setBusqueda(''); setBusquedaInput('')
            }}
            className="text-xs text-red-600 hover:text-red-800 font-medium"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Tabla ───────────────────────────────────────────── */}
      {cargando && items.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando almacén de {clienteNombre}...</span>
        </div>
      ) : itemsMerged.length === 0 && !cargando ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Archive className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Sin artículos en el almacén</p>
          <p className="text-xs mt-1">
            {filtroEstado || filtroTipo || filtroFunnel || filtroPrioridad || filtroCluster || busqueda
              ? 'Prueba a cambiar los filtros'
              : 'Genera y valida un mapa de contenidos para este cliente'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Título</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">Keyword</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Cluster</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Funnel</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 hidden sm:table-cell">Tipo</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 hidden sm:table-cell">Prior.</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Estado</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 hidden md:table-cell">Fecha</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {itemsMerged.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">

                      {/* Título */}
                      <td className="px-4 py-3 max-w-[260px]">
                        <p className="font-medium text-gray-900 leading-snug line-clamp-2 text-xs">{item.title}</p>
                        {item.slug && (
                          <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5">/{item.slug}</p>
                        )}
                      </td>

                      {/* Keyword */}
                      <td className="px-3 py-3 hidden lg:table-cell">
                        <span className="text-xs text-gray-600">{item.main_keyword}</span>
                      </td>

                      {/* Cluster */}
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className="text-xs text-gray-500 line-clamp-1">{item.cluster ?? '—'}</span>
                      </td>

                      {/* Funnel */}
                      <td className="px-3 py-3 text-center">
                        <FunnelBadge stage={item.funnel_stage} />
                      </td>

                      {/* Tipo */}
                      <td className="px-3 py-3 text-center hidden sm:table-cell">
                        <TipoBadge tipo={item.tipo_articulo} />
                      </td>

                      {/* Prioridad */}
                      <td className="px-3 py-3 text-center hidden sm:table-cell">
                        <PrioridadBadge p={item.prioridad_final} />
                      </td>

                      {/* Estado */}
                      <td className="px-3 py-3 text-center">
                        <EstadoBadge estado={item.estado_almacen} />
                      </td>

                      {/* Fecha calendario */}
                      <td className="px-3 py-3 text-center hidden md:table-cell">
                        {asignandoFecha === item.id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="date"
                              value={fechaInput}
                              onChange={(e) => setFechaInput(e.target.value)}
                              className="text-[11px] border border-blue-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-400"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleAsignarFecha(item)}
                              disabled={!fechaInput || guardandoId === item.id}
                              className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                            >
                              {guardandoId === item.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Calendar className="h-3.5 w-3.5" />
                              }
                            </button>
                            <button type="button" onClick={() => setAsignandoFecha(null)}>
                              <X className="h-3 w-3 text-gray-400" />
                            </button>
                          </div>
                        ) : item.fecha_calendario ? (
                          <button
                            type="button"
                            onClick={() => { setAsignandoFecha(item.id); setFechaInput(item.fecha_calendario ?? '') }}
                            className="text-[11px] text-blue-700 bg-blue-50 rounded px-2 py-0.5 hover:bg-blue-100 tabular-nums"
                          >
                            {new Date(item.fecha_calendario + 'T00:00:00').toLocaleDateString('es-ES', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            })}
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Acción */}
                      <td className="px-3 py-3 text-center">
                        {guardandoId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 mx-auto" />
                        ) : item.contenido_id ? (
                          <Link
                            href={`/contenidos/${item.contenido_id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1.5 rounded-lg transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Ver pedido
                          </Link>
                        ) : item.estado_almacen === 'aprobado' ? (
                          <button
                            type="button"
                            onClick={() => { setAsignandoFecha(item.id); setFechaInput('') }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded-lg transition-colors"
                          >
                            <Calendar className="h-3 w-3" />
                            Asignar fecha
                          </button>
                        ) : item.estado_almacen === 'publicado' ? (
                          <button
                            type="button"
                            onClick={() => handleCambiarEstado(item, 'update_needed')}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-1.5 rounded-lg transition-colors"
                          >
                            Marcar actualiz.
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span>
              Mostrando {itemsMerged.length} de {total} artículos
            </span>
            {total > itemsMerged.length && (
              <Button
                variant="outline"
                size="sm"
                onClick={cargarMas}
                disabled={cargando}
                className="gap-2"
              >
                {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Cargar más
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
