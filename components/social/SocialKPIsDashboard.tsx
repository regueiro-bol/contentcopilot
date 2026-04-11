'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, ChevronDown, ChevronUp, BarChart2, TrendingUp, TrendingDown, ExternalLink, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseAndRenderJSX } from '@/lib/social/text-parser'
import MetricsModal, { type SocialMetric } from './MetricsModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPIsData {
  kpis_by_objective?    : unknown
  measurement_methodology?: unknown
  reporting_system?     : unknown
}

interface Platform {
  platform          : string
  strategic_priority: string | null
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin : 'LinkedIn', twitter_x: 'Twitter/X', instagram: 'Instagram',
  facebook : 'Facebook', tiktok   : 'TikTok',    youtube  : 'YouTube',
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin : 'bg-blue-600',  twitter_x: 'bg-gray-900', instagram: 'bg-purple-600',
  facebook : 'bg-blue-500',  tiktok   : 'bg-black',    youtube  : 'bg-red-600',
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split('-')
  return new Date(Number(year), Number(month) - 1, 15).toLocaleDateString('es-ES', {
    month: 'long', year: 'numeric',
  })
}

function fmt(n: number | null | undefined, suffix = ''): string {
  if (n == null) return '—'
  return n.toLocaleString('es-ES') + suffix
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${Number(n).toFixed(2)}%`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { clientId: string }

export default function SocialKPIsDashboard({ clientId }: Props) {
  const [month,       setMonth]       = useState(currentYearMonth())
  const [kpisData,    setKpisData]    = useState<KPIsData | null>(null)
  const [platforms,   setPlatforms]   = useState<Platform[]>([])
  const [metrics,     setMetrics]     = useState<SocialMetric[]>([])
  const [history,     setHistory]     = useState<SocialMetric[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showTargets, setShowTargets] = useState(false)
  const [modalOpen,   setModalOpen]   = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [kpisRes, platRes, metricsRes, histRes] = await Promise.all([
        fetch(`/api/social/kpis?clientId=${clientId}`),
        fetch(`/api/social/platforms?clientId=${clientId}`),
        fetch(`/api/social/metrics?clientId=${clientId}&month=${month}`),
        fetch(`/api/social/metrics?clientId=${clientId}&months=6`),
      ])

      if (kpisRes.ok) setKpisData(await kpisRes.json() as KPIsData)
      if (platRes.ok) {
        const all = await platRes.json() as Platform[]
        setPlatforms(all.filter((p) => p.strategic_priority === 'alta' || p.strategic_priority === 'mantener' || !p.strategic_priority))
      }
      if (metricsRes.ok) setMetrics(await metricsRes.json() as SocialMetric[])
      if (histRes.ok)    setHistory(await histRes.json() as SocialMetric[])
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId, month])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Collapse targets when metrics exist
  useEffect(() => {
    if (metrics.length > 0) setShowTargets(false)
    else                    setShowTargets(true)
  }, [metrics.length])

  function handleMetricSaved(metric: SocialMetric) {
    setMetrics((prev) => {
      const idx = prev.findIndex((m) => m.platform === metric.platform)
      if (idx >= 0) { const next = [...prev]; next[idx] = metric; return next }
      return [...prev, metric]
    })
    setHistory((prev) => {
      const idx = prev.findIndex((m) => m.platform === metric.platform && m.month === metric.month)
      if (idx >= 0) { const next = [...prev]; next[idx] = metric; return next }
      return [...prev, metric]
    })
  }

  const activePlatformKeys = platforms.map((p) => p.platform)

  // History grouped by month (for evolution table)
  const historyMonths = Array.from(new Set(history.map((m) => m.month))).sort((a, b) => b.localeCompare(a))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando KPIs…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
            <BarChart2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">KPIs y métricas</h2>
            <p className="text-xs text-gray-500">Seguimiento de resultados por plataforma</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <Button
            size="sm"
            onClick={() => setModalOpen(true)}
            className="text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Registrar métricas del mes
          </Button>
        </div>
      </div>

      {/* ── Section 1: Strategy targets ── */}
      {kpisData?.kpis_by_objective ? (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <button
            onClick={() => setShowTargets((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">Targets definidos en estrategia (Fase 5)</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Referencia estratégica</span>
            </div>
            {showTargets ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
          {showTargets && (
            <div className="px-5 pb-5 border-t border-gray-100 space-y-1 pt-4">
              {parseAndRenderJSX(kpisData.kpis_by_objective)}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-center">
          <p className="text-sm text-gray-500">
            Completa la <strong>Fase 5</strong> de la estrategia del cliente para ver los targets definidos.
          </p>
        </div>
      )}

      {/* ── Section 2: Real metrics this month ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">
            Métricas reales — {formatMonth(month)}
          </h3>
          {metrics.length > 0 && (
            <span className="text-xs text-gray-400">{metrics.length} plataforma{metrics.length !== 1 ? 's' : ''} registrada{metrics.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {metrics.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
            <BarChart2 className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">No hay métricas registradas para este mes.</p>
            <Button size="sm" onClick={() => setModalOpen(true)} className="text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-3.5 w-3.5" />
              Registrar métricas
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map((m) => (
              <PlatformMetricCard key={m.platform} metric={m} onEdit={() => setModalOpen(true)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: Monthly evolution (only if > 1 month of data) ── */}
      {historyMonths.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Evolución mensual</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Mes</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Plataforma</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Seguidores</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Crecim.</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Engagement</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Impresiones</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Piezas</th>
                </tr>
              </thead>
              <tbody>
                {historyMonths.slice(0, 6).flatMap((mo) =>
                  history.filter((m) => m.month === mo).map((m, i) => (
                    <tr key={`${mo}-${m.platform}`} className={`border-b border-gray-100 ${i === 0 ? 'border-t border-gray-200' : ''} hover:bg-gray-50`}>
                      {i === 0 && (
                        <td className="px-4 py-2 font-medium text-gray-700 whitespace-nowrap" rowSpan={history.filter((x) => x.month === mo).length}>
                          {new Date(mo + 'T12:00:00').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })}
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${PLATFORM_COLORS[m.platform] ?? 'bg-gray-400'}`} />
                          {PLATFORM_LABELS[m.platform] ?? m.platform}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">{fmt(m.followers_end)}</td>
                      <td className="px-4 py-2 text-right">
                        {m.followers_growth != null ? (
                          <span className={`flex items-center justify-end gap-0.5 ${m.followers_growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {m.followers_growth >= 0
                              ? <TrendingUp className="h-3 w-3" />
                              : <TrendingDown className="h-3 w-3" />
                            }
                            {m.followers_growth > 0 ? '+' : ''}{m.followers_growth.toLocaleString('es-ES')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">{fmtPct(m.avg_engagement)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{fmt(m.total_impressions)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{fmt(m.posts_published)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Metrics modal ── */}
      {modalOpen && (
        <MetricsModal
          clientId={clientId}
          platforms={activePlatformKeys.length > 0 ? activePlatformKeys : ['linkedin']}
          month={month}
          existing={metrics}
          onClose={() => setModalOpen(false)}
          onSaved={handleMetricSaved}
        />
      )}
    </div>
  )
}

// ─── Platform Metric Card ─────────────────────────────────────────────────────

function PlatformMetricCard({ metric, onEdit }: { metric: SocialMetric; onEdit: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-7 w-7 rounded-lg ${PLATFORM_COLORS[metric.platform] ?? 'bg-gray-600'} flex items-center justify-center`}>
            <span className="text-white text-xs font-bold">
              {(PLATFORM_LABELS[metric.platform] ?? metric.platform).slice(0, 2).toUpperCase()}
            </span>
          </span>
          <span className="text-sm font-semibold text-gray-800">{PLATFORM_LABELS[metric.platform] ?? metric.platform}</span>
        </div>
        <button onClick={onEdit} className="text-xs text-gray-400 hover:text-blue-600 transition-colors">Editar</button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <MetricRow label="Seguidores" value={fmt(metric.followers_end)} />
        <MetricRow
          label="Crecimiento"
          value={metric.followers_growth != null
            ? `${metric.followers_growth > 0 ? '+' : ''}${metric.followers_growth.toLocaleString('es-ES')}`
            : '—'}
          growth={metric.followers_growth}
        />
        <MetricRow label="Engagement" value={fmtPct(metric.avg_engagement)} />
        <MetricRow label="Impresiones" value={fmt(metric.total_impressions)} />
        <MetricRow label="Alcance" value={fmt(metric.total_reach)} />
        <MetricRow label="Interacciones" value={fmt(metric.total_interactions)} />
        <MetricRow label="Piezas publicadas" value={fmt(metric.posts_published)} />
      </div>

      {metric.best_post_url && (
        <a
          href={metric.best_post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Ver mejor pieza del mes
          {metric.best_post_impressions != null && (
            <span className="text-gray-400 ml-1">({fmt(metric.best_post_impressions)} impr.)</span>
          )}
        </a>
      )}

      {metric.notes && (
        <p className="text-xs text-gray-500 italic leading-relaxed border-t border-gray-100 pt-2">
          {metric.notes}
        </p>
      )}
    </div>
  )
}

function MetricRow({
  label, value, growth,
}: {
  label: string; value: string; growth?: number | null
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${
        growth != null
          ? growth >= 0 ? 'text-green-600' : 'text-red-500'
          : 'text-gray-800'
      }`}>
        {value}
      </span>
    </div>
  )
}
