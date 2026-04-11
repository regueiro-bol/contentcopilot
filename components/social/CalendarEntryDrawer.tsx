'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Trash2, Loader2, Sparkles, ExternalLink, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  PLATFORMS, PLATFORM_LABELS, PLATFORM_FORMATS, STATUS_COLORS,
  type Platform,
} from '@/lib/social/platforms'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEntry {
  id              : string
  client_id       : string
  platform        : Platform
  scheduled_date  : string
  content_type    : string | null
  format          : string | null
  title           : string | null
  description     : string | null
  status          : string
  blog_contenido_id: string | null
  social_post_id  : string | null
}

export interface BlogArticle {
  id              : string
  calendarId      : string
  titulo          : string
  keyword         : string | null
  fechaPublicacion: string
  status          : string
  urlPublicado    : string | null
}

interface Suggestion {
  platform: string
  format  : string
  title   : string
  angle   : string
}

interface Props {
  open          : boolean
  clientId      : string
  entry?        : CalendarEntry | null     // null = create mode
  defaultDate?  : string                   // pre-fill date in create mode
  blogArticles  : BlogArticle[]            // articles of current month for selector
  activePlatforms: Platform[]              // platforms with data for this client
  onClose       : () => void
  onSaved       : (entry: CalendarEntry) => void
  onDeleted?    : (id: string) => void
}

// ─── Content type pillars (generic fallback) ──────────────────────────────────

const CONTENT_TYPES = [
  'Educativo', 'Entretenimiento', 'Inspiracional', 'Promocional',
  'Comunidad', 'Behind the scenes', 'Tendencia', 'Otro',
]

