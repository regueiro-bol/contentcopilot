'use client'

import { useState } from 'react'
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
  const [mostrarConfig, setMostrarConfig]   = useState(false)
  const [meses, setMeses]                   = useState<3 | 6 | 9 | 12>(6)
  const [artMes, setArtMes]                 = useState<4 | 6 | 8 | 10>(6)
  const [generando, setGenerando]           = useState(false)
  const [errorGen, setErrorGen]             = useState<string | null>(null)

  // ── Estado: crear pedidos desde mapa ───────────────────────
  // Tracks: map_item_id → contenido_id (cuando se crea exitosamente)
  const [pedidosCreados, setPedidosCreados] = useState<Record<string, string>>({})
  const [creandoPedido, setCreandoPedido]   = useState<string | null>(null)
  const [errorPedidoId, setErrorPedidoId]   = useState<string | null>(null) // qué item falló
  const [errorPedidoMsg, setErrorPedidoMsg] = useState<string | null>(null)

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

  // ── Estado: colapso de secciones de mes ───────────────────
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set<string>())

  // ── Agrupar por mes ────────────────────────────────────────
  const monthGroups: [string, MapItem[]][] = (() => {
    const groupMap: Record<string, MapItem[]> = {}
    for (const item of items) {
      const key = item.suggested_month ?? 'Sin mes'
      if (!groupMap[key]) groupMap[key] = []
      groupMap[key].push(item)
    }
    return Object.entries(groupMap).sort(([a], [b]) => a.localeCompare(b))
  })()

  // ── KPIs ───────────────────────────────────────────────────
  const totalTofu = items.filter((i: MapItem) => i.funnel_stage === 'tofu').length
  const totalMofu = items.filter((i: MapItem) => i.funnel_stage === 'mofu').length
  const totalBofu = items.filter((i: MapItem) => i.funnel_stage === 'bofu').length

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
          config    : { meses, articulos_por_mes: artMes },
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportarCSV(items)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMostrarConfig(!mostrarConfig)}
            className="gap-2 text-violet-700 border-violet-200 hover:bg-violet-50"
          >
            <Map className="h-4 w-4" />
            {map ? 'Nuevo mapa' : 'Generar mapa'}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total artículos',  value: items.length,  color: 'text-gray-700' },
            { label: 'TOFU',             value: totalTofu,     color: 'text-green-700' },
            { label: 'MOFU',             value: totalMofu,     color: 'text-amber-700' },
            { label: 'BOFU',             value: totalBofu,     color: 'text-red-700' },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-3">
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Panel generar mapa */}
      {mostrarConfig && (
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="p-5 space-y-4">
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
                <p className="text-xs font-semibold text-gray-600">Artículos por mes</p>
                <div className="flex gap-1.5">
                  {([4, 6, 8, 10] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setArtMes(n)}
                      className={cn(
                        'flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors',
                        artMes === n
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-violet-700 font-medium bg-violet-100 rounded-lg px-3 py-2">
              Plan: {meses} meses × {artMes} art/mes = hasta <strong>{meses * artMes} artículos</strong>
            </p>

            {generando && (
              <div className="flex items-center gap-2 text-sm text-violet-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando mapa con Claude... (30-60 segundos)
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
                ? <><Loader2 className="h-4 w-4 animate-spin" />Generando...</>
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
                              <PriorityBadge p={item.priority} />
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
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleCrearPedido(item)}
                                    disabled={!clientId || creandoPedido !== null}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Pedido
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
