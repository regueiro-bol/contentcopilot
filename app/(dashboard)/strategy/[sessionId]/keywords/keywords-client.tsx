'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import {
  Search,
  ChevronLeft,
  Save,
  TrendingUp,
  Layers,
  AlertCircle,
  Check,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { dificultadLabel, volumenLabel, intentLabel } from '@/lib/dataforseo'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

export interface KeywordRow {
  id                : string
  keyword           : string
  volume            : number | null
  keyword_difficulty: number | null
  cpc               : number | null
  competition       : number | null
  competition_level : string | null
  search_intent     : string | null
  incluida          : boolean
  cluster_name      : string | null
  funnel_stage      : string | null
  gsc_clicks        : number | null
  gsc_impressions   : number | null
  gsc_position      : number | null
  gsc_opportunity   : 'quick_win' | 'existing' | 'new' | null
}

export interface SessionResumen {
  id            : string
  nombre        : string
  client_nombre : string
  status        : string
  created_at    : string
  total_keywords: number
  seed_topics   : string[]
}

interface Props {
  session : SessionResumen
  keywords: KeywordRow[]
}

// ─────────────────────────────────────────────────────────────
// Helpers de UI
// ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft       : { label: 'Borrador',     cls: 'bg-gray-100 text-gray-600' },
  researching : { label: 'Investigando', cls: 'bg-blue-100 text-blue-700' },
  clustering  : { label: 'Agrupando',    cls: 'bg-yellow-100 text-yellow-700' },
  completed   : { label: 'Completada',   cls: 'bg-green-100 text-green-700' },
  error       : { label: 'Error',        cls: 'bg-red-100 text-red-700' },
}

const INTENT_FILTERS = [
  { value: '',               label: 'Todas' },
  { value: 'informational',  label: 'Informacional' },
  { value: 'transactional',  label: 'Transaccional' },
  { value: 'commercial',     label: 'Comercial' },
  { value: 'navigational',   label: 'Navegacional' },
]

const DIFICULTAD_RANGES: { label: string; test: (kd: number | null) => boolean }[] = [
  { label: 'Todas',      test: ()      => true },
  { label: 'Muy fácil',  test: (kd)   => kd != null && kd < 20 },
  { label: 'Fácil',      test: (kd)   => kd != null && kd >= 20 && kd < 40 },
  { label: 'Media',      test: (kd)   => kd != null && kd >= 40 && kd < 60 },
  { label: 'Difícil',    test: (kd)   => kd != null && kd >= 60 && kd < 80 },
  { label: 'Muy difícil', test: (kd)  => kd != null && kd >= 80 },
]

function DificultadBadge({ kd }: { kd: number | null }) {
  if (kd == null) return <span className="text-gray-300">—</span>
  const cls =
    kd < 20 ? 'bg-green-100 text-green-700' :
    kd < 40 ? 'bg-emerald-100 text-emerald-700' :
    kd < 60 ? 'bg-yellow-100 text-yellow-700' :
    kd < 80 ? 'bg-orange-100 text-orange-700' :
              'bg-red-100 text-red-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {kd} · {dificultadLabel(kd)}
    </span>
  )
}

