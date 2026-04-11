'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, Sparkles, Filter, RefreshCw,
  Zap, CheckCircle2, Clock, Edit3, Eye, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import PostEditorDrawer from './PostEditorDrawer'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SocialPost {
  id                : string
  client_id         : string
  platform          : string
  format?           : string | null
  content_pillar?   : string | null
  scheduled_date?   : string | null
  hook?             : string | null
  copy_draft?       : string | null
  copy_approved?    : string | null
  visual_description?: string | null
  status?           : string | null
  humanized?        : boolean | null
  published_at?     : string | null
  created_at?       : string | null
}

interface Props {
  clientId: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  linkedin : 'LinkedIn', twitter_x: 'Twitter/X', instagram: 'Instagram',
  facebook : 'Facebook', tiktok   : 'TikTok',    youtube  : 'YouTube',
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin : 'bg-blue-600',  twitter_x: 'bg-gray-900', instagram: 'bg-purple-600',
  facebook : 'bg-blue-500',  tiktok   : 'bg-black',    youtube  : 'bg-red-600',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  borrador  : { label: 'Borrador',  color: 'text-gray-500 bg-gray-100',    icon: Edit3        },
  revision  : { label: 'Revisión',  color: 'text-amber-700 bg-amber-100',  icon: Clock        },
  aprobado  : { label: 'Aprobado',  color: 'text-green-700 bg-green-100',  icon: CheckCircle2 },
  publicado : { label: 'Publicado', color: 'text-blue-700 bg-blue-100',    icon: Eye          },
}

const PLATFORM_OPTIONS = ['', 'linkedin', 'twitter_x', 'instagram', 'facebook', 'tiktok', 'youtube']
const STATUS_OPTIONS   = ['', 'borrador', 'revision', 'aprobado', 'publicado']

// ─── Component ────────────────────────────────────────────────────────────────

