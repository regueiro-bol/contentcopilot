'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Search,
  Map,
  RefreshCw,
  Plus,
  Lock,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Layers,
  Users,
  Lightbulb,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatearFecha } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface ClienteOption {
  id    : string
  nombre: string
  sector: string | null
}

interface SesionResumen {
  id            : string
  client_id     : string
  client_nombre : string
  nombre        : string
  status        : string
  created_at    : string
  total_keywords: number
  num_clusters  : number
}

interface Props {
  clientes              : ClienteOption[]
  sesiones              : SesionResumen[]
  totalSesiones         : number
  totalKeywords         : number
  totalMapas            : number
  mapasPorCliente       : Record<string, number>
  mapaSessionPorCliente : Record<string, string>
}

// ─────────────────────────────────────────────────────────────
// Helpers UI
// ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft       : { label: 'Borrador',      cls: 'bg-gray-100 text-gray-600' },
  researching : { label: 'Investigando',  cls: 'bg-blue-100 text-blue-700' },
  clustering  : { label: 'Agrupando',     cls: 'bg-yellow-100 text-yellow-700' },
  completed   : { label: 'Completada',    cls: 'bg-green-100 text-green-700' },
  error       : { label: 'Error',         cls: 'bg-red-100 text-red-700' },
}

function StatusBadge({ status }: { status: string }) {
  const { label, cls } = STATUS_MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

function ModuleCard({
  icon: Icon,
  title,
  description,
  locked,
  href,
  color,
  subtitle,
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
      locked
        ? 'opacity-60 cursor-not-allowed'
        : 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
    }`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`rounded-xl p-2.5 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              {locked && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-400">
                  <Lock className="h-3 w-3" />
                  Próximamente
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
            {subtitle && (
              <p className="text-[10px] text-gray-400 mt-1">{subtitle}</p>
            )}
          </div>
          {!locked && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />}
        </div>
      </CardContent>
    </Card>
  )

  if (!locked && href) {
    return <Link href={href}>{inner}</Link>
  }
  return inner
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

const LS_KEY = 'strategy_cliente_id'

export default function StrategyDashboardClient({
  clientes,
  sesiones,
  totalSesiones,
  totalKeywords,
  totalMapas,
  mapasPorCliente,
  mapaSessionPorCliente,
}: Props) {
  // Inicializar desde localStorage de forma síncrona para evitar flash
  const [clienteId, setClienteId] = useState(() => {
    if (typeof window === 'undefined') return ''
    const saved = localStorage.getItem(LS_KEY)
    if (saved && clientes.some((c) => c.id === saved)) return saved
    return ''
  })

  // Persistir selección
  function handleClienteChange(id: string) {
    setClienteId(id)
    if (id) {
      localStorage.setItem(LS_KEY, id)
    } else {
      localStorage.removeItem(LS_KEY)
    }
  }

  // Datos filtrados
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId) ?? null

  const sesionesCliente = useMemo(
    () => clienteId ? sesiones.filter((s) => s.client_id === clienteId) : sesiones,
    [sesiones, clienteId],
  )

  const ultimaSesion = sesionesCliente[0] ?? null

  const historial = sesionesCliente.slice(0, 5)

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estrategia de Contenidos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Investigación de keywords, clustering y planificación editorial basada en datos.
          </p>
        </div>
        <Button asChild className="gap-2 shrink-0">
          <Link href={clienteId ? `/strategy/nueva?cliente=${clienteId}` : '/strategy/nueva'}>
            <Plus className="h-4 w-4" />
            Nueva Estrategia
          </Link>
        </Button>
      </div>

      {/* ── Selector de cliente ────────────────────────────── */}
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
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.sector ? ` · ${c.sector}` : ''}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ── Header cliente activo (sticky) ─────────────────── */}
      {clienteSeleccionado && (
        <div className="sticky top-0 z-10 -mx-6 px-6 py-2.5 bg-indigo-50 border-b border-indigo-100">
          <p className="text-sm text-indigo-700">
            <span className="text-indigo-400 text-xs uppercase tracking-wide mr-2">Trabajando con:</span>
            <span className="font-semibold">{clienteSeleccionado.nombre}</span>
            {clienteSeleccionado.sector && (
              <span className="text-indigo-400 ml-1">· {clienteSeleccionado.sector}</span>
            )}
          </p>
        </div>
      )}

      {/* ── KPIs ───────────────────────────────────────────── */}
      {(() => {
        const mapasCount = clienteId ? (mapasPorCliente[clienteId] ?? 0) : totalMapas
        // Link directo: si hay 1 mapa del cliente → ir al mapa; si hay >1 → listado
        const mapasHref = clienteId && mapasCount > 0
          ? mapasCount === 1 && mapaSessionPorCliente[clienteId]
            ? `/strategy/${mapaSessionPorCliente[clienteId]}/mapa`
            : `/strategy/mapas?cliente=${clienteId}`
          : mapasCount > 0 ? '/strategy/mapas' : undefined

        const kpis = [
          {
            label: clienteId ? 'Sesiones del cliente' : 'Sesiones de research',
            value: clienteId ? sesionesCliente.length : totalSesiones,
            icon : BarChart3,
            color: 'text-indigo-600',
            bg   : 'bg-indigo-50',
            href : undefined as string | undefined,
          },
          {
            label: 'Keywords analizadas',
            value: clienteId
              ? sesionesCliente.reduce((sum, s) => sum + s.total_keywords, 0).toLocaleString('es-ES')
              : totalKeywords.toLocaleString('es-ES'),
            icon : TrendingUp,
            color: 'text-emerald-600',
            bg   : 'bg-emerald-50',
            href : undefined as string | undefined,
          },
          {
            label: 'Mapas de contenido',
            value: mapasCount,
            icon : Map,
            color: 'text-violet-600',
            bg   : 'bg-violet-50',
            href : mapasHref,
          },
        ]

        return (
          <div className="grid grid-cols-3 gap-4">
            {kpis.map(({ label, value, icon: Icon, color, bg, href }) => {
              const card = (
                <Card key={label} className={href ? 'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer' : ''}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${bg}`}>
                        <Icon className={`h-4 w-4 ${color}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-900">{value}</p>
                        <p className="text-xs text-gray-500">{label}</p>
                      </div>
                      {href && <ChevronRight className="h-4 w-4 text-gray-300 ml-auto" />}
                    </div>
                  </CardContent>
                </Card>
              )
              return href ? <Link key={label} href={href}>{card}</Link> : <div key={label}>{card}</div>
            })}
          </div>
        )
      })()}

      {/* ── Contexto cliente seleccionado ──────────────────── */}
      {clienteId && ultimaSesion && (
        <Card className="border-indigo-100 bg-indigo-50/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Última sesión</p>
                <p className="text-sm font-semibold text-gray-900">{ultimaSesion.nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatearFecha(ultimaSesion.created_at)} · {ultimaSesion.total_keywords.toLocaleString('es-ES')} keywords · {ultimaSesion.num_clusters} clusters
                </p>
              </div>
              <StatusBadge status={ultimaSesion.status} />
            </div>
          </CardContent>
        </Card>
      )}

      {clienteId && !ultimaSesion && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Search className="h-6 w-6 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              {clienteSeleccionado?.nombre} no tiene sesiones de investigación todavía
            </p>
            <Button asChild size="sm" className="mt-3 gap-2">
              <Link href={`/strategy/nueva?cliente=${clienteId}`}>
                <Plus className="h-3.5 w-3.5" />
                Crear primera estrategia
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Módulos del workflow ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700">
            Flujo de trabajo estratégico
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <ModuleCard
            icon={Lightbulb}
            title="Agente Inspiracion"
            description="Analiza tu contenido, competencia y tendencias del sector para detectar oportunidades antes del briefing."
            locked={!clienteId}
            href={clienteId ? `/strategy/nueva?cliente=${clienteId}&modo=inspiracion` : undefined}
            color="bg-amber-100 text-amber-600"
            subtitle="Fase 0 · Nuevo"
          />
          <ModuleCard
            icon={Search}
            title="Briefing y Research"
            description="Define los tópicos semilla, lanza la investigación de keywords con DataForSEO y analiza el mercado."
            locked={false}
            href={clienteId ? `/strategy/nueva?cliente=${clienteId}` : '/strategy/nueva'}
            color="bg-indigo-100 text-indigo-600"
          />
          <ModuleCard
            icon={Layers}
            title="Clustering y Priorización"
            description="Agrupa keywords por intención y temática. Asigna prioridad editorial basada en volumen y dificultad."
            locked={!ultimaSesion}
            href={ultimaSesion ? `/strategy/${ultimaSesion.id}/clustering` : undefined}
            color="bg-violet-100 text-violet-600"
            subtitle={ultimaSesion ? `${ultimaSesion.nombre} · ${ultimaSesion.client_nombre}` : undefined}
          />
          <ModuleCard
            icon={Map}
            title="Mapa de Contenidos"
            description="Genera el plan editorial mensual: artículos, keywords objetivo, clúster y etapa del funnel."
            locked={!ultimaSesion}
            href={ultimaSesion ? `/strategy/${ultimaSesion.id}/mapa` : undefined}
            color="bg-emerald-100 text-emerald-600"
            subtitle={ultimaSesion ? `${ultimaSesion.nombre} · ${ultimaSesion.client_nombre}` : undefined}
          />
          <ModuleCard
            icon={RefreshCw}
            title="Mantenimiento y Auditoría"
            description="Monitoriza posiciones, detecta canibalización y actualiza el mapa con nuevas oportunidades."
            locked={true}
            color="bg-amber-100 text-amber-600"
          />
        </CardContent>
      </Card>

      {/* ── Historial de sesiones ──────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">
              {clienteId ? `Sesiones de ${clienteSeleccionado?.nombre ?? 'cliente'}` : 'Últimas sesiones de investigación'}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {historial.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-gray-500">Sin sesiones todavía</p>
              <p className="text-xs mt-1">
                Crea tu primera estrategia con el botón{' '}
                <span className="font-semibold text-indigo-600">Nueva Estrategia</span>
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {historial.map((s) => (
                <div key={s.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.nombre || '—'}</p>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="text-xs text-gray-400">
                      {s.client_nombre} · {formatearFecha(s.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div className="hidden sm:block">
                      <p className="text-sm font-semibold text-gray-700">
                        {s.total_keywords.toLocaleString('es-ES')}
                      </p>
                      <p className="text-[10px] text-gray-400">keywords</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-sm font-semibold text-gray-700">{s.num_clusters}</p>
                      <p className="text-[10px] text-gray-400">clusters</p>
                    </div>
                    <Link
                      href={`/strategy/${s.id}/keywords`}
                      className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Ver →
                    </Link>
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