function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return <span className="text-gray-300">—</span>
  const cls: Record<string, string> = {
    informational : 'bg-blue-50 text-blue-700',
    transactional : 'bg-purple-50 text-purple-700',
    commercial    : 'bg-amber-50 text-amber-700',
    navigational  : 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls[intent] ?? 'bg-gray-100 text-gray-500'}`}>
      {intentLabel(intent as Parameters<typeof intentLabel>[0])}
    </span>
  )
}

const GSC_OPP_STYLES: Record<string, { label: string; cls: string }> = {
  existing : { label: 'Existente', cls: 'bg-green-100 text-green-700'  },
  quick_win: { label: 'Quick win', cls: 'bg-amber-100 text-amber-700'  },
  new      : { label: 'Nueva',     cls: 'bg-blue-100 text-blue-700'   },
}

const GSC_FILTERS = [
  { value: '',          label: 'Todas' },
  { value: 'quick_win', label: 'Quick wins' },
  { value: 'existing',  label: 'Existentes' },
  { value: 'new',       label: 'Nuevas' },
]

function GSCBadge({ opportunity }: { opportunity: string | null }) {
  if (!opportunity) return <span className="text-gray-300">—</span>
  const style = GSC_OPP_STYLES[opportunity]
  if (!style) return <span className="text-gray-300">—</span>
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.cls}`}>
      {style.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export default function KeywordsClient({ session, keywords: initialKeywords }: Props) {
  // ── Estado de selección (local, persiste en guardado) ──────
  const [incluidaMap, setIncluidaMap] = useState<Map<string, boolean>>(
    () => new Map(initialKeywords.map((k) => [k.id, k.incluida])),
  )
  const [hayPendientes, setHayPendientes] = useState(false)
  const [guardando, setGuardando]         = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [okGuardado, setOkGuardado]       = useState(false)
  const [, startTransition]               = useTransition()

  // ── Estado de filtros ──────────────────────────────────────
  const [busqueda,          setBusqueda]          = useState('')
  const [filtroIntent,      setFiltroIntent]      = useState('')
  const [filtroDificultad,  setFiltroDificultad]  = useState('Todas')
  const [filtroGSC,         setFiltroGSC]         = useState('')

  // ── Keywords filtradas ─────────────────────────────────────
  const keywordsFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    const difRange = DIFICULTAD_RANGES.find((d) => d.label === filtroDificultad) ?? DIFICULTAD_RANGES[0]
    return initialKeywords.filter((k) => {
      if (q && !k.keyword.toLowerCase().includes(q)) return false
      if (filtroIntent && k.search_intent !== filtroIntent) return false
      if (filtroDificultad !== 'Todas' && !difRange.test(k.keyword_difficulty)) return false
      if (filtroGSC && k.gsc_opportunity !== filtroGSC) return false
      return true
    })
  }, [initialKeywords, busqueda, filtroIntent, filtroDificultad, filtroGSC])

  // ── Contadores ─────────────────────────────────────────────
  const totalIncluidas = useMemo(
    () => Array.from(incluidaMap.values()).filter(Boolean).length,
    [incluidaMap],
  )

  // ── Toggle checkbox ────────────────────────────────────────
  function handleToggle(id: string) {
    startTransition(() => {
      setIncluidaMap((prev) => {
        const next = new Map(prev)
        next.set(id, !prev.get(id))
        return next
      })
      setHayPendientes(true)
      setOkGuardado(false)
    })
  }

  // ── Toggle all visible ─────────────────────────────────────
  function handleToggleAll(incluir: boolean) {
    setIncluidaMap((prev) => {
      const next = new Map(prev)
      keywordsFiltradas.forEach((k) => next.set(k.id, incluir))
      return next
    })
    setHayPendientes(true)
    setOkGuardado(false)
  }

  // ── Guardar selección ──────────────────────────────────────
  async function handleGuardar() {
    setGuardando(true)
    setErrorGuardado(null)

    try {
      // Enviamos solo los cambios respecto al estado inicial
      const cambios: { id: string; incluida: boolean }[] = []
      for (const k of initialKeywords) {
        const nuevaIncluida = incluidaMap.get(k.id) ?? k.incluida
        if (nuevaIncluida !== k.incluida) {
          cambios.push({ id: k.id, incluida: nuevaIncluida })
        }
      }

      if (cambios.length === 0) {
        setHayPendientes(false)
        setGuardando(false)
        return
      }

      // Batch PATCH
      const res = await fetch(`/api/strategy/keywords/batch`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ cambios }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error guardando cambios')
      }

      setHayPendientes(false)
      setOkGuardado(true)
      setTimeout(() => setOkGuardado(false), 3000)
    } catch (e) {
      setErrorGuardado(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setGuardando(false)
    }
  }

  // ── Reset filtros ──────────────────────────────────────────
  function resetFiltros() {
    setBusqueda('')
    setFiltroIntent('')
    setFiltroDificultad('Todas')
    setFiltroGSC('')
  }

  const hayGSCData = initialKeywords.some((k) => k.gsc_opportunity != null)
  const hayFiltros = busqueda !== '' || filtroIntent !== '' || filtroDificultad !== 'Todas' || filtroGSC !== ''

  const { label: statusLabel, cls: statusCls } =
    STATUS_MAP[session.status] ?? { label: session.status, cls: 'bg-gray-100 text-gray-500' }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-xl font-bold text-gray-900 truncate">{session.nombre}</h1>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusCls}`}>
              {statusLabel}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {session.client_nombre} · {session.total_keywords.toLocaleString('es-ES')} keywords
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" asChild size="sm">
            <Link href="/strategy">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Estrategia
            </Link>
          </Button>
          <Button size="sm" asChild className="gap-2">
            <Link href={`/strategy/${session.id}/clustering`}>
              <Layers className="h-4 w-4" />
              Clustering →
            </Link>
          </Button>
        </div>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total keywords',   value: initialKeywords.length.toLocaleString('es-ES'), color: 'text-gray-700' },
          { label: 'Incluidas',        value: totalIncluidas.toLocaleString('es-ES'),          color: 'text-green-700' },
          { label: 'Con volumen',      value: initialKeywords.filter((k) => k.volume != null).length.toLocaleString('es-ES'), color: 'text-indigo-700' },
          { label: 'Con intención',    value: initialKeywords.filter((k) => k.search_intent != null).length.toLocaleString('es-ES'), color: 'text-violet-700' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-3">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar keyword..."
              className="pl-9"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          {/* Filtro intención */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Intención de búsqueda</p>
            <div className="flex flex-wrap gap-1.5">
              {INTENT_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFiltroIntent(value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                    filtroIntent === value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtro dificultad */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dificultad</p>
            <div className="flex flex-wrap gap-1.5">
              {DIFICULTAD_RANGES.map(({ label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setFiltroDificultad(label)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                    filtroDificultad === label
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtro GSC — solo visible si hay datos GSC */}
          {hayGSCData && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Oportunidad GSC</p>
              <div className="flex flex-wrap gap-1.5">
                {GSC_FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFiltroGSC(value)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                      filtroGSC === value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resultado de filtro + reset */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {hayFiltros
                ? `${keywordsFiltradas.length} de ${initialKeywords.length} keywords`
                : `${initialKeywords.length} keywords en total`}
            </p>
            {hayFiltros && (
              <button
                type="button"
                onClick={resetFiltros}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              >
                <RotateCcw className="h-3 w-3" />
                Limpiar filtros
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabla de keywords */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-10 px-3 py-2.5 text-left">
                  <div className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      checked={keywordsFiltradas.length > 0 && keywordsFiltradas.every((k) => incluidaMap.get(k.id) ?? k.incluida)}
                      onChange={(e) => handleToggleAll(e.target.checked)}
                      title={keywordsFiltradas.every((k) => incluidaMap.get(k.id) ?? k.incluida) ? 'Desmarcar visibles' : 'Seleccionar visibles'}
                    />
                  </div>
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Keyword</th>
                <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">Volumen</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Dificultad</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Intención</th>
                {hayGSCData && (
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">GSC</th>
                )}
                <th className="px-3 py-2.5 text-right font-semibold text-gray-600">CPC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {keywordsFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={hayGSCData ? 7 : 6} className="px-3 py-12 text-center text-gray-400">
                    <Search className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No hay keywords que coincidan con los filtros</p>
                    {hayFiltros && (
                      <button type="button" onClick={resetFiltros} className="mt-2 text-xs text-indigo-600 hover:underline">
                        Limpiar filtros
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                keywordsFiltradas.map((kw) => {
                  const incluida = incluidaMap.get(kw.id) ?? kw.incluida
                  return (
                    <tr
                      key={kw.id}
                      className={cn(
                        'transition-colors hover:bg-gray-50',
                        !incluida && 'opacity-50',
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={incluida}
                          onChange={() => handleToggle(kw.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('font-medium', incluida ? 'text-gray-900' : 'text-gray-400 line-through')}>
                          {kw.keyword}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                        {kw.volume != null ? (
                          <span className="font-semibold text-gray-800">
                            {volumenLabel(kw.volume)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <DificultadBadge kd={kw.keyword_difficulty} />
                      </td>
                      <td className="px-3 py-2">
                        <IntentBadge intent={kw.search_intent} />
                      </td>
                      {hayGSCData && (
                        <td className="px-3 py-2">
                          <GSCBadge opportunity={kw.gsc_opportunity} />
                        </td>
                      )}
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">
                        {kw.cpc != null ? `€${kw.cpc.toFixed(2)}` : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Barra inferior flotante */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-600">
            <span className="font-bold text-gray-900">{totalIncluidas}</span> keyword{totalIncluidas !== 1 ? 's' : ''} seleccionada{totalIncluidas !== 1 ? 's' : ''}
          </p>
          {hayPendientes && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              Cambios sin guardar
            </span>
          )}
          {okGuardado && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
              <Check className="h-3 w-3" />
              Guardado
            </span>
          )}
          {errorGuardado && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {errorGuardado}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGuardar}
            disabled={!hayPendientes || guardando}
            className="gap-2"
          >
            {guardando ? (
              <TrendingUp className="h-4 w-4 animate-pulse" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {guardando ? 'Guardando...' : 'Guardar selección'}
          </Button>

          <Button size="sm" asChild className="gap-2">
            <Link href={`/strategy/${session.id}/clustering`}>
              <Layers className="h-4 w-4" />
              Continuar al clustering →
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
