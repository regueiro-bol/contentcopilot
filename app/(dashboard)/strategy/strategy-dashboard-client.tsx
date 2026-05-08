'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, Map, RefreshCw, Plus, Lock, ChevronRight, TrendingUp,
  BarChart3, Layers, Users, Lightbulb, Zap, Calendar, Loader2,
  AlertCircle, ExternalLink, BookOpen, CheckCircle2, X, Archive, Pencil,
} from 'lucide-react'
import { ArchiveMenu } from '@/components/ui/ArchiveMenu'
import { Button }                                  from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }                                   from '@/components/ui/badge'
import { formatearFecha, cn }                       from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface ClienteOption  { id: string; nombre: string; sector: string | null }
interface SesionResumen  {
  id: string; client_id: string; client_nombre: string; nombre: string
  status: string; created_at: string; total_keywords: number; num_clusters: number
  archived?: boolean
}
interface OportunidadItem {
  id: string; tipo: string; titulo: string; keyword: string | null
  descripcion: string | null; urgencia: string | null; relevancia: string | null
  fecha_evento: string | null; contexto: string | null; trending_pct: number | null
}
interface UpcomingItem {
  id: string; titulo: string; keyword: string | null
  fecha_publicacion: string; status: string; fuente: string | null
  funnel_stage: string | null; cluster: string | null; oportunidad_id: string | null
}
interface ActualidadStats { urgentes: number; estacionales: number; trending: number }

interface Props {
  clientes              : ClienteOption[]
  sesiones              : SesionResumen[]
  sesionesArchivadas    : SesionResumen[]
  totalSesiones         : number
  totalKeywords         : number
  totalMapas            : number
  mapasPorCliente       : Record<string, number>
  mapaSessionPorCliente : Record<string, string>
  bancoPorCliente       : Record<string, number>
}

// ─────────────────────────────────────────────────────────────
// Helpers estáticos
// ─────────────────────────────────────────────────────────────

const LS_KEY = 'strategy_cliente_id'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft       : { label: 'Borrador',     cls: 'bg-gray-100 text-gray-600'    },
  researching : { label: 'Investigando', cls: 'bg-blue-100 text-blue-700'    },
  clustering  : { label: 'Agrupando',    cls: 'bg-yellow-100 text-yellow-700'},
  completed   : { label: 'Completada',   cls: 'bg-green-100 text-green-700'  },
  error       : { label: 'Error',        cls: 'bg-red-100 text-red-700'      },
}
function StatusBadge({ status }: { status: string }) {
  const { label, cls } = STATUS_MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
}

const URGENCIA_BADGE: Record<string, { label: string; cls: string }> = {
  '24h' : { label: 'Urgente',     cls: 'bg-red-100 text-red-700'    },
  semana: { label: 'Esta semana', cls: 'bg-amber-100 text-amber-700' },
  mes   : { label: 'Este mes',    cls: 'bg-blue-100 text-blue-700'   },
}
const RELEVANCIA_BADGE: Record<string, { label: string; cls: string }> = {
  alta : { label: 'Alta',  cls: 'bg-red-100 text-red-700'    },
  media: { label: 'Media', cls: 'bg-amber-100 text-amber-700' },
  baja : { label: 'Baja',  cls: 'bg-gray-100 text-gray-600'  },
}

const FUENTE_ICON: Record<string, React.ReactNode> = {
  actualidad: <span title="Actualidad" className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-rose-100 text-rose-700 rounded-full px-1.5 py-0.5"><Zap className="h-2.5 w-2.5" />Act.</span>,
  banco     : <span title="Banco" className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-indigo-100 text-indigo-700 rounded-full px-1.5 py-0.5"><BookOpen className="h-2.5 w-2.5" />Banco</span>,
  manual    : <span title="Manual" className="text-[9px] font-bold bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">Manual</span>,
}

