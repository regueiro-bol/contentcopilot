'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, RefreshCw, BarChart2, ExternalLink,
  Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Calendar, Building2, TrendingUp, Lightbulb, Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import ClienteSubNav from '../cliente-subnav'
import type {
  Competitor, CompetitorAdRow, CiReportRow, ReportContent,
} from './page'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  clientId:             string
  clientNombre:         string
  initialCompetitors:   Competitor[]
  initialAds:           CompetitorAdRow[]
  latestReport:         CiReportRow | null
  embedded?:            boolean
  /** Solo gestión CRUD de competidores: oculta escaneo, ads y reports. */
  manageOnly?:          boolean
  /** Solo lectura de competidores: oculta añadir/editar/eliminar, deja escaneo y reports. */
  readOnlyCompetitors?: boolean
  /** Texto del título de la sección de competidores. */
  sectionTitle?:        string
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────

interface Toast { id: string; message: string; type: 'success' | 'error' | 'loading' }

function ToastList({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white
            ${t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-gray-800'}`}
        >
          {t.type === 'loading' && <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />}
          {t.type === 'success' && <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
          {t.type === 'error' && <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sección: Competidores
// ─────────────────────────────────────────────────────────────────────────────

function CompetidoresSection({
  clientId,
  competitors,
  onAdd,
  onDelete,
  onScan,
  onScanGoogle,
  scanning,
  scanningGoogle,
  hideScanButtons = false,
  hideCrudButtons = false,
  sectionTitle = 'Competidores monitorizados',
}: {
  clientId:       string
  competitors:    Competitor[]
  onAdd:          (c: Competitor) => void
  onDelete:       (id: string) => void
  onScan:         () => void
  onScanGoogle:   () => void
  scanning:       boolean
  scanningGoogle: boolean
  hideScanButtons?: boolean
  hideCrudButtons?: boolean
  sectionTitle?:    string
}) {
  const [showForm, setShowForm]   = useState(false)
  const [pageName, setPageName]   = useState('')
  const [pageId, setPageId]       = useState('')
  const [platform, setPlatform]   = useState<'meta' | 'google'>('meta')
  const [saving, setSaving]       = useState(false)
  const [addError, setAddError]   = useState<string | null>(null)

  const metaCompetitors   = competitors.filter((c) => c.platform === 'meta')
  const googleCompetitors = competitors.filter((c) => c.platform === 'google')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!pageName.trim()) return
    setSaving(true)
    setAddError(null)
    try {
      const res = await fetch('/api/competitive-intelligence/competitors', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ client_id: clientId, platform, page_name: pageName.trim(), page_id: pageId.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Error creando competidor')
      onAdd(data.competitor as Competitor)
      setPageName('')
      setPageId('')
      setShowForm(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/competitive-intelligence/competitors/${id}`, { method: 'DELETE' })
    if (res.ok) onDelete(id)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-gray-900">{sectionTitle}</h2>
          <Badge className="bg-gray-100 text-gray-600 border-0 text-xs">{competitors.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {!hideScanButtons && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onScanGoogle}
                disabled={scanningGoogle || googleCompetitors.length === 0}
                className="gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                title="Escanear Google Ads Transparency Center (requiere SERPAPI_KEY)"
              >
                {scanningGoogle
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                Escanear Google
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onScan}
                disabled={scanning || metaCompetitors.length === 0}
                className="gap-1.5 text-xs"
              >
                {scanning
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                Escanear Meta
              </Button>
            </>
          )}
          {!hideCrudButtons && (
            <Button
              size="sm"
              onClick={() => setShowForm(!showForm)}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir competidor
            </Button>
          )}
        </div>
      </div>

      {/* Formulario inline */}
      {showForm && !hideCrudButtons && (
        <form onSubmit={handleAdd} className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
          <p className="text-xs font-medium text-gray-700">Nuevo competidor</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Plataforma *</label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as 'meta' | 'google')}
              >
                <option value="meta">Meta (Facebook/Instagram)</option>
                <option value="google">Google Ads</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre del anunciante *</label>
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Ej: Adams Formación"
                value={pageName}
                onChange={(e) => setPageName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {platform === 'meta' ? 'ID de página Meta (opcional)' : 'Advertiser ID Google (opcional)'}
              </label>
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={platform === 'meta' ? 'Ej: 123456789' : 'Ej: AR17828074650563772417'}
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
              />
            </div>
          </div>
          {addError && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {addError}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving} className="text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Guardar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setAddError(null) }} className="text-xs">
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* Lista */}
      {competitors.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          No hay competidores configurados. Añade uno para empezar.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {competitors.map((comp) => (
            <div key={comp.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-xs font-bold text-indigo-700">
                    {comp.page_name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{comp.page_name}</p>
                  <p className="text-xs text-gray-400">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mr-1 ${
                      comp.platform === 'google'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-indigo-50 text-indigo-700'
                    }`}>
                      {comp.platform === 'google' ? 'Google' : 'Meta'}
                    </span>
                    Cada {comp.check_frequency_days} días
                    {comp.last_checked_at
                      ? ` · Último scan: ${new Date(comp.last_checked_at).toLocaleDateString('es-ES')}`
                      : ' · Sin escanear'}
                  </p>
                </div>
              </div>
              {!hideCrudButtons && (
                <button
                  onClick={() => handleDelete(comp.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded"
                  title="Eliminar competidor"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Leyenda de ayuda para encontrar los IDs */}
      <div className="mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-2">
        <p className="font-medium text-gray-600">¿Cómo encuentro el ID del anunciante?</p>
        <div className="flex items-start gap-2">
          <span className="inline-block w-14 shrink-0 font-medium text-blue-700">Google</span>
          <span>
            Busca la marca en el{' '}
            <a
              href="https://adstransparency.google.com/?authuser=0&region=ES"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Centro de Transparencia de Google Ads
            </a>
            . El ID aparece en la URL y empieza por <code className="px-1 py-0.5 bg-gray-100 rounded font-mono">AR</code> seguido de números (ej. <code className="px-1 py-0.5 bg-gray-100 rounded font-mono">AR17828074650563772417</code>).
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span className="inline-block w-14 shrink-0 font-medium text-indigo-700">Meta</span>
          <span>
            Busca la página en la{' '}
            <a
              href="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ES&is_targeted_country=false&media_type=all&sort_data[mode]=total_impressions&sort_data[direction]=desc&source=fb-logo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              Biblioteca de anuncios de Meta
            </a>
            . El ID es el valor del parámetro <code className="px-1 py-0.5 bg-gray-100 rounded font-mono">id=</code> al final de la URL.
          </span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sección: Ads de la competencia
// ─────────────────────────────────────────────────────────────────────────────

function AdsSection({ ads }: { ads: CompetitorAdRow[] }) {
  const [filter, setFilter] = useState<string | null>(null)

  const pages = Array.from(new Set(ads.map((a) => a.competitors?.page_name).filter(Boolean))) as string[]
  const filtered = filter ? ads.filter((a) => a.competitors?.page_name === filter) : ads

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-gray-900">Anuncios de la competencia</h2>
          <Badge className="bg-gray-100 text-gray-600 border-0 text-xs">{ads.length}</Badge>
        </div>
        {pages.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilter(null)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                filter === null ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Todos
            </button>
            {pages.map((p) => (
              <button
                key={p}
                onClick={() => setFilter(p === filter ? null : p)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  filter === p ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          No hay anuncios. Ejecuta un escaneo para cargar ads de la competencia.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </div>
  )
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)/i.test(url)
    || url.includes('simgad')
    || url.includes('googlesyndication.com/archive')
}

function AdCard({ ad }: { ad: CompetitorAdRow }) {
  const [expanded, setExpanded]   = useState(false)
  const [imgError, setImgError]   = useState(false)
  const hasCopy      = !!ad.copy_text
  const copy         = ad.copy_text ?? ''
  const truncated    = hasCopy && copy.length > 140 && !expanded
  const isGoogle     = ad.platform === 'google'
  const externalUrl  = ad.creative_url ?? ad.ad_snapshot_url ?? null
  const showPreview  = !!ad.creative_url && isImageUrl(ad.creative_url) && !imgError
  const raw          = ad.raw_data as Record<string, unknown> | null
  const totalDays    = typeof raw?.total_days_shown === 'number' ? raw.total_days_shown : null

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex flex-col gap-3 hover:border-indigo-200 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
          {ad.competitors?.page_name ?? 'Competidor'}
        </span>
        <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">Activo</Badge>
      </div>

      {/* Creative image preview */}
      {showPreview && (
        <div className="rounded-md overflow-hidden border border-gray-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ad.creative_url!}
            alt={`Anuncio de ${ad.competitors?.page_name ?? 'competidor'}`}
            className="w-full h-auto max-h-48 object-contain"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      {/* Copy text o fallback snapshot */}
      <div>
        {hasCopy ? (
          <>
            <p className="text-sm text-gray-700 leading-relaxed">
              {truncated ? `${copy.slice(0, 140)}…` : copy}
            </p>
            {copy.length > 140 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-1 text-xs text-indigo-600 hover:underline flex items-center gap-0.5"
              >
                {expanded ? <><ChevronUp className="h-3 w-3" /> Ver menos</> : <><ChevronDown className="h-3 w-3" /> Ver más</>}
              </button>
            )}
          </>
        ) : ad.ad_snapshot_url ? (
          <a
            href={ad.ad_snapshot_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver anuncio en Google Ads Transparency
          </a>
        ) : !showPreview ? (
          <p className="text-sm text-gray-400 italic">
            {isGoogle ? 'Anuncio sin preview disponible' : '(sin texto disponible)'}
          </p>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-200">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {ad.cta_type && (
            <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-xs font-medium">
              {ad.cta_type.replace(/_/g, ' ')}
            </span>
          )}
          {totalDays != null && (
            <span className="bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded text-xs font-medium">
              {totalDays}d activo
            </span>
          )}
          {ad.started_running && (
            <span className="flex items-center gap-0.5">
              <Calendar className="h-3 w-3" />
              {new Date(ad.started_running).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-indigo-600 transition-colors"
            title={isGoogle ? 'Ver en Google Ads Transparency' : 'Ver en Meta Ad Library'}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sección: Informe de análisis
// ─────────────────────────────────────────────────────────────────────────────

function InformeSection({
  clientId,
  report,
  onReportGenerated,
}: {
  clientId:           string
  report:             CiReportRow | null
  onReportGenerated:  (r: CiReportRow) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    const res = await fetch('/api/competitive-intelligence/report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ client_id: clientId }),
    })
    if (res.ok) {
      const { report: newReport } = await res.json() as { report: CiReportRow }
      onReportGenerated(newReport)
    } else {
      const { error: err } = await res.json() as { error: string }
      setError(err)
    }
    setGenerating(false)
  }

  const content = report?.content as ReportContent | null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-gray-900">Informe de análisis</h2>
          {report && (
            <span className="text-xs text-gray-400">
              Generado el {new Date(report.created_at).toLocaleDateString('es-ES')}
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
          className="gap-1.5 text-xs"
        >
          {generating
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <BarChart2 className="h-3.5 w-3.5" />}
          {report ? 'Regenerar informe' : 'Generar informe con IA'}
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {generating && (
        <div className="flex items-center justify-center py-12 gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Claude está analizando los anuncios de la competencia…</span>
        </div>
      )}

      {!generating && !content && (
        <p className="text-sm text-gray-400 text-center py-8">
          Genera un informe para ver el análisis de la competencia.
        </p>
      )}

      {!generating && content && <ReportView content={content} report={report!} />}
    </div>
  )
}

function ReportView({ content, report }: { content: ReportContent; report: CiReportRow }) {
  const prioColors: Record<string, string> = {
    alta:  'bg-red-100 text-red-700 border-red-200',
    media: 'bg-amber-100 text-amber-700 border-amber-200',
    baja:  'bg-gray-100 text-gray-600 border-gray-200',
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{report.competitors_analyzed} competidores · {report.ads_analyzed} anuncios analizados</span>
        <span>·</span>
        <span>
          {new Date(report.period_start).toLocaleDateString('es-ES')} →{' '}
          {new Date(report.period_end).toLocaleDateString('es-ES')}
        </span>
      </div>

      {/* Nota metodológica */}
      {content.nota_metodologica && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-xs text-gray-500 leading-relaxed">{content.nota_metodologica}</p>
        </div>
      )}

      {/* Resumen ejecutivo */}
      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
        <p className="text-sm font-medium text-indigo-900 mb-1">Resumen ejecutivo</p>
        <p className="text-sm text-indigo-800 leading-relaxed">{content.resumen_ejecutivo}</p>
      </div>

      {/* Análisis por competidor */}
      {content.analisis_por_competidor?.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-gray-500" />
            Análisis por competidor
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {content.analisis_por_competidor.map((comp) => (
              <div key={comp.nombre} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{comp.nombre}</p>
                    {comp.plataforma && (
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 uppercase">
                        {comp.plataforma}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{comp.num_ads} ads</span>
                </div>
                {/* Formatos */}
                {comp.formatos && Object.keys(comp.formatos).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {Object.entries(comp.formatos).map(([fmt, count]) => (
                      <span key={fmt} className="text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
                        {fmt}: {count as number}
                      </span>
                    ))}
                  </div>
                )}
                {/* Consistencia de inversión */}
                {comp.consistencia_inversion && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-0.5">Inversión</p>
                    <p className="text-xs text-gray-700">{comp.consistencia_inversion}</p>
                  </div>
                )}
                {/* Días promedio */}
                {comp.dias_promedio_activo != null && (
                  <p className="text-[11px] text-gray-400 mb-2">
                    Promedio {comp.dias_promedio_activo} días activo por anuncio
                  </p>
                )}
                {/* Mensajes clave (solo si hay — Meta ads) */}
                {comp.mensajes_clave?.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-1">Mensajes clave</p>
                    <ul className="space-y-0.5">
                      {comp.mensajes_clave.slice(0, 3).map((m, i) => (
                        <li key={i} className="text-xs text-gray-700 flex items-start gap-1">
                          <span className="text-indigo-400 mt-0.5">•</span>{m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Observaciones */}
                {comp.observaciones?.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-1">Observaciones</p>
                    <ul className="space-y-0.5">
                      {comp.observaciones.slice(0, 3).map((o, i) => (
                        <li key={i} className="text-xs text-gray-700 flex items-start gap-1">
                          <span className="text-emerald-400 mt-0.5">•</span>{o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {comp.ctas_usados?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {comp.ctas_usados.slice(0, 3).map((cta, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {cta}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Oportunidades */}
      {content.oportunidades?.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Oportunidades detectadas
          </p>
          <ul className="space-y-2">
            {content.oportunidades.map((op, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 flex-shrink-0 h-5 w-5 rounded-full bg-amber-100 text-amber-700 text-xs flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                {op}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recomendaciones */}
      {content.recomendaciones?.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Target className="h-4 w-4 text-green-500" />
            Recomendaciones
          </p>
          <div className="space-y-3">
            {content.recomendaciones.map((rec, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                <Badge className={`text-xs flex-shrink-0 mt-0.5 ${prioColors[rec.prioridad] ?? prioColors.baja}`}>
                  {rec.prioridad}
                </Badge>
                <div>
                  <p className="text-sm font-medium text-gray-900">{rec.recomendacion}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{rec.razonamiento}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function CompetitiveIntelligenceClient({
  clientId,
  clientNombre,
  initialCompetitors,
  initialAds,
  latestReport,
  embedded = false,
  manageOnly = false,
  readOnlyCompetitors = false,
  sectionTitle,
}: Props) {
  const router = useRouter()
  const [competitors, setCompetitors]       = useState<Competitor[]>(initialCompetitors)
  const [ads, setAds]                       = useState<CompetitorAdRow[]>(initialAds)
  const [report, setReport]                 = useState<CiReportRow | null>(latestReport)
  const [scanning, setScanning]             = useState(false)
  const [scanningGoogle, setScanningGoogle] = useState(false)
  const [toasts, setToasts]                 = useState<Toast[]>([])

  // Sincroniza el estado local cuando router.refresh() trae nuevas props del servidor.
  // useState no se reinicializa con cambios de props — useEffect lo resuelve.
  useEffect(() => { setCompetitors(initialCompetitors) }, [initialCompetitors])
  useEffect(() => { setAds(initialAds) },                 [initialAds])
  useEffect(() => { setReport(latestReport) },            [latestReport])

  function addToast(message: string, type: Toast['type'], id?: string): string {
    const tid = id ?? crypto.randomUUID()
    setToasts((prev) => [{ id: tid, message, type }, ...prev.slice(0, 3)])
    if (type !== 'loading') setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== tid)), 4000)
    return tid
  }

  const handleScan = useCallback(async () => {
    setScanning(true)
    const tid = addToast('Escaneando Meta Ad Library…', 'loading')

    const res = await fetch('/api/competitive-intelligence/scan-meta', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ client_id: clientId }),
    })

    if (res.ok) {
      const data = await res.json() as {
        competitors_scanned: number
        ads_found:           number
        ads_new:             number
      }
      setToasts((prev) => prev.filter((t) => t.id !== tid))
      addToast(`Scan completado · ${data.ads_found} ads encontrados · ${data.ads_new} nuevos`, 'success')
      router.refresh()
    } else {
      const { error } = await res.json() as { error: string }
      setToasts((prev) => prev.filter((t) => t.id !== tid))
      addToast(`Error en el scan: ${error}`, 'error')
    }

    setScanning(false)
  }, [clientId, router])

  const handleScanGoogle = useCallback(async () => {
    setScanningGoogle(true)
    const tid = addToast('Escaneando Google Ads Transparency…', 'loading')

    const res = await fetch('/api/competitive-intelligence/scan-google', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ client_id: clientId }),
    })

    if (res.ok) {
      const data = await res.json() as {
        competitors_scanned: number
        ads_found:           number
        ads_new:             number
        details:             Array<{ page_name: string; ads_found: number; error?: string }>
      }
      setToasts((prev) => prev.filter((t) => t.id !== tid))

      const errors    = data.details.filter((d) => d.error)
      const hasErrors = errors.length > 0
      const hasAds    = data.ads_found > 0

      if (hasErrors && !hasAds) {
        // Todos fallaron y no hay ads
        addToast(`Google scan: ${errors[0].error}`, 'error')
      } else if (hasErrors && hasAds) {
        // Scan parcial: algunos fallaron pero otros encontraron ads
        addToast(`Google scan · ${data.ads_found} ads · ${errors.length} competidor(es) con error`, 'success')
        router.refresh()
      } else {
        // Todo bien
        addToast(
          data.ads_found > 0
            ? `Google scan · ${data.ads_found} ads encontrados · ${data.ads_new} nuevos`
            : `Google scan completado · 0 anuncios activos encontrados`,
          'success',
        )
        router.refresh()
      }
    } else {
      const { error } = await res.json() as { error: string }
      setToasts((prev) => prev.filter((t) => t.id !== tid))
      addToast(`Error Google scan: ${error}`, 'error')
    }

    setScanningGoogle(false)
  }, [clientId, router])

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-6xl mx-auto px-4 py-6 space-y-6'}>
      {!embedded && (
        <ClienteSubNav
          clientId={clientId}
          clientNombre={clientNombre}
          generationStatus={null}
        />
      )}

      {/* Header */}
      {!manageOnly && (
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center">
          <BarChart2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Competitive Intelligence</h1>
          <p className="text-sm text-gray-500">Monitoriza los anuncios de tu competencia en Meta y Google</p>
        </div>
      </div>
      )}

      {/* Sección competidores */}
      <CompetidoresSection
        clientId={clientId}
        competitors={competitors}
        onAdd={(c) => {
          setCompetitors((prev) => [...prev, c])  // actualización optimista inmediata
          router.refresh()                         // sincroniza con el servidor
        }}
        onDelete={(id) => {
          setCompetitors((prev) => prev.filter((c) => c.id !== id))
          router.refresh()
        }}
        onScan={handleScan}
        onScanGoogle={handleScanGoogle}
        scanning={scanning}
        scanningGoogle={scanningGoogle}
        hideScanButtons={manageOnly}
        hideCrudButtons={readOnlyCompetitors}
        sectionTitle={sectionTitle}
      />

      {!manageOnly && (
        <>
          {/* Sección ads */}
          <AdsSection ads={ads} />

          {/* Sección informe */}
          <InformeSection
            clientId={clientId}
            report={report}
            onReportGenerated={setReport}
          />
        </>
      )}

      <ToastList toasts={toasts} />
    </div>
  )
}