export default function SocialPosts({ clientId }: Props) {
  const [posts,         setPosts]         = useState<SocialPost[]>([])
  const [loading,       setLoading]       = useState(true)
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [selectedPost,  setSelectedPost]  = useState<SocialPost | null>(null)
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [bulkOpen,      setBulkOpen]      = useState(false)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ clientId })
      if (filterPlatform) params.set('platform', filterPlatform)
      if (filterStatus)   params.set('status', filterStatus)
      const res = await fetch(`/api/social/posts?${params}`)
      if (res.ok) setPosts(await res.json() as SocialPost[])
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId, filterPlatform, filterStatus])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  function openNew() {
    setSelectedPost(null)
    setDrawerOpen(true)
  }

  function openEdit(post: SocialPost) {
    setSelectedPost(post)
    setDrawerOpen(true)
  }

  function handleSaved() {
    setDrawerOpen(false)
    fetchPosts()
  }

  const grouped = posts.reduce<Record<string, SocialPost[]>>((acc, p) => {
    const key = p.scheduled_date ?? '_sin_fecha'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  const sortedDates = Object.keys(grouped).sort((a, b) => {
    if (a === '_sin_fecha') return 1
    if (b === '_sin_fecha') return -1
    return a.localeCompare(b)
  })

  return (
    <div className="space-y-5">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Filter className="h-3.5 w-3.5" />
            <span className="font-medium">Filtrar:</span>
          </div>
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
          >
            <option value="">Todas las plataformas</option>
            {PLATFORM_OPTIONS.filter(Boolean).map((p) => (
              <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
          >
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
            ))}
          </select>
          <button
            onClick={fetchPosts}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            title="Recargar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkOpen(true)}
            className="text-xs gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
          >
            <Zap className="h-3.5 w-3.5" />
            Generar desde calendario
          </Button>
          <Button
            size="sm"
            onClick={openNew}
            className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva pieza
          </Button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const count = posts.filter((p) => p.status === status).length
          const Icon = cfg.icon
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(filterStatus === status ? '' : status)}
              className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm ${filterStatus === status ? 'ring-2 ring-pink-400 border-pink-300' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <Icon className={`h-4 w-4 ${cfg.color.split(' ')[0]}`} />
                <span className="text-xl font-bold text-gray-900">{count}</span>
              </div>
              <span className="text-xs text-gray-500">{cfg.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Cargando piezas…</span>
        </div>
      ) : posts.length === 0 ? (
        <EmptyState onNew={openNew} />
      ) : (
        <div className="space-y-6">
          {sortedDates.map((dateKey) => (
            <div key={dateKey}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {dateKey === '_sin_fecha'
                    ? 'Sin fecha programada'
                    : new Date(dateKey + 'T12:00:00').toLocaleDateString('es-ES', {
                        weekday: 'long', day: 'numeric', month: 'long',
                      })
                  }
                </div>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400">{grouped[dateKey].length} pieza{grouped[dateKey].length !== 1 ? 's' : ''}</span>
              </div>

              <div className="space-y-2">
                {grouped[dateKey].map((post) => (
                  <PostCard key={post.id} post={post} onEdit={() => openEdit(post)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Drawers ── */}
      <PostEditorDrawer
        open={drawerOpen}
        clientId={clientId}
        post={selectedPost}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />

      {bulkOpen && (
        <BulkFromCalendarModal
          clientId={clientId}
          onClose={() => setBulkOpen(false)}
          onGenerated={() => { setBulkOpen(false); fetchPosts() }}
        />
      )}
    </div>
  )
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post, onEdit }: { post: SocialPost; onEdit: () => void }) {
  const statusCfg = STATUS_CONFIG[post.status ?? 'borrador'] ?? STATUS_CONFIG.borrador
  const StatusIcon = statusCfg.icon

  const copyPreview = post.copy_approved || post.copy_draft || ''
  const preview = copyPreview.length > 120 ? copyPreview.slice(0, 120) + '…' : copyPreview

  return (
    <div
      onClick={onEdit}
      className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-pink-300 hover:shadow-sm transition-all group"
    >
      {/* Platform badge */}
      <div className={`mt-0.5 h-7 w-7 rounded-lg ${PLATFORM_COLORS[post.platform] ?? 'bg-gray-600'} flex items-center justify-center shrink-0`}>
        <span className="text-white text-xs font-bold">
          {(PLATFORM_LABELS[post.platform] ?? post.platform).slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-semibold text-gray-700">
            {PLATFORM_LABELS[post.platform] ?? post.platform}
          </span>
          {post.format && (
            <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">
              {post.format}
            </span>
          )}
          {post.content_pillar && (
            <span className="text-xs text-pink-700 bg-pink-50 px-1.5 py-0.5 rounded-md border border-pink-100">
              {post.content_pillar}
            </span>
          )}
          {post.humanized && (
            <span className="text-xs text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md border border-teal-100">
              ✓ humanizado
            </span>
          )}
        </div>

        {post.hook && (
          <p className="text-sm font-medium text-gray-900 mb-0.5 line-clamp-1">{post.hook}</p>
        )}
        {preview ? (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{preview}</p>
        ) : (
          <p className="text-xs text-gray-400 italic">Sin copy generado</p>
        )}
      </div>

      {/* Status */}
      <div className={`shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${statusCfg.color}`}>
        <StatusIcon className="h-3 w-3" />
        {statusCfg.label}
      </div>
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-14 w-14 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center mb-4">
        <Edit3 className="h-7 w-7 text-pink-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-800 mb-2">Sin piezas todavía</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-xs">
        Crea piezas de contenido individualmente o genera un lote completo con IA.
      </p>
      <Button size="sm" onClick={onNew} className="gap-1.5 bg-pink-600 hover:bg-pink-700 text-white">
        <Plus className="h-3.5 w-3.5" />
        Crear primera pieza
      </Button>
    </div>
  )
}

// ─── Bulk Generate from Calendar Modal ───────────────────────────────────────

interface CalendarEntry {
  id            : string
  platform      : string
  format?       : string | null
  title?        : string | null
  description?  : string | null
  scheduled_date: string
  content_type? : string | null
  social_post_id?: string | null
}

function toYYYYMM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function BulkFromCalendarModal({
  clientId,
  onClose,
  onGenerated,
}: {
  clientId   : string
  onClose    : () => void
  onGenerated: () => void
}) {
  const [calendarMonth,   setCalendarMonth]   = useState<string>(() => toYYYYMM(new Date()))
  const [entries,         setEntries]         = useState<CalendarEntry[]>([])
  const [selected,        setSelected]        = useState<Set<string>>(new Set())
  const [loadingEntries,  setLoadingEntries]  = useState(false)
  const [fetchError,      setFetchError]      = useState('')
  const [generating,      setGenerating]      = useState(false)
  const [genError,        setGenError]        = useState('')
  const [result,          setResult]          = useState<{ created: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingEntries(true)
      setFetchError('')
      try {
        const res = await fetch(`/api/social/calendar?clientId=${clientId}&month=${calendarMonth}`)
        if (!res.ok) throw new Error('Error al cargar el calendario')
        const data = (await res.json()) as CalendarEntry[]
        if (cancelled) return
        const unlinked = data.filter((e) => !e.social_post_id)
        setEntries(unlinked)
        setSelected(new Set(unlinked.map((e) => e.id)))
      } catch (err) {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : 'Error')
      } finally {
        if (!cancelled) setLoadingEntries(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [clientId, calendarMonth])

  function toggleEntry(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(selected.size === entries.length ? new Set() : new Set(entries.map((e) => e.id)))
  }

  async function handleGenerate() {
    const ids = Array.from(selected)
    if (!ids.length) return
    setGenerating(true)
    setGenError('')
    try {
      const res = await fetch('/api/social/generate-posts-bulk', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, calendarEntryIds: ids }),
      })
      const data = await res.json() as { created: number } | { error: string }
      if (!res.ok) throw new Error((data as any).error)
      setResult(data as { created: number })
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Error al generar')
    } finally {
      setGenerating(false)
    }
  }

  function formatDate(s: string) {
    return new Date(s + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const selectedCount = selected.size

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Generar desde el calendario</h2>
            <p className="text-xs text-gray-500 mt-0.5">Genera copys para las entradas del calendario sin pieza</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>

        {result ? (
          /* ── Success state ── */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {result.created} pieza{result.created !== 1 ? 's' : ''} generada{result.created !== 1 ? 's' : ''}
            </h3>
            <p className="text-sm text-gray-500 mb-6">El copy está listo para revisar y ajustar.</p>
            <Button onClick={onGenerated} className="bg-pink-600 hover:bg-pink-700 text-white">
              Ver piezas
            </Button>
          </div>
        ) : (
          <>
            {/* Month selector */}
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500">Mes:</label>
              <input
                type="month"
                value={calendarMonth}
                onChange={(e) => setCalendarMonth(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              {!loadingEntries && entries.length > 0 && (
                <span className="text-xs text-gray-400 ml-auto">
                  {entries.length} entrada{entries.length !== 1 ? 's' : ''} sin pieza
                </span>
              )}
            </div>

            {/* Entry list */}
            <div className="flex-1 overflow-y-auto p-5">
              {loadingEntries ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Cargando entradas…</span>
                </div>
              ) : fetchError ? (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {fetchError}
                </div>
              ) : entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                    <Zap className="h-6 w-6 text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">Sin entradas pendientes</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs">
                    No hay entradas en el calendario sin pieza generada para este mes.
                    Añade entradas en el Calendario primero.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Select-all row */}
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <input
                      type="checkbox"
                      checked={selectedCount === entries.length && entries.length > 0}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded accent-violet-600"
                    />
                    <span className="text-xs font-medium text-gray-500">
                      {selectedCount === entries.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                    </span>
                  </div>

                  {entries.map((entry) => (
                    <label
                      key={entry.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selected.has(entry.id)
                          ? 'border-violet-200 bg-violet-50'
                          : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(entry.id)}
                        onChange={() => toggleEntry(entry.id)}
                        className="mt-0.5 h-3.5 w-3.5 rounded accent-violet-600 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-gray-700">
                            {formatDate(entry.scheduled_date)}
                          </span>
                          <span className="text-xs text-gray-400">—</span>
                          <span className="text-xs text-gray-600">
                            {PLATFORM_LABELS[entry.platform] ?? entry.platform}
                          </span>
                          {entry.format && (
                            <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                              {entry.format}
                            </span>
                          )}
                        </div>
                        {entry.title && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{entry.title}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {genError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3 mt-3">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {genError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {selectedCount > 0 ? `${selectedCount} seleccionada${selectedCount !== 1 ? 's' : ''}` : 'Nada seleccionado'}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose} className="text-xs text-gray-500">
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating || selectedCount === 0}
                  className="text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
                >
                  {generating
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                    : <><Sparkles className="h-3.5 w-3.5" /> Generar seleccionadas ({selectedCount})</>
                  }
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