const STATUSES = ['planificado', 'en_produccion', 'aprobado', 'publicado'] as const

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalendarEntryDrawer({
  open, clientId, entry, defaultDate, blogArticles, activePlatforms,
  onClose, onSaved, onDeleted,
}: Props) {
  const isEdit = !!entry

  // ── Form state ──
  const [platform,       setPlatform]       = useState<Platform>('linkedin')
  const [scheduledDate,  setScheduledDate]  = useState('')
  const [contentType,    setContentType]    = useState('')
  const [format,         setFormat]         = useState('')
  const [title,          setTitle]          = useState('')
  const [description,    setDescription]    = useState('')
  const [status,         setStatus]         = useState<string>('planificado')
  const [linkedArticleId, setLinkedArticleId] = useState<string>('')
  const [derivedFromBlog, setDerivedFromBlog] = useState(false)

  // ── UI state ──
  const [saving,          setSaving]         = useState(false)
  const [deleting,        setDeleting]       = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [suggesting,      setSuggesting]     = useState(false)
  const [suggestions,     setSuggestions]    = useState<Suggestion[]>([])
  const [error,           setError]          = useState<string | null>(null)

  // ── Strategy context (loaded once per clientId) ──
  const [strategyPillars,  setStrategyPillars]  = useState<string[]>([])
  const [strategyFormats,  setStrategyFormats]  = useState<Record<string, string[]>>({})
  const [strategyValidated, setStrategyValidated] = useState(false)

  // ── Populate form on open ──
  useEffect(() => {
    if (!open) return
    setError(null)
    setSuggestions([])
    setShowDeleteConfirm(false)

    if (entry) {
      setPlatform(entry.platform as Platform)
      setScheduledDate(entry.scheduled_date)
      setContentType(entry.content_type ?? '')
      setFormat(entry.format ?? '')
      setTitle(entry.title ?? '')
      setDescription(entry.description ?? '')
      setStatus(entry.status)
      setLinkedArticleId(entry.blog_contenido_id ?? '')
      setDerivedFromBlog(!!entry.blog_contenido_id)
    } else {
      const firstPlatform = activePlatforms[0] ?? 'linkedin'
      setPlatform(firstPlatform)
      setScheduledDate(defaultDate ?? '')
      setContentType('')
      setFormat('')
      setTitle('')
      setDescription('')
      setStatus('planificado')
      setLinkedArticleId('')
      setDerivedFromBlog(false)
    }
  }, [open, entry, defaultDate, activePlatforms])

  // ── Reset format when platform changes ──
  useEffect(() => {
    if (!entry || entry.platform !== platform) {
      setFormat('')
    }
  }, [platform]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load strategy context once ──
  useEffect(() => {
    if (!clientId) return
    fetch(`/api/social/strategy-context?clientId=${clientId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        setStrategyPillars(data.editorialPillars ?? [])
        setStrategyFormats(data.formatsByPlatform ?? {})
        setStrategyValidated(Boolean(data.isValidated))
      })
      .catch(() => { /* silencioso */ })
  }, [clientId])

  // ── Auto-fill from article ──
  function handleArticleSelect(articleId: string) {
    setLinkedArticleId(articleId)
    if (!articleId) return
    const article = blogArticles.find((a) => a.id === articleId)
    if (!article) return
    setTitle(`${article.titulo.slice(0, 75)}`)
    setDescription(`Derivado del artículo: "${article.titulo}"\nKeyword: ${article.keyword ?? '—'}`)
  }

  // ── Save ──
  async function handleSave() {
    if (!platform || !scheduledDate) {
      setError('Plataforma y fecha son obligatorias')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        platform,
        scheduledDate,
        contentType   : contentType   || null,
        format        : format        || null,
        title         : title         || null,
        description   : description   || null,
        status,
        blogContenidoId: (derivedFromBlog && linkedArticleId) ? linkedArticleId : null,
      }

      let res: Response
      if (isEdit) {
        res = await fetch(`/api/social/calendar?id=${entry!.id}`, {
          method : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/social/calendar', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ clientId, ...payload }),
        })
      }

      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error ?? 'Error al guardar')
      }
      const saved = await res.json() as CalendarEntry
      onSaved(saved)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──
  async function handleDelete() {
    if (!entry) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/social/calendar?id=${entry.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      onDeleted?.(entry.id)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── AI suggestions ──
  async function handleSuggest() {
    const article = blogArticles.find((a) => a.id === linkedArticleId)
    if (!article) return
    setSuggesting(true)
    setSuggestions([])
    try {
      const res = await fetch('/api/social/suggest-posts', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          clientId,
          articleId     : article.id,
          articleTitle  : article.titulo,
          articleKeyword: article.keyword,
        }),
      })
      if (!res.ok) throw new Error('Error generando sugerencias')
      const { suggestions: s } = await res.json()
      setSuggestions(s ?? [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSuggesting(false)
    }
  }

  function applySuggestion(s: Suggestion) {
    if (PLATFORMS.includes(s.platform as Platform)) {
      setPlatform(s.platform as Platform)
    }
    setFormat(s.format)
    setTitle(s.title)
    setDescription(s.angle)
    setSuggestions([])
  }

  // Use strategy formats if available, fallback to static PLATFORM_FORMATS
  const formats = (strategyFormats[platform]?.length ? strategyFormats[platform] : PLATFORM_FORMATS[platform]) ?? []
  // Use pillar names if available, fallback to generic CONTENT_TYPES
  const contentTypeOptions = strategyPillars.length > 0 ? strategyPillars : CONTENT_TYPES

  // ── Render ──
  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className={`
        fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl
        flex flex-col overflow-hidden
        transition-transform duration-300 ease-in-out
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? 'Editar entrada' : 'Nueva entrada social'}
            </h2>
            {strategyValidated && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                <Sparkles className="h-3 w-3" /> Estrategia validada
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Plataforma + Fecha */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">Plataforma *</label>
              <div className="relative">
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform)}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  {(activePlatforms.length > 0 ? activePlatforms : PLATFORMS).map((p) => (
                    <option key={p} value={p}>{PLATFORM_LABELS[p as Platform] ?? p}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">Fecha *</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
            </div>
          </div>

          {/* Tipo de contenido + Formato */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">Pilar / Tipo</label>
              <div className="relative">
                <select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option value="">Sin especificar</option>
                  {contentTypeOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">Formato</label>
              <div className="relative">
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option value="">Sin especificar</option>
                  {formats.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">Título</label>
            <input
              type="text"
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título de la pieza (máx. 80 caracteres)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
            <p className="text-xs text-gray-400 text-right">{title.length}/80</p>
          </div>

          {/* Briefing */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">Descripción / Briefing</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ángulo editorial, mensaje clave, referencias…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
            />
          </div>

          {/* Estado */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">Estado</label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_COLORS[s]?.label ?? s}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
            </div>
          </div>

          {/* Derivado de blog */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Contenido derivado de artículo del blog
              </label>
              {/* Toggle */}
              <button
                type="button"
                onClick={() => { setDerivedFromBlog((v) => !v); setLinkedArticleId('') }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
                  ${derivedFromBlog ? 'bg-pink-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
                  ${derivedFromBlog ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
            </div>

            {derivedFromBlog && (
              <div className="space-y-3">
                <div className="relative">
                  <select
                    value={linkedArticleId}
                    onChange={(e) => handleArticleSelect(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  >
                    <option value="">Selecciona un artículo del mes…</option>
                    {blogArticles.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.fechaPublicacion} — {a.titulo.slice(0, 55)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400" />
                </div>

                {linkedArticleId && (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                      Derivado de blog
                    </Badge>
                    <button
                      type="button"
                      onClick={handleSuggest}
                      disabled={suggesting}
                      className="flex items-center gap-1 text-xs text-pink-600 hover:text-pink-700 font-medium"
                    >
                      {suggesting
                        ? <><Loader2 className="h-3 w-3 animate-spin" />Generando…</>
                        : <><Sparkles className="h-3 w-3" />Sugerir entradas con IA</>
                      }
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* IA Suggestions */}
          {suggestions.length > 0 && (
            <div className="rounded-xl border border-pink-200 bg-pink-50 p-4 space-y-3">
              <p className="text-xs font-semibold text-pink-900">
                ✨ Sugerencias de la IA — elige una para rellenar el formulario
              </p>
              <div className="space-y-2">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="w-full text-left rounded-lg border border-pink-200 bg-white hover:border-pink-400 hover:bg-pink-50 px-3 py-2.5 transition-colors space-y-0.5"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className="text-xs bg-gray-100 text-gray-700 border-gray-200">
                        {PLATFORM_LABELS[s.platform as Platform] ?? s.platform}
                      </Badge>
                      <span className="text-xs text-gray-500">{s.format}</span>
                    </div>
                    <p className="text-xs font-medium text-gray-800 mt-1">{s.title}</p>
                    <p className="text-xs text-gray-500 italic">{s.angle}</p>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSuggestions([])}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cerrar sugerencias
              </button>
            </div>
          )}

          {/* Link to social post (edit mode) */}
          {isEdit && entry?.social_post_id && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 flex items-center gap-2 text-xs text-blue-700">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span>Esta entrada tiene una pieza generada.</span>
              <button type="button" className="font-medium underline">Ver pieza →</button>
            </div>
          )}

          {/* Delete confirm */}
          {isEdit && showDeleteConfirm && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <p className="text-sm font-medium text-red-800">¿Eliminar esta entrada?</p>
              <p className="text-xs text-red-700">Esta acción no se puede deshacer.</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} className="text-xs h-7">
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleDelete} disabled={deleting}
                  className="text-xs gap-1 bg-red-600 hover:bg-red-700 text-white h-7">
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sí, eliminar'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-4 flex items-center justify-between shrink-0 bg-gray-50">
          <div>
            {isEdit && !showDeleteConfirm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs text-red-500 hover:text-red-700 gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white"
            >
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Guardando…</>
                : isEdit ? 'Guardar cambios' : 'Crear entrada'
              }
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
