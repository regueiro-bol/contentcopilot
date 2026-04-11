'use client'

import { useState, useEffect } from 'react'
import { Loader2, Check, X, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SocialMetric {
  id?                   : string
  client_id             : string
  platform              : string
  month                 : string
  followers_end?        : number | null
  followers_growth?     : number | null
  avg_engagement?       : number | null
  total_impressions?    : number | null
  total_reach?          : number | null
  total_interactions?   : number | null
  posts_published?      : number | null
  best_post_url?        : string | null
  best_post_impressions?: number | null
  notes?                : string | null
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin : 'LinkedIn', twitter_x: 'Twitter/X', instagram: 'Instagram',
  facebook : 'Facebook', tiktok   : 'TikTok',    youtube  : 'YouTube',
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin : 'bg-blue-600',  twitter_x: 'bg-gray-900', instagram: 'bg-purple-600',
  facebook : 'bg-blue-500',  tiktok   : 'bg-black',    youtube  : 'bg-red-600',
}

interface Props {
  clientId    : string
  platforms   : string[]
  month       : string     // YYYY-MM
  existing    : SocialMetric[]
  onClose     : () => void
  onSaved     : (metric: SocialMetric) => void
}

// ─── Empty form state ─────────────────────────────────────────────────────────

function emptyForm(clientId: string, platform: string, month: string): SocialMetric {
  return {
    client_id: clientId, platform, month,
    followers_end: null, followers_growth: null, avg_engagement: null,
    total_impressions: null, total_reach: null, total_interactions: null,
    posts_published: null, best_post_url: null, best_post_impressions: null,
    notes: null,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MetricsModal({ clientId, platforms, month, existing, onClose, onSaved }: Props) {
  const [activePlatform, setActivePlatform] = useState(platforms[0] ?? 'linkedin')
  const [form,           setForm]           = useState<SocialMetric>(() => {
    const ex = existing.find((m) => m.platform === (platforms[0] ?? 'linkedin'))
    return ex ? { ...ex } : emptyForm(clientId, platforms[0] ?? 'linkedin', month)
  })
  const [saving,   setSaving]   = useState(false)
  const [savedAt,  setSavedAt]  = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Load data for current platform tab
  useEffect(() => {
    const ex = existing.find((m) => m.platform === activePlatform)
    setForm(ex ? { ...ex } : emptyForm(clientId, activePlatform, month))
    setSavedAt(null)
    setErrorMsg('')
  }, [activePlatform, clientId, month, existing])

  function updateField(field: keyof SocialMetric, value: string) {
    const numFields: (keyof SocialMetric)[] = [
      'followers_end', 'followers_growth', 'avg_engagement',
      'total_impressions', 'total_reach', 'total_interactions',
      'posts_published', 'best_post_impressions',
    ]
    const parsed = numFields.includes(field)
      ? (value === '' ? null : Number(value))
      : value || null
    setForm((prev) => ({ ...prev, [field]: parsed }))
  }

  async function handleSave() {
    setSaving(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/social/metrics', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          clientId            : form.client_id,
          platform            : form.platform,
          month,
          followersEnd        : form.followers_end,
          followersGrowth     : form.followers_growth,
          avgEngagement       : form.avg_engagement,
          totalImpressions    : form.total_impressions,
          totalReach          : form.total_reach,
          totalInteractions   : form.total_interactions,
          postsPublished      : form.posts_published,
          bestPostUrl         : form.best_post_url,
          bestPostImpressions : form.best_post_impressions,
          notes               : form.notes,
        }),
      })
      const data = await res.json() as SocialMetric | { error: string }
      if (!res.ok) throw new Error((data as any).error)
      setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      onSaved(data as SocialMetric)
      setForm(data as SocialMetric)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const numInput = (
    label: string,
    field: keyof SocialMetric,
    opts?: { step?: string; placeholder?: string; prefix?: string },
  ) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="relative">
        {opts?.prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{opts.prefix}</span>
        )}
        <input
          type="number"
          step={opts?.step ?? '1'}
          value={(form[field] as number | null) ?? ''}
          onChange={(e) => updateField(field, e.target.value)}
          placeholder={opts?.placeholder ?? '—'}
          className={`w-full text-sm border border-gray-200 rounded-lg py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 ${opts?.prefix ? 'pl-6 pr-3' : 'px-3'}`}
        />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Registrar métricas del mes</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {new Date(month + '-15').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Platform tabs */}
        <div className="flex gap-1 px-5 pt-4 pb-0 overflow-x-auto shrink-0">
          {platforms.map((p) => {
            const hasData = existing.some((m) => m.platform === p)
            return (
              <button
                key={p}
                onClick={() => setActivePlatform(p)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors border-b-2
                  ${activePlatform === p
                    ? 'bg-white border-blue-500 text-blue-700'
                    : 'bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                <span className={`h-2 w-2 rounded-full ${PLATFORM_COLORS[p] ?? 'bg-gray-400'}`} />
                {PLATFORM_LABELS[p] ?? p}
                {hasData && <span className="text-green-500">✓</span>}
              </button>
            )
          })}
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Growth metrics */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Crecimiento</p>
            <div className="grid grid-cols-2 gap-3">
              {numInput('Seguidores al cierre del mes', 'followers_end', { placeholder: 'ej: 13700' })}
              {numInput('Crecimiento de seguidores', 'followers_growth', { placeholder: 'ej: +150 o -20' })}
            </div>
          </div>

          {/* Performance metrics */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rendimiento</p>
            <div className="grid grid-cols-2 gap-3">
              {numInput('Engagement medio (%)', 'avg_engagement', { step: '0.01', placeholder: 'ej: 2.4' })}
              {numInput('Impresiones totales', 'total_impressions', { placeholder: 'ej: 45200' })}
              {numInput('Alcance total', 'total_reach', { placeholder: 'ej: 32100' })}
              {numInput('Interacciones totales', 'total_interactions', { placeholder: 'ej: 1085' })}
            </div>
          </div>

          {/* Content metrics */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contenido</p>
            <div className="grid grid-cols-2 gap-3">
              {numInput('Piezas publicadas', 'posts_published', { placeholder: 'ej: 18' })}
              {numInput('Impresiones mejor pieza', 'best_post_impressions', { placeholder: 'ej: 8500' })}
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">URL mejor pieza del mes</label>
              <input
                type="url"
                value={form.best_post_url ?? ''}
                onChange={(e) => updateField('best_post_url', e.target.value)}
                placeholder="https://www.linkedin.com/posts/..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notas del consultor
            </label>
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Observaciones, contexto de los resultados, eventos del mes que afectaron métricas…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-400">
            {savedAt && (
              <span className="flex items-center gap-1 text-green-600">
                <Check className="h-3 w-3" />
                Guardado a las {savedAt}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-xs text-gray-500">
              Cerrar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</>
                : <><Check className="h-3.5 w-3.5" /> Guardar métricas de {PLATFORM_LABELS[activePlatform] ?? activePlatform}</>
              }
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
