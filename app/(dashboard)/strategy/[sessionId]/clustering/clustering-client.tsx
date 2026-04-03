'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Layers,
  Sparkles,
  Loader2,
  AlertCircle,
  Map,
  ChevronRight,
  TrendingUp,
  Check,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { volumenLabel } from '@/lib/dataforseo'
import type { ClusterGroup } from './page'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

interface SessionInfo {
  id            : string
  nombre        : string
  client_nombre : string
  status        : string
  total_keywords: number
  num_clusters  : number
}

interface Props {
  session           : SessionInfo
  clusters          : ClusterGroup[]
  totalIncluidas    : number
  unclassifiedCount : number
}

// ─────────────────────────────────────────────────────────────
// Helpers de UI
// ─────────────────────────────────────────────────────────────

const FUNNEL_COLORS = {
  tofu: { bg: 'bg-green-100',  text: 'text-green-700',  label: 'TOFU'  },
  mofu: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'MOFU'  },
  bofu: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'BOFU'  },
}

function FunnelBadge({ stage }: { stage: 'tofu' | 'mofu' | 'bofu' }) {
  const { bg, text, label } = FUNNEL_COLORS[stage]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${bg} ${text}`}>
      {label}
    </span>
  )
}

function FunnelBar({
  tofu, mofu, bofu, total,
}: { tofu: number; mofu: number; bofu: number; total: number }) {
  const pTofu = total ? Math.round((tofu / total) * 100) : 0
  const pMofu = total ? Math.round((mofu / total) * 100) : 0
  const pBofu = total ? Math.round((bofu / total) * 100) : 0
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="bg-green-400 transition-all" style={{ width: `${pTofu}%` }} />
      <div className="bg-amber-400 transition-all" style={{ width: `${pMofu}%` }} />
      <div className="bg-red-400 transition-all"   style={{ width: `${pBofu}%` }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export default function ClusteringClient({
  session,
  clusters,
  totalIncluidas,
  unclassifiedCount,
}: Props) {
  const router = useRouter()

  // ── Estado clustering ──────────────────────────────────────
  const [ejecutandoClustering, setEjecutandoClustering] = useState(false)
  const [progresoClustering, setProgresoClustering]     = useState('')
  const [errorClustering, setErrorClustering]           = useState<string | null>(null)
  const [clusteringOk, setClusteringOk]                 = useState(false)

  // ── Estado generar mapa ────────────────────────────────────
  const [mostrarConfigMapa, setMostrarConfigMapa]   = useState(false)
  const [meses, setMeses]                           = useState<3 | 6 | 9 | 12>(6)
  const [artMes, setArtMes]                         = useState<4 | 6 | 8 | 10>(6)
  const [generandoMapa, setGenerandoMapa]           = useState(false)
  const [errorMapa, setErrorMapa]                   = useState<string | null>(null)

  const hayCluster = clusters.length > 0

  // ── Acción: ejecutar clustering ────────────────────────────
  async function handleClustering() {
    setEjecutandoClustering(true)
    setErrorClustering(null)
    setProgresoClustering('Enviando keywords a Claude...')

    try {
      console.log('[Clustering] Enviando fetch a /api/strategy/clustering...')
      const res = await fetch('/api/strategy/clustering', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ session_id: session.id }),
      })

      console.log('[Clustering] Fetch completado, status:', res.status)

      // Parsear respuesta con try/catch propio para capturar errores de JSON
      let data: Record<string, unknown>
      try {
        const text = await res.text()
        console.log('[Clustering] Response text (primeros 500 chars):', text.substring(0, 500))
        data = JSON.parse(text) as Record<string, unknown>
      } catch (parseErr) {
        console.error('[Clustering] Error parseando JSON de la respuesta:', parseErr)
        throw new Error('La respuesta del servidor no es JSON válido. Puede haber expirado por timeout.')
      }

      if (!res.ok) {
        throw new Error((data.error as string) ?? `Error HTTP ${res.status}`)
      }

      const numClusters     = Array.isArray(data.clusters) ? data.clusters.length : 0
      const numClasificadas = (data.total_clasificadas as number) ?? 0

      console.log('[Clustering] Respuesta OK:', { numClasificadas, numClusters })

      setProgresoClustering(`✓ ${numClasificadas} keywords clasificadas en ${numClusters} clusters`)
      setClusteringOk(true)
      setEjecutandoClustering(false)

      // Recarga completa para que el Server Component re-ejecute la query a Supabase.
      // router.refresh() no basta — puede servir RSC payload cacheado en cliente.
      console.log('[Clustering] Recargando página...')
      window.location.reload()
      return
    } catch (e) {
      console.error('[Clustering] Error en handleClustering:', e)
      setErrorClustering(e instanceof Error ? e.message : 'Error desconocido')
      setEjecutandoClustering(false)
    }
  }

  // ── Acción: generar mapa ───────────────────────────────────
  async function handleGenerarMapa() {
    setGenerandoMapa(true)
    setErrorMapa(null)

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

      router.push(`/strategy/${session.id}/mapa`)
    } catch (e) {
      setErrorMapa(e instanceof Error ? e.message : 'Error desconocido')
      setGenerandoMapa(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-900">{session.nombre}</h1>
          </div>
          <p className="text-sm text-gray-500">
            {session.client_nombre} · {totalIncluidas.toLocaleString('es-ES')} keywords incluidas
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/strategy/${session.id}/keywords`}>
              <Search className="h-4 w-4 mr-1" />
              Keywords
            </Link>
          </Button>
          {hayCluster && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/strategy/${session.id}/mapa`}>
                <Map className="h-4 w-4 mr-1" />
                Ver mapa
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Keywords incluidas', value: totalIncluidas.toLocaleString('es-ES'), color: 'text-gray-700' },
          { label: 'Clusters',           value: clusters.length.toLocaleString('es-ES'),  color: 'text-indigo-700' },
          { label: 'Sin clasificar',     value: unclassifiedCount.toLocaleString('es-ES'), color: unclassifiedCount > 0 ? 'text-amber-700' : 'text-gray-400' },
          {
            label: 'Clasificadas',
            value: (totalIncluidas - unclassifiedCount).toLocaleString('es-ES'),
            color: 'text-green-700',
          },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-3">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Panel ejecución clustering */}
      <Card className={cn(
        'border-2 transition-colors',
        clusteringOk ? 'border-green-200 bg-green-50/30' : 'border-indigo-200 bg-indigo-50/30',
      )}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl shrink-0',
                clusteringOk ? 'bg-green-100' : 'bg-indigo-100',
              )}>
                {clusteringOk
                  ? <Check className="h-5 w-5 text-green-600" />
                  : <Sparkles className="h-5 w-5 text-indigo-600" />
                }
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {clusteringOk
                    ? 'Clustering completado'
                    : hayCluster
                      ? 'Re-ejecutar clustering'
                      : 'Ejecutar clustering semántico con IA'
                  }
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {clusteringOk
                    ? progresoClustering
                    : hayCluster
                      ? `${clusters.length} clusters existentes — volver a clasificar sobreescribirá los datos actuales`
                      : `Claude clasifica ${totalIncluidas} keywords en clusters temáticos con etiquetas TOFU/MOFU/BOFU y prioridad editorial`
                  }
                </p>
              </div>
            </div>
            <Button
              onClick={handleClustering}
              disabled={ejecutandoClustering || totalIncluidas === 0}
              size="sm"
              variant={clusteringOk || hayCluster ? 'outline' : 'default'}
              className="gap-2 shrink-0"
            >
              {ejecutandoClustering
                ? <><Loader2 className="h-4 w-4 animate-spin" />Clasificando...</>
                : <><Layers className="h-4 w-4" />{hayCluster ? 'Re-ejecutar' : 'Ejecutar clustering'}</>
              }
            </Button>
          </div>

          {/* Progreso */}
          {ejecutandoClustering && (
            <div className="mt-4 rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-indigo-600 animate-spin shrink-0" />
                <p className="text-sm text-indigo-700">{progresoClustering || 'Procesando...'}</p>
              </div>
              <p className="mt-1 text-xs text-indigo-500">
                Procesando en lotes de 50 keywords con Claude. Puede tardar 60-120 segundos.
              </p>
            </div>
          )}

          {/* Error */}
          {errorClustering && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {errorClustering}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clusters grid */}
      {clusters.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              {clusters.length} clusters semánticos
            </h2>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400 inline-block" /> TOFU</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> MOFU</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400 inline-block" /> BOFU</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            {clusters.map((cluster) => (
              <Card key={cluster.nombre} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  {/* Header del cluster */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 leading-tight">{cluster.nombre}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {cluster.total} keyword{cluster.total !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {cluster.tofu > 0 && <FunnelBadge stage="tofu" />}
                      {cluster.mofu > 0 && <FunnelBadge stage="mofu" />}
                      {cluster.bofu > 0 && <FunnelBadge stage="bofu" />}
                    </div>
                  </div>

                  {/* Barra de distribución */}
                  <FunnelBar tofu={cluster.tofu} mofu={cluster.mofu} bofu={cluster.bofu} total={cluster.total} />

                  {/* Conteos funnel */}
                  <div className="mt-1.5 flex gap-3 text-[11px] text-gray-400">
                    {cluster.tofu > 0 && <span className="text-green-600 font-medium">{cluster.tofu} TOFU</span>}
                    {cluster.mofu > 0 && <span className="text-amber-600 font-medium">{cluster.mofu} MOFU</span>}
                    {cluster.bofu > 0 && <span className="text-red-600 font-medium">{cluster.bofu} BOFU</span>}
                  </div>

                  {/* Keywords preview */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {cluster.keywords.slice(0, 6).map((kw) => (
                      <span
                        key={kw.keyword}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-50 border border-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                        title={`${kw.volume != null ? volumenLabel(kw.volume) + ' búsquedas/mes' : 'sin volumen'}`}
                      >
                        {kw.keyword}
                        {kw.volume != null && (
                          <span className="text-gray-400 font-mono">{volumenLabel(kw.volume)}</span>
                        )}
                      </span>
                    ))}
                    {cluster.keywords.length > 6 && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-400">
                        +{cluster.keywords.length - 6} más
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state: sin clusters */}
      {clusters.length === 0 && !ejecutandoClustering && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Layers className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">Sin clusters todavía</p>
            <p className="text-xs text-gray-400 mt-1">
              Ejecuta el clustering para agrupar las {totalIncluidas} keywords en temas
            </p>
          </CardContent>
        </Card>
      )}

      {/* Panel generar mapa — siempre visible */}
      <Card className="border-violet-200 bg-violet-50/30">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 shrink-0">
                <Map className="h-5 w-5 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Generar mapa de contenidos</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Claude crea el plan editorial con títulos SEO, distribución por meses y prioridad de publicación.
                </p>

                {!mostrarConfigMapa && (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3 gap-2 bg-violet-600 hover:bg-violet-700"
                    onClick={() => setMostrarConfigMapa(true)}
                    disabled={generandoMapa}
                  >
                    <TrendingUp className="h-4 w-4" />
                    Configurar y generar mapa
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}

                {/* Config panel */}
                {mostrarConfigMapa && (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Duración */}
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

                      {/* Artículos/mes */}
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

                    {/* Resumen config */}
                    <p className="text-xs text-violet-700 font-medium bg-violet-100 rounded-lg px-3 py-2">
                      Plan: {meses} meses × {artMes} artículos/mes = hasta{' '}
                      <strong>{meses * artMes} artículos</strong> planificados
                    </p>

                    {/* Loading mapa */}
                    {generandoMapa && (
                      <div className="flex items-center gap-2 text-sm text-violet-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generando mapa editorial con Claude... (30-60 segundos)
                      </div>
                    )}

                    {/* Error mapa */}
                    {errorMapa && (
                      <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        {errorMapa}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleGenerarMapa}
                        disabled={generandoMapa}
                        className="gap-2 bg-violet-600 hover:bg-violet-700"
                      >
                        {generandoMapa
                          ? <><Loader2 className="h-4 w-4 animate-spin" />Generando...</>
                          : <><Map className="h-4 w-4" />Generar mapa</>
                        }
                      </Button>
                      {!generandoMapa && (
                        <button
                          type="button"
                          onClick={() => { setMostrarConfigMapa(false); setErrorMapa(null) }}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  )
}