function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function formatFechaBonita(iso: string): string {
  const hoy    = new Date().toISOString().slice(0, 10)
  const manana = tomorrow()
  if (iso === hoy)    return 'Hoy'
  if (iso === manana) return 'Mañana'
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export default function StrategyDashboardClient({
  clientes, sesiones, sesionesArchivadas, totalSesiones, totalKeywords, totalMapas,
  mapasPorCliente, mapaSessionPorCliente, bancoPorCliente,
}: Props) {

  // ── Cliente seleccionado ──────────────────────────────────
  const [clienteId, setClienteId] = useState(() => {
    if (typeof window === 'undefined') return ''
    const saved = localStorage.getItem(LS_KEY)
    return saved && clientes.some((c) => c.id === saved) ? saved : ''
  })
  function handleClienteChange(id: string) {
    setClienteId(id)
    if (id) localStorage.setItem(LS_KEY, id)
    else     localStorage.removeItem(LS_KEY)
  }
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId) ?? null

  // ── Estado de sesiones (archivado) — declarado aquí para evitar uso antes de declaración
  const [verArchivadas,   setVerArchivadas]   = useState(false)
  const [localSesiones,   setLocalSesiones]   = useState<SesionResumen[]>(sesiones)
  const [localArchivadas, setLocalArchivadas] = useState<SesionResumen[]>(sesionesArchivadas)

  // ── Sesiones filtradas ────────────────────────────────────
  const sesionesBase = verArchivadas ? localArchivadas : localSesiones
  const sesionesCliente = useMemo(
    () => clienteId ? sesionesBase.filter((s) => s.client_id === clienteId) : sesionesBase,
    [sesionesBase, clienteId],
  )
  // Filtrar sesiones vacías en historial (solo en vista activa)
  const historialFiltrado = useMemo(
    () => verArchivadas
      ? sesionesCliente
      : sesionesCliente.filter((s) => s.total_keywords > 0 || s.status === 'completed'),
    [sesionesCliente, verArchivadas],
  )
  // La última sesión activa (para módulos del workflow)
  const ultimaSesion = useMemo(
    () => localSesiones
      .filter((s) => clienteId ? s.client_id === clienteId : true)
      .filter((s) => s.total_keywords > 0 || s.status === 'completed')[0] ?? null,
    [localSesiones, clienteId],
  )
  const [historialExpanded, setHistorialExpanded] = useState(false)
  const historialVisible = historialExpanded ? historialFiltrado : historialFiltrado.slice(0, 3)

  // ── Oportunidades de Actualidad ───────────────────────────
  const [trending,    setTrending]    = useState<OportunidadItem[]>([])
  const [estacional,  setEstacional]  = useState<OportunidadItem[]>([])
  const [actLoading,  setActLoading]  = useState(false)
  const [actGenerating, setActGenerating] = useState(false)
  const [actError,    setActError]    = useState<string | null>(null)
  const [actExpanded, setActExpanded] = useState(false)
  const actFetchedFor = useRef<string>('')

  const actualidadStats: ActualidadStats = useMemo(() => ({
    urgentes   : [...trending, ...estacional].filter(
      (o) => o.urgencia === '24h' || o.urgencia === 'semana',
    ).length,
    estacionales: estacional.length,
    trending   : trending.length,
  }), [trending, estacional])

  const fetchActualidad = useCallback(async (force = false) => {
    if (!clienteId) return
    if (force) setActGenerating(true); else setActLoading(true)
    setActError(null)
    try {
      if (!force) {
        const r = await fetch(`/api/strategy/actualidad/${clienteId}`)
        if (r.ok) {
          const d = await r.json() as { trending: OportunidadItem[]; estacional: OportunidadItem[] }
          if (d.trending.length > 0 || d.estacional.length > 0) {
            setTrending(d.trending); setEstacional(d.estacional)
            return
          }
        }
      }
      const r = await fetch('/api/strategy/actualidad', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clienteId, force }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Error')
      const d = await r.json() as { trending: OportunidadItem[]; estacional: OportunidadItem[] }
      setTrending(d.trending); setEstacional(d.estacional)
    } catch (e) {
      setActError(e instanceof Error ? e.message : 'Error cargando oportunidades')
    } finally {
      setActLoading(false); setActGenerating(false)
    }
  }, [clienteId])

  useEffect(() => {
    if (clienteId && actFetchedFor.current !== clienteId) {
      actFetchedFor.current = clienteId
      setTrending([]); setEstacional([])
      fetchActualidad()
    }
  }, [clienteId, fetchActualidad])

  // ── Planificar desde actualidad ───────────────────────────
  const [planificandoId,  setPlanificandoId]  = useState<string | null>(null)
  const [planFecha,       setPlanFecha]       = useState('')
  const [guardandoPlan,   setGuardandoPlan]   = useState(false)
  const [planificadas,    setPlanificadas]    = useState<Record<string, { fecha: string }>>({})
  const [toastMsg,        setToastMsg]        = useState<string | null>(null)

  function abrirPlan(op: OportunidadItem) {
    if (planificandoId === op.id) { setPlanificandoId(null); return }
    setPlanificandoId(op.id)
    setPlanFecha(op.fecha_evento ? op.fecha_evento.slice(0, 10) : tomorrow())
  }

  async function confirmarPlan(op: OportunidadItem) {
    if (!planFecha || !clienteId) return
    setGuardandoPlan(true)
    try {
      const res = await fetch('/api/strategy/calendario', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          client_id        : clienteId,
          titulo           : op.titulo,
          keyword          : op.keyword,
          tipo_articulo    : 'nuevo',
          funnel_stage     : 'tofu',
          cluster          : op.tipo,          // 'trending' | 'estacional'
          fecha_publicacion: planFecha,
          fuente           : 'actualidad',
          oportunidad_id   : op.id,
          notas            : null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error')
      setPlanificadas((prev) => ({ ...prev, [op.id]: { fecha: planFecha } }))
      setPlanificandoId(null)
      const fechaLabel = new Date(planFecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
      setToastMsg(`✓ Añadido al calendario para el ${fechaLabel}`)
      fetchUpcoming()
      setTimeout(() => setToastMsg(null), 4000)
    } catch (e) {
      setActError(e instanceof Error ? e.message : 'Error planificando')
    } finally {
      setGuardandoPlan(false)
    }
  }

  // ── Upcoming calendar ─────────────────────────────────────
  const [upcoming,        setUpcoming]        = useState<UpcomingItem[]>([])
  const [upcomingLoading, setUpcomingLoading] = useState(false)
  const upcomingFetchedFor = useRef<string>('')

  const fetchUpcoming = useCallback(async () => {
    if (!clienteId) return
    setUpcomingLoading(true)
    try {
      const r = await fetch(`/api/strategy/calendario/upcoming?clientId=${clienteId}&days=7`)
      if (r.ok) setUpcoming((await r.json()).items ?? [])
    } finally {
      setUpcomingLoading(false)
    }
  }, [clienteId])

  useEffect(() => {
    if (clienteId && upcomingFetchedFor.current !== clienteId) {
      upcomingFetchedFor.current = clienteId
      setUpcoming([])
      fetchUpcoming()
    }
  }, [clienteId, fetchUpcoming])

  // ── Crear contenido desde actualidad ─────────────────────
  const router = useRouter()
  const [creandoContenido, setCreandoContenido] = useState<string | null>(null)

  // ── Gestión de sesiones (archivar / eliminar) ─────────────
  const [archivandoId, setArchivandoId] = useState<string | null>(null)

  async function handleArchiveSesion(s: SesionResumen, toArchive: boolean) {
    setArchivandoId(s.id)
    try {
      const res = await fetch(`/api/strategy/sessions/${s.id}`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ archived: toArchive }),
      })
      if (!res.ok) return
      if (toArchive) {
        setLocalSesiones((prev) => prev.filter((x) => x.id !== s.id))
        setLocalArchivadas((prev) => [{ ...s, archived: true }, ...prev])
      } else {
        setLocalArchivadas((prev) => prev.filter((x) => x.id !== s.id))
        setLocalSesiones((prev) => [{ ...s, archived: false }, ...prev])
      }
    } finally {
      setArchivandoId(null)
    }
  }

  async function handleDeleteSesion(id: string) {
    try {
      await fetch(`/api/strategy/sessions/${id}`, { method: 'DELETE' })
      setLocalArchivadas((prev) => prev.filter((x) => x.id !== id))
      setLocalSesiones((prev) => prev.filter((x) => x.id !== id))
    } catch { /* noop */ }
  }
  async function handleCrearContenido(op: OportunidadItem) {
    setCreandoContenido(op.id)
    try {
      const res = await fetch('/api/strategy/actualidad/crear-contenido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clienteId, titulo: op.titulo, keyword: op.keyword,
          contexto: op.contexto ?? op.descripcion, urgencia: op.urgencia,
        }),
      })
      if (res.ok) {
        const d = await res.json() as { contenido_id: string }
        router.push(`/contenidos/${d.contenido_id}`)
      }
    } finally { setCreandoContenido(null) }
  }

  // ── Todas las oportunidades combinadas, ordenadas por urgencia ──
  const URGENCIA_ORDER: Record<string, number> = { '24h': 0, semana: 1, mes: 2 }
  const todasOps = useMemo(
    () => [...estacional, ...trending].sort(
      (a, b) => (URGENCIA_ORDER[a.urgencia ?? 'mes'] ?? 2) - (URGENCIA_ORDER[b.urgencia ?? 'mes'] ?? 2),
    ),
    [estacional, trending],
  )
  const opsVisibles = actExpanded ? todasOps : todasOps.slice(0, 3)

  // ── Datos evergreen del cliente ───────────────────────────
  const keywordsCliente = useMemo(
    () => sesionesCliente.reduce((s, r) => s + r.total_keywords, 0),
    [sesionesCliente],
  )
  const mapasCount   = clienteId ? (mapasPorCliente[clienteId] ?? 0) : totalMapas
  const bancoCount   = clienteId ? (bancoPorCliente[clienteId] ?? 0) : 0
  const clustersCount = ultimaSesion?.num_clusters ?? 0
  const mapasHref    = clienteId && mapasCount > 0
    ? mapasCount === 1 && mapaSessionPorCliente[clienteId]
      ? `/strategy/${mapaSessionPorCliente[clienteId]}/mapa`
      : `/strategy/mapas?cliente=${clienteId}`
    : undefined

  // Href del módulo Mapa: usa la sesión con mapa si existe, sino la última sesión con keywords
  const mapaModuleHref = clienteId && mapaSessionPorCliente[clienteId]
    ? `/strategy/${mapaSessionPorCliente[clienteId]}/mapa`
    : ultimaSesion
      ? `/strategy/${ultimaSesion.id}/mapa`
      : undefined

  // ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-gray-900 text-white text-sm rounded-xl px-4 py-3 shadow-xl animate-in slide-in-from-bottom-4">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          {toastMsg}
          <button type="button" onClick={() => setToastMsg(null)} className="ml-2 text-gray-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estrategia de Contenidos</h1>
          <p className="text-sm text-gray-500 mt-1">Investigación de keywords, clustering y planificación editorial basada en datos.</p>
        </div>
        <Button asChild className="gap-2 shrink-0 bg-indigo-600 hover:bg-indigo-700">
          <Link href={clienteId ? `/strategy/nueva?cliente=${clienteId}` : '/strategy/nueva'}>
            <Plus className="h-4 w-4" /> Nueva Estrategia
          </Link>
        </Button>
      </div>

      {/* ── SELECTOR CLIENTE ───────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Users className="h-4 w-4 text-gray-400 shrink-0" />
            <select
              value={clienteId}
              onChange={(e) => handleClienteChange(e.target.value)}
              className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todos los clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}{c.sector ? ` · ${c.sector}` : ''}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ── STICKY BANNER ─────────────────────────────────── */}
      {clienteSeleccionado && (
        <div className="sticky top-0 z-10 -mx-6 px-6 py-2.5 bg-indigo-50 border-b border-indigo-100">
          <p className="text-sm text-indigo-700">
            <span className="text-indigo-400 text-xs uppercase tracking-wide mr-2">Trabajando con:</span>
            <span className="font-semibold">{clienteSeleccionado.nombre}</span>
            {clienteSeleccionado.sector && <span className="text-indigo-400 ml-1">· {clienteSeleccionado.sector}</span>}
          </p>
        </div>
      )}

      {/* ── BANNER INSPIRACION ─────────────────────────────── */}
      {clienteId && (
        <Link href={`/inspiracion?cliente=${clienteId}`}
          className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-4 py-2.5 transition-colors">
          <Lightbulb className="h-3.5 w-3.5 shrink-0" />
          ¿Quieres inspiración antes de empezar?
          <span className="font-semibold ml-auto flex items-center gap-1">
            Ver análisis de inspiración <ChevronRight className="h-3 w-3" />
          </span>
        </Link>
      )}

      {/* ── DOS COLUMNAS STATS (solo si hay cliente) ───────── */}
      {clienteId && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Evergreen */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-indigo-500" /> Estrategia Evergreen
            </p>
            <div className="space-y-2">
              <StatRow icon={TrendingUp} iconCls="text-emerald-600 bg-emerald-50"
                label="Keywords analizadas" value={keywordsCliente.toLocaleString('es-ES')} />
              <StatRow icon={Layers} iconCls="text-violet-600 bg-violet-50"
                label="Clusters" value={clustersCount} />
              <StatRow icon={BookOpen} iconCls="text-indigo-600 bg-indigo-50"
                label="En banco" value={bancoCount} />
            </div>
            <div className="flex gap-2 pt-1">
              {bancoCount > 0 && (
                <Link href={`/strategy/almacen?cliente=${clienteId}`}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5">
                  Ver banco <ChevronRight className="h-3 w-3" />
                </Link>
              )}
              {mapasHref && (
                <Link href={mapasHref}
                  className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 flex items-center gap-0.5 ml-3">
                  Ver mapa <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>

          {/* Actualidad */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Actualidad
            </p>
            {(actLoading || actGenerating) ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {actGenerating ? 'Analizando tendencias…' : 'Cargando…'}
              </div>
            ) : (
              <div className="space-y-2">
                <StatRow icon={Zap} iconCls="text-red-600 bg-red-50"
                  label="Urgentes (24h / semana)" value={actualidadStats.urgentes} />
                <StatRow icon={Calendar} iconCls="text-blue-600 bg-blue-50"
                  label="Estacionales" value={actualidadStats.estacionales} />
                <StatRow icon={TrendingUp} iconCls="text-amber-600 bg-amber-50"
                  label="Trending" value={actualidadStats.trending} />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setActExpanded(true)}
                className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-0.5">
                Ver todas <ChevronRight className="h-3 w-3" />
              </button>
              <button type="button" onClick={() => fetchActualidad(true)} disabled={actGenerating}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 flex items-center gap-0.5 ml-3">
                {actGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Actualizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STATS GLOBALES (cuando no hay cliente) ─────────── */}
      {!clienteId && (
        <div className="grid grid-cols-3 gap-4">
          {([
            { label: 'Sesiones de research', value: totalSesiones,                  icon: BarChart3,   color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Keywords analizadas',  value: totalKeywords.toLocaleString('es-ES'), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Mapas de contenido',   value: totalMapas,                      icon: Map,         color: 'text-violet-600', bg: 'bg-violet-50' },
          ] as const).map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── MÓDULOS DEL WORKFLOW ───────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700">Flujo de trabajo estratégico</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <ModuleCard
            icon={Search} title="Briefing y Research" color="bg-indigo-100 text-indigo-600"
            description="Define tópicos semilla, lanza la investigación de keywords con DataForSEO y analiza el mercado."
            locked={false}
            href={ultimaSesion
              ? `/strategy/${ultimaSesion.id}/keywords`
              : clienteId ? `/strategy/nueva?cliente=${clienteId}` : '/strategy/nueva'}
            subtitle={ultimaSesion ? `Última: ${formatearFecha(ultimaSesion.created_at)}` : 'Sin sesiones'}
          />
          <ModuleCard
            icon={Layers} title="Clustering y Priorización" color="bg-violet-100 text-violet-600"
            description="Agrupa keywords por intención y temática. Asigna prioridad editorial basada en volumen y dificultad."
            locked={!ultimaSesion}
            href={ultimaSesion ? `/strategy/${ultimaSesion.id}/clustering` : undefined}
            subtitle={clustersCount > 0 ? `${clustersCount} clusters` : 'Pendiente'}
          />
          <ModuleCard
            icon={Map} title="Mapa de Contenidos" color="bg-emerald-100 text-emerald-600"
            description="Genera el plan editorial mensual: artículos, keywords objetivo, clúster y etapa del funnel."
            locked={false}
            href={clienteId ? `/mapa?cliente=${clienteId}` : '/mapa'}
            subtitle={bancoCount > 0 ? `${bancoCount} artículos` : 'Pendiente'}
          />
          <ModuleCard
            icon={RefreshCw} title="Mantenimiento y Auditoría" color="bg-amber-100 text-amber-600"
            description="Monitoriza posiciones, detecta canibalización y actualiza el mapa con nuevas oportunidades."
            locked={true} subtitle="Próximamente"
          />
        </CardContent>
      </Card>

      {/* ── OPORTUNIDADES DE ACTUALIDAD ────────────────────── */}
      {clienteId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" /> Oportunidades de Actualidad
                {todasOps.length > 0 && (
                  <span className="text-[11px] font-normal text-gray-400">({todasOps.length})</span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {todasOps.length > 3 && (
                  <button type="button" onClick={() => setActExpanded((v) => !v)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    {actExpanded ? 'Ver menos' : `Ver todas (${todasOps.length})`}
                  </button>
                )}
                <Button size="sm" variant="outline" className="text-xs gap-1.5 h-7"
                  onClick={() => fetchActualidad(true)} disabled={actGenerating}>
                  {actGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Actualizar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {(actLoading || actGenerating) && (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{actGenerating ? 'Analizando tendencias del sector…' : 'Cargando…'}</span>
              </div>
            )}
            {actError && !actLoading && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" /> {actError}
              </div>
            )}
            {!actLoading && !actGenerating && !actError && todasOps.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                Pulsa &quot;Actualizar&quot; para detectar oportunidades de actualidad.
              </p>
            )}
            {!actLoading && !actGenerating && opsVisibles.length > 0 && (
              <div className="space-y-2">
                {opsVisibles.map((op) => {
                  const isEstacional   = op.tipo === 'estacional'
                  const urg            = URGENCIA_BADGE[op.urgencia ?? 'mes'] ?? URGENCIA_BADGE.mes
                  const rel            = RELEVANCIA_BADGE[op.relevancia ?? 'media'] ?? RELEVANCIA_BADGE.media
                  const yaPlanificada  = op.id in planificadas
                  const isPlanificando = planificandoId === op.id
                  return (
                    <div key={op.id}
                      className={cn(
                        'rounded-lg bg-white p-3.5',
                        'border-t border-r border-b border-gray-200',
                        yaPlanificada
                          ? 'border-l-4 border-l-emerald-400'
                          : (op.urgencia === '24h' || op.urgencia === 'semana')
                            ? 'border-l-4 border-l-red-400'
                            : op.urgencia === 'mes'
                              ? 'border-l-4 border-l-amber-400'
                              : 'border-l-4 border-l-gray-300',
                      )}>
                      {/* Título + badge urgencia */}
                      <div className="flex items-start gap-2 mb-1.5">
                        <span className="text-sm shrink-0 mt-0.5">{isEstacional ? '📅' : '🔥'}</span>
                        <p className="text-sm font-semibold text-gray-900 flex-1 leading-snug">{op.titulo}</p>
                        {yaPlanificada ? (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 flex items-center gap-0.5 shrink-0">
                            <CheckCircle2 className="h-3 w-3" />
                            {new Date(planificadas[op.id].fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                          </span>
                        ) : (
                          <Badge className={`text-[10px] shrink-0 ${isEstacional ? urg.cls : rel.cls}`}>
                            {isEstacional ? urg.label : rel.label}
                          </Badge>
                        )}
                      </div>
                      {/* Keyword + descripción */}
                      <div className="ml-6 space-y-0.5 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {op.keyword && (
                            <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">{op.keyword}</span>
                          )}
                          {op.fecha_evento && (
                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                              <Calendar className="h-2.5 w-2.5" />
                              {new Date(op.fecha_evento).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                        {(op.descripcion || op.contexto) && (
                          <p className="text-xs text-gray-500 line-clamp-1">{op.descripcion ?? op.contexto}</p>
                        )}
                      </div>
                      {/* Botones de acción */}
                      <div className="ml-6 flex items-center gap-2">
                        {!yaPlanificada && (
                          <button type="button" onClick={() => abrirPlan(op)}
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors ${
                              isPlanificando
                                ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                                : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                            }`}>
                            <Calendar className="h-3 w-3" /> Añadir al calendario
                          </button>
                        )}
                        <button type="button" onClick={() => handleCrearContenido(op)}
                          disabled={creandoContenido === op.id}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg px-2.5 py-1.5 transition-colors">
                          {creandoContenido === op.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Pencil className="h-3 w-3" />}
                          Crear contenido
                        </button>
                      </div>

                      {/* Mini-form planificar */}
                      {isPlanificando && !yaPlanificada && (
                        <div className="mt-3 border-t border-indigo-100 pt-3 space-y-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-gray-500 mb-1">Fecha de publicación</label>
                            <input
                              type="date"
                              value={planFecha}
                              onChange={(e) => setPlanFecha(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => setPlanificandoId(null)}
                              className="text-[10px] font-semibold text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
                              Cancelar
                            </button>
                            <button type="button" onClick={() => confirmarPlan(op)} disabled={!planFecha || guardandoPlan}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors">
                              {guardandoPlan ? <Loader2 className="h-3 w-3 animate-spin" /> : <Calendar className="h-3 w-3" />}
                              Añadir al calendario
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── PRÓXIMAS PUBLICACIONES ─────────────────────────── */}
      {clienteId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-500" /> Próximas publicaciones
                <span className="text-[11px] font-normal text-gray-400">(7 días)</span>
              </CardTitle>
              <button type="button" onClick={fetchUpcoming} disabled={upcomingLoading}
                className="text-xs text-gray-400 hover:text-gray-600">
                {upcomingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {upcomingLoading && (
              <div className="flex items-center gap-2 text-gray-400 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Cargando…</span>
              </div>
            )}
            {!upcomingLoading && upcoming.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400">No hay artículos programados esta semana.</p>
                <p className="text-xs text-gray-400 mt-0.5">Añade fechas desde el banco de contenidos.</p>
                <div className="flex justify-center gap-3 mt-3">
                  <Link href={`/strategy/calendario?cliente=${clienteId}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                    Ver calendario →
                  </Link>
                  <Link href={`/strategy/almacen?cliente=${clienteId}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                    Ir al banco de contenidos →
                  </Link>
                </div>
              </div>
            )}
            {!upcomingLoading && upcoming.length > 0 && (
              <div className="divide-y divide-gray-50">
                {upcoming.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="w-[72px] shrink-0">
                      <p className="text-xs font-semibold text-gray-700">{formatFechaBonita(item.fecha_publicacion)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-900 truncate">{item.titulo}</p>
                      {item.keyword && (
                        <p className="text-[10px] text-gray-400 truncate">{item.keyword}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {FUENTE_ICON[item.fuente ?? 'manual'] ?? FUENTE_ICON.manual}
                      <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ${
                        item.status === 'publicado'   ? 'bg-emerald-100 text-emerald-700' :
                        item.status === 'en_redaccion' ? 'bg-violet-100 text-violet-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>{item.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── HISTORIAL ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              {clienteId ? `Sesiones de ${clienteSeleccionado?.nombre ?? 'cliente'}` : 'Últimas sesiones'}
              {verArchivadas && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                  <Archive className="h-2.5 w-2.5" /> Archivadas
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {historialFiltrado.length > 3 && (
                <button type="button" onClick={() => setHistorialExpanded((v) => !v)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  {historialExpanded ? 'Ver menos' : `Ver todas (${historialFiltrado.length})`}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setVerArchivadas((v) => !v); setHistorialExpanded(false) }}
                className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                  verArchivadas
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                {verArchivadas ? 'Ver activas' : 'Ver archivadas'}
                {!verArchivadas && localArchivadas.length > 0 && (
                  <span className="ml-1 text-[10px] font-bold bg-gray-200 text-gray-600 rounded-full px-1.5">
                    {localArchivadas.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {historialVisible.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {verArchivadas ? (
                <p className="text-sm font-medium text-gray-500">No hay sesiones archivadas</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-500">Sin sesiones con datos todavía</p>
                  <p className="text-xs mt-1">
                    Crea tu primera estrategia con el botón{' '}
                    <span className="font-semibold text-indigo-600">Nueva Estrategia</span>
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {historialVisible.map((s) => (
                <div key={s.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.nombre || '—'}</p>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="text-xs text-gray-400">{s.client_nombre} · {formatearFecha(s.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3 text-right shrink-0">
                    <div className="hidden sm:block">
                      <p className="text-sm font-semibold text-gray-700">{s.total_keywords.toLocaleString('es-ES')}</p>
                      <p className="text-[10px] text-gray-400">keywords</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-sm font-semibold text-gray-700">{s.num_clusters}</p>
                      <p className="text-[10px] text-gray-400">clusters</p>
                    </div>
                    {!verArchivadas && (
                      <Link href={`/strategy/${s.id}/keywords`}
                        className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">
                        Ver →
                      </Link>
                    )}
                    <ArchiveMenu
                      archived={!!s.archived}
                      loading={archivandoId === s.id}
                      onArchive={() => handleArchiveSesion(s, !s.archived)}
                      onDelete={() => handleDeleteSesion(s.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────

function StatRow({ icon: Icon, iconCls, label, value }: {
  icon   : React.ElementType
  iconCls: string
  label  : string
  value  : number | string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`rounded-md p-1.5 ${iconCls}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="text-xs text-gray-500 flex-1">{label}</span>
      <span className="text-sm font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString('es-ES') : value}</span>
    </div>
  )
}

function ModuleCard({
  icon: Icon, title, description, locked, href, color, subtitle,
}: {
  icon       : React.ElementType
  title      : string
  description: string
  locked     : boolean
  href?      : string
  color      : string
  subtitle?  : string
}) {
  const inner = (
    <Card className={`relative transition-all duration-200 ${
      locked ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-xl p-2 ${color}`}><Icon className="h-4 w-4" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              {locked && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-400">
                  <Lock className="h-3 w-3" /> Próximamente
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
            {subtitle && <p className="text-[10px] text-gray-400 mt-1">{subtitle}</p>}
          </div>
          {!locked && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />}
        </div>
      </CardContent>
    </Card>
  )
  return !locked && href ? <Link href={href}>{inner}</Link> : inner
}
