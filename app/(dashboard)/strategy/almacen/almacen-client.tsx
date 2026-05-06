'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Search,
  Loader2,
  ExternalLink,
  AlertCircle,
  ChevronDown,
  RefreshCw,
  X,
  Rocket,
  BarChart2,
  Globe,
  User,
  CheckSquare,
  Square,
  Archive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Cliente {
  id    : string
  nombre: string
}

interface BancoItem {
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
  fase             : 'arranque' | 'consolidacion' | 'expansion' | 'sin_fase' | null
  contenido_id     : string | null
  assignee_name    : string | null
  redactor_asignado: string | null
  notas            : string | null
  estado_almacen   : string
  sesion_nombre    : string
}

interface Props {
  clientes: Cliente[]
}

// ─── Config de fases ──────────────────────────────────────────────────────────

const FASE_CONFIG = {
  arranque     : { label: 'Arranque',      bg: 'bg-red-100',    text: 'text-red-700',    icon: Rocket    },
  consolidacion: { label: 'Consolidación', bg: 'bg-amber-100',  text: 'text-amber-700',  icon: BarChart2 },
  expansion    : { label: 'Expansión',     bg: 'bg-green-100',  text: 'text-green-700',  icon: Globe     },
  sin_fase     : { label: 'Sin fase',      bg: 'bg-gray-100',   text: 'text-gray-500',   icon: Archive   },
} as const

// ─── Constantes de estado ─────────────────────────────────────────────────────

const ESTADOS: { value: string; label: string; color: string }[] = [
  { value: 'propuesto',               label: 'Propuesto',             color: 'bg-gray-100 text-gray-600'      },
  { value: 'en_revision',             label: 'En revisión',           color: 'bg-amber-100 text-amber-700'    },
  { value: 'aprobado',                label: 'Aprobado',              color: 'bg-green-100 text-green-700'    },
  { value: 'rechazado',               label: 'Rechazado',             color: 'bg-red-100 text-red-700'        },
  { value: 'en_calendario',           label: 'En calendario',         color: 'bg-blue-100 text-blue-700'      },
  { value: 'en_redaccion',            label: 'En redacción',          color: 'bg-violet-100 text-violet-700'  },
  { value: 'revision_editorial',      label: 'Rev. editorial',        color: 'bg-orange-100 text-orange-700'  },
  { value: 'publicado',               label: 'Publicado',             color: 'bg-emerald-100 text-emerald-700'},
  { value: 'actualizacion_pendiente', label: 'Actualiz. pendiente',   color: 'bg-rose-100 text-rose-700'      },
]

function estadoStyle(estado: string) {
  return ESTADOS.find((e) => e.value === estado) ?? { label: estado, color: 'bg-gray-100 text-gray-500' }
}

// ─── Badges ───────────────────────────────────────────────────────────────────

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

function FaseBadge({ fase }: { fase: string | null }) {
  const key = (fase ?? 'sin_fase') as keyof typeof FASE_CONFIG
  const cfg = FASE_CONFIG[key] ?? FASE_CONFIG.sin_fase
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function BancoClient({ clientes }: Props) {
  // Selección de cliente
  const [clienteId, setClienteId]       = useState<string>(clientes[0]?.id ?? '')

  // Items y paginación
  const [items, setItems]               = useState<BancoItem[]>([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [cargando, setCargando]         = useState(false)
  const [error, setError]               = useState<string | null>(null)

  // Filtros
  const [filtroEstado, setFiltroEstado]         = useState('')
  const [filtroTipo, setFiltroTipo]             = useState('')
  const [filtroFunnel, setFiltroFunnel]         = useState('')
  const [filtroFase, setFiltroFase]             = useState('')
  const [filtroPrioridad, setFiltroPrioridad]   = useState('')
  const [filtroCluster, setFiltroCluster]       = useState('')
  const [busqueda, setBusqueda]                 = useState('')
  const [busquedaInput, setBusquedaInput]       = useState('')

  // Selección múltiple
  const [seleccionados, setSeleccionados]       = useState<Set<string>>(new Set())
  const [accionMasiva, setAccionMasiva]         = useState<string | null>(null)
  const [procesandoMasiva, setProcesandoMasiva] = useState(false)

  // Overrides optimistas
  const [localOverrides, setLocalOverrides]     = useState<Record<string, Partial<BancoItem>>>({})
  const [guardandoId, setGuardandoId]           = useState<string | null>(null)

  // ── Clusters únicos del cliente ──────────────────────────
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
    if (filtroFase)      params.set('fase', filtroFase)
    if (filtroPrioridad) params.set('prioridad_final', filtroPrioridad)
    if (filtroCluster)   params.set('cluster', filtroCluster)
    if (busqueda)        params.set('q', busqueda)

    try {
      const res  = await fetch(`/api/strategy/almacen?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error cargando banco de contenidos')

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
  }, [clienteId, page, filtroEstado, filtroTipo, filtroFunnel, filtroFase, filtroPrioridad, filtroCluster, busqueda])

  useEffect(() => { cargarItems(true) }, [clienteId, filtroEstado, filtroTipo, filtroFunnel, filtroFase, filtroPrioridad, filtroCluster, busqueda]) // eslint-disable-line react-hooks/exhaustive-deps

  const cargarMas = () => {
    setPage((p) => p + 1)
    cargarItems(false)
  }

  // ── Cambiar fase ───────────────────────────────────────────
  async function handleCambiarFase(itemId: string, nuevaFase: string) {
    setGuardandoId(itemId)
    setLocalOverrides((prev) => ({ ...prev, [itemId]: { fase: nuevaFase as BancoItem['fase'] } }))
    try {
      await fetch(`/api/strategy/almacen/${itemId}`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ fase: nuevaFase }),
      })
    } catch {
      setLocalOverrides((prev) => { const n = { ...prev }; delete n[itemId]; return n })
    } finally {
      setGuardandoId(null)
    }
  }

  // ── Selección múltiple ─────────────────────────────────────
  const toggleSeleccion = (id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSeleccionTodos = () => {
    if (seleccionados.size === itemsMerged.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(itemsMerged.map((i) => i.id)))
    }
  }

  // ── Acción masiva: cambiar fase ────────────────────────────
  async function aplicarCambioFaseMasivo(nuevaFase: string) {
    if (seleccionados.size === 0) return
    setProcesandoMasiva(true)
    const ids = Array.from(seleccionados)
    // Optimistic
    setLocalOverrides((prev) => {
      const next = { ...prev }
      for (const id of ids) next[id] = { ...next[id], fase: nuevaFase as BancoItem['fase'] }
      return next
    })
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/strategy/almacen/${id}`, {
            method : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ fase: nuevaFase }),
          }),
        ),
      )
      setSeleccionados(new Set())
      setAccionMasiva(null)
    } catch {
      // Revertir
      setLocalOverrides((prev) => {
        const next = { ...prev }
        for (const id of ids) delete next[id]
        return next
      })
    } finally {
      setProcesandoMasiva(false)
    }
  }

  // ── Items con overrides aplicados ──────────────────────────
  const itemsMerged = useMemo(
    () => items.map((i) => localOverrides[i.id] ? { ...i, ...localOverrides[i.id] } : i),
    [items, localOverrides],
  )

  // ── KPIs ───────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    total         : total,
    pendientes    : itemsMerged.filter((i) => ['propuesto', 'en_revision'].includes(i.estado_almacen)).length,
    en_produccion : itemsMerged.filter((i) => ['en_redaccion', 'en_calendario', 'revision_editorial'].includes(i.estado_almacen)).length,
    publicados    : itemsMerged.filter((i) => i.estado_almacen === 'publicado').length,
  }), [itemsMerged, total])

  const clienteNombre = clientes.find((c) => c.id === clienteId)?.nombre ?? '—'
  const hayFiltros    = !!(filtroEstado || filtroTipo || filtroFunnel || filtroFase || filtroPrioridad || filtroCluster || busqueda)
  const todosSeleccionados = seleccionados.size > 0 && seleccionados.size === itemsMerged.length

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Archive className="h-6 w-6 text-indigo-600 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Banco de Contenidos</h1>
            <p className="text-sm text-gray-500">Estrategia editorial por cliente · {clienteNombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector de cliente */}
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <select
              value={clienteId}
              onChange={(e) => { setClienteId(e.target.value); setFiltroCluster(''); setSeleccionados(new Set()) }}
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
          {/* Planificar trimestre — Sprint 13B */}
          <Button
            variant="outline"
            size="sm"
            disabled
            className="gap-1.5 text-gray-400 border-dashed"
            title="Disponible en Sprint 13B"
          >
            Planificar trimestre
          </Button>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Total artículos',  value: kpis.total,         color: 'text-gray-700'    },
          { label: 'Pendientes',       value: kpis.pendientes,    color: 'text-amber-700'   },
          { label: 'En producción',    value: kpis.en_produccion, color: 'text-violet-700'  },
          { label: 'Publicados',       value: kpis.publicados,    color: 'text-emerald-700' },
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

        {/* Fase */}
        <select
          value={filtroFase}
          onChange={(e) => setFiltroFase(e.target.value)}
          className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none cursor-pointer"
        >
          <option value="">Fase: todas</option>
          <option value="arranque">Arranque</option>
          <option value="consolidacion">Consolidación</option>
          <option value="expansion">Expansión</option>
          <option value="sin_fase">Sin fase</option>
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
        {hayFiltros && (
          <button
            type="button"
            onClick={() => {
              setFiltroEstado(''); setFiltroTipo(''); setFiltroFunnel('')
              setFiltroFase(''); setFiltroPrioridad(''); setFiltroCluster('')
              setBusqueda(''); setBusquedaInput('')
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
          <span className="text-sm">Cargando banco de {clienteNombre}...</span>
        </div>
      ) : itemsMerged.length === 0 && !cargando ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Archive className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Sin artículos en el banco</p>
          <p className="text-xs mt-1">
            {hayFiltros
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
                    {/* Checkbox seleccionar todos */}
                    <th className="px-3 py-2.5 w-8">
                      <button
                        type="button"
                        onClick={toggleSeleccionTodos}
                        className="text-gray-400 hover:text-gray-600"
                        title={todosSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos'}
                      >
                        {todosSeleccionados
                          ? <CheckSquare className="h-4 w-4 text-indigo-600" />
                          : <Square className="h-4 w-4" />
                        }
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Título</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">Keyword</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Cluster</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Fase</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Funnel</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 hidden sm:table-cell">Tipo</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 hidden sm:table-cell">Prior.</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Estado</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Asignado a</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {itemsMerged.map((item) => {
                    const seleccionado = seleccionados.has(item.id)
                    const asignado     = item.assignee_name ?? item.redactor_asignado

                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          'hover:bg-gray-50/60 transition-colors',
                          seleccionado && 'bg-indigo-50/40',
                        )}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggleSeleccion(item.id)}
                            className="text-gray-400 hover:text-indigo-600"
                          >
                            {seleccionado
                              ? <CheckSquare className="h-4 w-4 text-indigo-600" />
                              : <Square className="h-4 w-4" />
                            }
                          </button>
                        </td>

                        {/* Título */}
                        <td className="px-3 py-3 max-w-[240px]">
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

                        {/* Fase */}
                        <td className="px-3 py-3 text-center">
                          {guardandoId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 mx-auto" />
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <FaseBadge fase={item.fase} />
                              <select
                                value={item.fase ?? 'sin_fase'}
                                onChange={(e) => handleCambiarFase(item.id, e.target.value)}
                                className="text-[10px] text-gray-400 bg-transparent outline-none cursor-pointer"
                                title="Cambiar fase"
                              >
                                <option value="arranque">Arranque</option>
                                <option value="consolidacion">Consolidación</option>
                                <option value="expansion">Expansión</option>
                                <option value="sin_fase">Sin fase</option>
                              </select>
                            </div>
                          )}
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

                        {/* Asignado a */}
                        <td className="px-3 py-3 hidden md:table-cell">
                          {asignado ? (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                              <User className="h-3 w-3 text-gray-400" />
                              {asignado}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-300">Sin asignar</span>
                          )}
                        </td>

                        {/* Acción */}
                        <td className="px-3 py-3 text-center">
                          {item.contenido_id ? (
                            <Link
                              href={`/contenidos/${item.contenido_id}`}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1.5 rounded-lg transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Ver pedido
                            </Link>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span>
              Mostrando {itemsMerged.length} de {total} artículos
              {seleccionados.size > 0 && (
                <span className="ml-2 font-semibold text-indigo-600">· {seleccionados.size} seleccionados</span>
              )}
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

      {/* ── Barra de acciones masivas ────────────────────────── */}
      {seleccionados.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-gray-900 text-white rounded-2xl px-5 py-3 shadow-xl">
            <span className="text-sm font-semibold">
              {seleccionados.size} artículo{seleccionados.size !== 1 ? 's' : ''} seleccionado{seleccionados.size !== 1 ? 's' : ''}
            </span>

            {/* Cambiar fase masivo */}
            {accionMasiva === 'fase' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">Mover a fase:</span>
                {(['arranque', 'consolidacion', 'expansion'] as const).map((f) => {
                  const cfg = FASE_CONFIG[f]
                  return (
                    <button
                      key={f}
                      type="button"
                      disabled={procesandoMasiva}
                      onClick={() => aplicarCambioFaseMasivo(f)}
                      className={cn(
                        'text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-colors',
                        cfg.bg, cfg.text,
                        procesandoMasiva && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      {procesandoMasiva ? <Loader2 className="h-3 w-3 animate-spin" /> : cfg.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setAccionMasiva(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setAccionMasiva('fase')}
                  className="text-xs bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 font-medium transition-colors"
                >
                  Cambiar fase ▾
                </button>
                <button
                  type="button"
                  onClick={() => setSeleccionados(new Set())}
                  className="text-gray-400 hover:text-white"
                  title="Cancelar selección"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
