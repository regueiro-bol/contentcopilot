'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Loader2, FileText,
  AlertCircle, X, Sparkles, ClipboardList, Settings, List,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PLATFORMS, PLATFORM_LABELS, PLATFORM_COLORS, STATUS_COLORS,
  type Platform,
} from '@/lib/social/platforms'
import CalendarEntryDrawer, {
  type CalendarEntry, type BlogArticle,
} from './CalendarEntryDrawer'
import CalendarDraftReview, {
  type DraftEntry, type DraftStats,
} from './CalendarDraftReview'
import PostEditorDrawer from './PostEditorDrawer'
import DayPostsPanel from './DayPostsPanel'
import PostLightbox from './PostLightbox'
import type { SocialPost } from './SocialPosts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  clientId          : string
  autoOpenPlanModal?: boolean
}

interface GeneratedDraft {
  id        : string
  mode      : 'initial' | 'maintenance'
  start_date: string
  end_date  : string
  entries   : DraftEntry[]
  stats     : DraftStats
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMonth(year: number, month: number): string {
  return new Date(year, month - 1, 1)
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase())
}

function toMonthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Returns weekday of 1st day of month, Mon=0, Sun=6 */
function getFirstDayOffset(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay()
  return (day + 6) % 7 // shift Sunday from 0 → 6
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Quick period helpers */
function getNextTwoWeeks(): [string, string] {
  const today = new Date()
  const end   = new Date(today)
  end.setDate(today.getDate() + 13)
  return [toISODate(today), toISODate(end)]
}

function getThisMonth(): [string, string] {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return [toISODate(start), toISODate(end)]
}

function getNextMonth(): [string, string] {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const end   = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  return [toISODate(start), toISODate(end)]
}

function getThisWeek(): [string, string] {
  const today     = new Date()
  const dayOfWeek = (today.getDay() + 6) % 7 // Mon=0
  const monday    = new Date(today)
  monday.setDate(today.getDate() - dayOfWeek)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return [toISODate(monday), toISODate(sunday)]
}

function computeStats(entries: DraftEntry[]): DraftStats {
  const byPlatform: Record<string, number> = {}
  for (const e of entries) {
    byPlatform[e.platform] = (byPlatform[e.platform] ?? 0) + 1
  }
  return {
    totalEntries: entries.length,
    byPlatform,
    blogDerived: entries.filter((e) => e.blogContenidoId).length,
    daysCount  : Array.from(new Set(entries.map((e) => e.scheduledDate))).length,
  }
}

const TODAY    = new Date().toISOString().split('T')[0]
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Dot colours for the linked social_post status (shown inside calendar chips) */
const POST_STATUS_CHIP: Record<string, { dot: string; faded?: boolean; showCheck?: boolean }> = {
  borrador     : { dot: 'bg-gray-300' },
  en_produccion: { dot: 'bg-yellow-300' },
  aprobado     : { dot: 'bg-green-400' },
  en_diseno    : { dot: 'bg-orange-400' },
  listo        : { dot: 'bg-emerald-400' },
  publicado    : { dot: 'bg-green-300', faded: true, showCheck: true },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SocialCalendar({ clientId, autoOpenPlanModal }: Props) {
  const now    = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  // Calendar view (mes | semana | lista)
  const [calView, setCalView] = useState<'mes' | 'semana' | 'lista'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('social_calendar_view') as 'mes' | 'semana' | 'lista') ?? 'mes'
    }
    return 'mes'
  })

  // Week view: track the Monday of the currently-visible week
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d   = new Date()
    const dow = (d.getDay() + 6) % 7 // Mon=0
    d.setDate(d.getDate() - dow)
    d.setHours(0, 0, 0, 0)
    return d
  })

  // Data
  const [entries,      setEntries]      = useState<CalendarEntry[]>([])
  const [blogArticles, setBlogArticles] = useState<BlogArticle[]>([])
  const [uncovered,    setUncovered]    = useState<BlogArticle[]>([])
  const [loading,      setLoading]      = useState(false)

  // Active platform filter (all active by default)
  const [activePlatformFilters, setActivePlatformFilters] = useState<Set<Platform>>(
    new Set(PLATFORMS)
  )

  // Drawer state
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [editingEntry,  setEditingEntry]  = useState<CalendarEntry | null>(null)
  const [clickedDate,   setClickedDate]   = useState<string | undefined>()

  // Post editor drawer (opened from calendar chips that have a social_post_id)
  const [postEditorOpen,  setPostEditorOpen]  = useState(false)
  const [editingPost,     setEditingPost]     = useState<SocialPost | null>(null)
  const [loadingPostId,   setLoadingPostId]   = useState<string | null>(null)

  // Day posts panel (mini-gallery for a specific day)
  const [dayPanelOpen,    setDayPanelOpen]    = useState(false)
  const [dayPanelDate,    setDayPanelDate]    = useState('')
  const [dayPanelEntries, setDayPanelEntries] = useState<CalendarEntry[]>([])

  // Lightbox (opened from chip click or DayPostsPanel card)
  const [lightboxPost,  setLightboxPost]  = useState<SocialPost | null>(null)
  const [lightboxPosts, setLightboxPosts] = useState<SocialPost[]>([])

  // Uncovered articles panel
  const [showUncovered, setShowUncovered] = useState(false)

  // ── Plan modal state ──
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [planStart,     setPlanStart]     = useState('')
  const [planEnd,       setPlanEnd]       = useState('')
  const [planMode,      setPlanMode]      = useState<'initial' | 'maintenance'>('initial')
  const [planLoading,   setPlanLoading]   = useState(false)
  const [planError,     setPlanError]     = useState('')

  // ── Draft review state ──
  const [activeDraft,  setActiveDraft]  = useState<GeneratedDraft | null>(null)
  const [pendingDraft, setPendingDraft] = useState<GeneratedDraft | null>(null)

  // Active platforms for the client (based on entries + all platforms as fallback)
  const clientPlatforms = useMemo<Platform[]>(() => {
    const fromEntries = new Set(entries.map((e) => e.platform as Platform))
    return PLATFORMS.filter((p) => fromEntries.has(p) || fromEntries.size === 0)
  }, [entries])

  // ── Fetch calendar data ──

  const fetchData = useCallback(async () => {
    setLoading(true)
    const monthParam = toMonthParam(year, month)
    try {
      const [calRes, blogRes, uncovRes] = await Promise.all([
        fetch(`/api/social/calendar?clientId=${clientId}&month=${monthParam}`),
        fetch(`/api/social/blog-articles?clientId=${clientId}&month=${monthParam}`),
        fetch(`/api/social/uncovered-articles?clientId=${clientId}&month=${monthParam}`),
      ])
      const [calData, blogData, uncovData] = await Promise.all([
        calRes.ok   ? calRes.json()   : [],
        blogRes.ok  ? blogRes.json()  : [],
        uncovRes.ok ? uncovRes.json() : [],
      ])
      setEntries(calData)
      setBlogArticles(blogData)
      setUncovered(uncovData)
    } catch (err) {
      console.error('[SocialCalendar] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [clientId, year, month])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Fetch pending draft ──

  const fetchPendingDraft = useCallback(async () => {
    try {
      const res = await fetch(`/api/social/calendar-drafts?clientId=${clientId}&status=pending`)
      if (!res.ok) return
      const data = await res.json() as Array<{
        id: string; mode: 'initial' | 'maintenance'; start_date: string
        end_date: string; proposed_entries: DraftEntry[]
      }>
      if (data.length > 0) {
        const d = data[0]
        const draftEntries = d.proposed_entries ?? []
        setPendingDraft({
          id        : d.id,
          mode      : d.mode,
          start_date: d.start_date,
          end_date  : d.end_date,
          entries   : draftEntries,
          stats     : computeStats(draftEntries),
        })
      } else {
        setPendingDraft(null)
      }
    } catch { /* silencioso */ }
  }, [clientId])

  useEffect(() => { fetchPendingDraft() }, [fetchPendingDraft])

  // ── Auto-open plan modal if requested ──

  useEffect(() => {
    if (autoOpenPlanModal) {
      // Small delay to let data load first
      const t = setTimeout(() => openPlanModal(), 400)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenPlanModal])

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('social_calendar_view', calView)
  }, [calView])

  // ── Navigation ──

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
  }
  function goToday() {
    setYear(now.getFullYear())
    setMonth(now.getMonth() + 1)
    // Also snap weekStart to the current week
    const d   = new Date()
    const dow = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - dow)
    d.setHours(0, 0, 0, 0)
    setWeekStart(new Date(d))
  }

  function prevWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 7)
      // If the new week falls in a different month, navigate there
      const mid = new Date(d); mid.setDate(mid.getDate() + 3) // midweek
      setYear(mid.getFullYear())
      setMonth(mid.getMonth() + 1)
      return d
    })
  }

  function nextWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev)
      d.setDate(d.getDate() + 7)
      const mid = new Date(d); mid.setDate(mid.getDate() + 3)
      setYear(mid.getFullYear())
      setMonth(mid.getMonth() + 1)
      return d
    })
  }

  // ── Platform filter toggle ──

  function togglePlatformFilter(p: Platform) {
    setActivePlatformFilters((prev) => {
      const next = new Set(prev)
      if (next.has(p)) {
        if (next.size > 1) next.delete(p) // keep at least one active
      } else {
        next.add(p)
      }
      return next
    })
  }

  // ── Drawer helpers ──

  function openCreate(date?: string) {
    setEditingEntry(null)
    setClickedDate(date)
    setDrawerOpen(true)
  }

  function openEdit(entry: CalendarEntry) {
    setEditingEntry(entry)
    setClickedDate(undefined)
    setDrawerOpen(true)
  }

  /** Chip click: opens Lightbox directly if entry has social_post_id, else CalendarEntryDrawer */
  async function handleChipClick(entry: CalendarEntry) {
    if (!entry.social_post_id) { openEdit(entry); return }
    setLoadingPostId(entry.social_post_id)
    try {
      const res = await fetch(`/api/social/posts?postId=${entry.social_post_id}`)
      if (!res.ok) throw new Error('No se pudo cargar la pieza')
      const post = await res.json() as SocialPost
      setLightboxPosts([post])
      setLightboxPost(post)
    } catch {
      openEdit(entry)
    } finally {
      setLoadingPostId(null)
    }
  }

  /** Called from Lightbox "Editar" button — close lightbox, open PostEditorDrawer */
  function handleLightboxEdit(post: SocialPost) {
    setLightboxPost(null)
    setLightboxPosts([])
    setEditingPost(post)
    setPostEditorOpen(true)
  }

  /** Day number click: opens DayPostsPanel if day has linked posts, else opens create drawer */
  function handleDayClick(dateStr: string, dayEntries: CalendarEntry[]) {
    const hasLinkedPosts = dayEntries.some((e) => e.social_post_id)
    if (hasLinkedPosts) {
      setDayPanelDate(dateStr)
      setDayPanelEntries(dayEntries)
      setDayPanelOpen(true)
    } else {
      openCreate(dateStr)
    }
  }

  function handleSaved(saved: CalendarEntry) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = saved; return next
      }
      return [...prev, saved].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    })
    fetchData()
  }

  function handleDeleted(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    fetchData()
  }

  // ── Plan modal helpers ──

  function openPlanModal() {
    const suggestedMode: 'initial' | 'maintenance' = entries.length > 0 ? 'maintenance' : 'initial'
    const [s, e] = getNextTwoWeeks()
    setPlanMode(suggestedMode)
    setPlanStart(s)
    setPlanEnd(e)
    setPlanError('')
    setShowPlanModal(true)
  }

  function applyQuickPeriod(option: 'week' | '2weeks' | 'month' | 'nextmonth') {
    const ranges = {
      week     : getThisWeek,
      '2weeks' : getNextTwoWeeks,
      month    : getThisMonth,
      nextmonth: getNextMonth,
    }
    const [s, e] = ranges[option]()
    setPlanStart(s)
    setPlanEnd(e)
  }

  async function handleGenerate() {
    if (!planStart || !planEnd) return
    setPlanLoading(true)
    setPlanError('')
    try {
      const res = await fetch('/api/social/generate-calendar', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, startDate: planStart, endDate: planEnd, mode: planMode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al generar')
      setShowPlanModal(false)
      setActiveDraft({
        id        : data.draftId,
        mode      : planMode,
        start_date: planStart,
        end_date  : planEnd,
        entries   : data.entries,
        stats     : data.stats,
      })
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Error al generar el borrador')
    } finally {
      setPlanLoading(false)
    }
  }

  function handleDraftApprove() {
    setActiveDraft(null)
    setPendingDraft(null)
    fetchData()
  }

  function handleDraftDiscard() {
    setActiveDraft(null)
    setPendingDraft(null)
  }

  // ── Grid computation ──

  const daysInMonth    = getDaysInMonth(year, month)
  const firstDayOffset = getFirstDayOffset(year, month)

  const entriesByDate = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {}
    for (const e of entries) {
      if (!activePlatformFilters.has(e.platform as Platform)) continue
      if (!map[e.scheduled_date]) map[e.scheduled_date] = []
      map[e.scheduled_date].push(e)
    }
    return map
  }, [entries, activePlatformFilters])

  const articlesByDate = useMemo(() => {
    const map: Record<string, BlogArticle[]> = {}
    for (const a of blogArticles) {
      if (!map[a.fechaPublicacion]) map[a.fechaPublicacion] = []
      map[a.fechaPublicacion].push(a)
    }
    return map
  }, [blogArticles])

  // ── Render ──

  return (
    <>
      <div className="space-y-4">

        {/* ── Pending draft banner ── */}
        {pendingDraft && !activeDraft && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ClipboardList className="h-4 w-4 text-blue-600 shrink-0" />
              <p className="text-sm text-blue-800">
                <span className="font-medium">Tienes un borrador pendiente de revisión</span>
                {' '}para el período {pendingDraft.start_date} – {pendingDraft.end_date}
                {' '}({pendingDraft.stats.totalEntries} entradas).
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setActiveDraft(pendingDraft)}
              className="shrink-0 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Revisar borrador
            </Button>
          </div>
        )}

        {/* ── Uncovered articles banner ── */}
        {uncovered.length > 0 && !showUncovered && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">
                <span className="font-medium">{uncovered.length} artículo{uncovered.length > 1 ? 's' : ''} del blog</span>
                {' '}este mes sin piezas sociales.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowUncovered(true)}
              className="shrink-0 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
            >
              Ver artículos sin cobertura
            </Button>
          </div>
        )}

        {/* ── Uncovered articles panel ── */}
        {showUncovered && (
          <div className="rounded-xl border border-amber-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-800">
                Artículos sin cobertura social este mes
              </h4>
              <button onClick={() => setShowUncovered(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {uncovered.map((a) => (
                <div key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{a.titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {a.fechaPublicacion}
                      {a.keyword && ` · ${a.keyword}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowUncovered(false)
                      setClickedDate(a.fechaPublicacion)
                      setEditingEntry(null)
                      setDrawerOpen(true)
                    }}
                    className="shrink-0 text-xs text-pink-600 border-pink-300 hover:bg-pink-50"
                  >
                    Sugerir piezas
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Calendar card ── */}
        <div className="bg-white rounded-xl border border-gray-200">

          {/* ── Toolbar ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">

            {/* Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={calView === 'semana' ? prevWeek : prevMonth}
                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-gray-100 text-gray-600 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h3 className="text-sm font-semibold text-gray-900 min-w-[160px] text-center">
                {calView === 'semana'
                  ? (() => {
                      const end = new Date(weekStart); end.setDate(end.getDate() + 6)
                      const sStr = weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                      const eStr = end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
                      return `${sStr} – ${eStr}`
                    })()
                  : formatMonth(year, month)
                }
              </h3>
              <button
                onClick={calView === 'semana' ? nextWeek : nextMonth}
                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-gray-100 text-gray-600 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={goToday}
                className="px-2.5 py-1 rounded-md text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
              >
                Hoy
              </button>
            </div>

            {/* Right: view selector + action buttons */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                {(['mes', 'semana', 'lista'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCalView(v)}
                    className={`px-3 py-1.5 font-medium capitalize transition-colors ${
                      calView === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Lista'}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                onClick={openPlanModal}
                className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Planificar período
              </Button>
              <Button
                size="sm"
                onClick={() => openCreate()}
                className="gap-1.5 text-xs bg-pink-600 hover:bg-pink-700 text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Nueva entrada
              </Button>
            </div>
          </div>

          {/* ── Platform filters ── */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100">
            <span className="text-xs text-gray-400 mr-1">Plataformas:</span>
            {PLATFORMS.map((p) => {
              const active = activePlatformFilters.has(p)
              const colors = PLATFORM_COLORS[p]
              return (
                <button
                  key={p}
                  onClick={() => togglePlatformFilter(p)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                    ${active
                      ? `${colors.bg} ${colors.text} border-transparent`
                      : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                    }`}
                >
                  {PLATFORM_LABELS[p]}
                </button>
              )
            })}
          </div>

          {/* ── Loading overlay ── */}
          {loading && (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando calendario…</span>
            </div>
          )}

          {/* ── Calendar grid (Mes) ── */}
          {!loading && calView === 'mes' && (
            <div className="p-4">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((d, i) => (
                  <div key={d} className={`text-center text-xs font-medium py-2
                    ${i >= 5 ? 'text-gray-400' : 'text-gray-500'}`}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
                {Array.from({ length: firstDayOffset }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-gray-50 min-h-[120px]" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day      = i + 1
                  const dateStr  = toDateStr(year, month, day)
                  const isToday  = dateStr === TODAY
                  const isWeekend = ((firstDayOffset + i) % 7) >= 5
                  const dayEntries  = entriesByDate[dateStr]  ?? []
                  const dayArticles = articlesByDate[dateStr] ?? []
                  return (
                    <DayCell
                      key={dateStr}
                      day={day}
                      dateStr={dateStr}
                      isToday={isToday}
                      isWeekend={isWeekend}
                      entries={dayEntries}
                      articles={dayArticles}
                      loadingPostId={loadingPostId}
                      onClickDay={() => handleDayClick(dateStr, dayEntries)}
                      onClickEntry={handleChipClick}
                      onClickSettings={openEdit}
                    />
                  )
                })}
                {(() => {
                  const totalCells = firstDayOffset + daysInMonth
                  const remainder  = totalCells % 7
                  const fillCells  = remainder === 0 ? 0 : 7 - remainder
                  return Array.from({ length: fillCells }).map((_, i) => (
                    <div key={`fill-${i}`} className="bg-gray-50 min-h-[120px]" />
                  ))
                })()}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 mt-4 px-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <div className="h-2.5 w-2.5 rounded-sm bg-green-100 border border-green-300" />
                  Artículo del blog
                </div>
                {Object.entries(STATUS_COLORS).map(([s, c]) => (
                  <div key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <div className={`h-2 w-2 rounded-full ${c.dot}`} />
                    {c.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Week view ── */}
          {!loading && calView === 'semana' && (
            <WeekView
              weekStart       = {weekStart}
              entriesByDate   = {entriesByDate}
              articlesByDate  = {articlesByDate}
              loadingPostId   = {loadingPostId}
              onClickEntry    = {handleChipClick}
              onClickSettings = {openEdit}
              onClickDay      = {handleDayClick}
              onCreateDay     = {openCreate}
            />
          )}

          {/* ── List view ── */}
          {!loading && calView === 'lista' && (
            <ListView
              entries         = {entries}
              loadingPostId   = {loadingPostId}
              onClickEntry    = {handleChipClick}
              onClickSettings = {openEdit}
            />
          )}
        </div>

        {/* ── Calendar entry drawer (metadata edit) ── */}
        <CalendarEntryDrawer
          open            = {drawerOpen}
          clientId        = {clientId}
          entry           = {editingEntry}
          defaultDate     = {clickedDate}
          blogArticles    = {blogArticles}
          activePlatforms = {clientPlatforms}
          onClose         = {() => setDrawerOpen(false)}
          onSaved         = {handleSaved}
          onDeleted       = {handleDeleted}
        />

        {/* ── Post editor drawer (opened from chip click when post exists) ── */}
        <PostEditorDrawer
          open     = {postEditorOpen}
          clientId = {clientId}
          post     = {editingPost}
          onClose  = {() => { setPostEditorOpen(false); setEditingPost(null) }}
          onSaved  = {() => { setPostEditorOpen(false); setEditingPost(null); fetchData() }}
        />
      </div>

      {/* ── Day posts panel ── */}
      {dayPanelOpen && (
        <DayPostsPanel
          date           = {dayPanelDate}
          clientId       = {clientId}
          entries        = {dayPanelEntries}
          onClose        = {() => setDayPanelOpen(false)}
          onPostUpdated  = {fetchData}
          onOpenLightbox = {(post, allPosts) => {
            setLightboxPosts(allPosts)
            setLightboxPost(post)
          }}
        />
      )}

      {/* ── Lightbox (from chip click or DayPostsPanel card) ── */}
      {lightboxPost && (
        <PostLightbox
          post         = {lightboxPost}
          posts        = {lightboxPosts}
          onClose      = {() => { setLightboxPost(null); setLightboxPosts([]) }}
          onApprove    = {() => fetchData()}
          onReject     = {() => fetchData()}
          onEdit       = {handleLightboxEdit}
          onPostUpdated= {(updated) => {
            setLightboxPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
            setLightboxPost(prev => prev && prev.id === updated.id ? updated : prev)
            fetchData()
          }}
        />
      )}

      {/* ── Plan modal ── */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                </div>
                <h2 className="text-sm font-bold text-gray-900">Generar borrador de calendario</h2>
              </div>
              <button
                onClick={() => { setShowPlanModal(false); setPlanError('') }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Period selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
                  Período
                </label>
                {/* Quick options */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {([
                    { key: 'week',      label: 'Esta semana' },
                    { key: '2weeks',    label: 'Próximas 2 semanas' },
                    { key: 'month',     label: 'Este mes' },
                    { key: 'nextmonth', label: 'Próximo mes' },
                  ] as const).map(({ key, label }) => {
                    const [s, e] = key === 'week' ? getThisWeek() : key === '2weeks' ? getNextTwoWeeks() : key === 'month' ? getThisMonth() : getNextMonth()
                    const isActive = planStart === s && planEnd === e
                    return (
                      <button
                        key={key}
                        onClick={() => applyQuickPeriod(key)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left
                          ${isActive
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-violet-300 hover:text-violet-700'
                          }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                {/* Custom range */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Desde</label>
                    <input
                      type="date"
                      value={planStart}
                      onChange={(e) => setPlanStart(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Hasta</label>
                    <input
                      type="date"
                      value={planEnd}
                      onChange={(e) => setPlanEnd(e.target.value)}
                      min={planStart}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                  </div>
                </div>
              </div>

              {/* Mode selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Modo
                </label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                    ${planMode === 'initial' ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input
                      type="radio"
                      checked={planMode === 'initial'}
                      onChange={() => setPlanMode('initial')}
                      className="mt-0.5 accent-violet-600"
                    />
                    <div>
                      <p className="text-xs font-semibold text-gray-800">Arranque inicial</p>
                      <p className="text-xs text-gray-500 mt-0.5">Para clientes nuevos o períodos sin historial previo.</p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                    ${planMode === 'maintenance' ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input
                      type="radio"
                      checked={planMode === 'maintenance'}
                      onChange={() => setPlanMode('maintenance')}
                      className="mt-0.5 accent-violet-600"
                    />
                    <div>
                      <p className="text-xs font-semibold text-gray-800">Mantenimiento</p>
                      <p className="text-xs text-gray-500 mt-0.5">Para clientes activos. Considera historial y métricas para variar el contenido.</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Error */}
              {planError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {planError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowPlanModal(false); setPlanError('') }}
                className="text-xs text-gray-500"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={planLoading || !planStart || !planEnd}
                className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
              >
                {planLoading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                  : <><Sparkles className="h-3.5 w-3.5" /> Generar borrador</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Draft review overlay ── */}
      {activeDraft && (
        <CalendarDraftReview
          clientId  = {clientId}
          draft     = {activeDraft}
          onApprove = {handleDraftApprove}
          onDiscard = {handleDraftDiscard}
        />
      )}
    </>
  )
}

// ─── DayCell sub-component ────────────────────────────────────────────────────

interface DayCellProps {
  day             : number
  dateStr         : string
  isToday         : boolean
  isWeekend       : boolean
  entries         : CalendarEntry[]
  articles        : BlogArticle[]
  loadingPostId   : string | null
  onClickDay      : () => void
  onClickEntry    : (entry: CalendarEntry) => void  // smart: PostEditor or CalendarDrawer
  onClickSettings : (entry: CalendarEntry) => void  // always CalendarEntryDrawer
}

const MAX_VISIBLE = 2

function DayCell({
  day, dateStr, isToday, isWeekend,
  entries, articles, loadingPostId,
  onClickDay, onClickEntry, onClickSettings,
}: DayCellProps) {
  const [showAll, setShowAll] = useState(false)

  const totalItems     = entries.length + articles.length
  const visibleEntries = showAll ? entries : entries.slice(0, Math.max(0, MAX_VISIBLE - articles.length))
  const overflow       = !showAll && totalItems > MAX_VISIBLE
    ? totalItems - Math.min(MAX_VISIBLE, articles.length + entries.length)
    : 0

  return (
    <div
      className={`min-h-[120px] p-1.5 flex flex-col transition-colors cursor-pointer group
        ${isToday   ? 'bg-pink-50'  : isWeekend ? 'bg-gray-50/60' : 'bg-white'}
        hover:bg-blue-50/30
      `}
      onClick={onClickDay}
    >
      {/* Day number */}
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full
          ${isToday
            ? 'bg-pink-600 text-white'
            : isWeekend
              ? 'text-gray-400'
              : 'text-gray-700'
          }`}>
          {day}
        </span>
        {/* Quick add button on hover */}
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-pink-500">
          <Plus className="h-3 w-3" />
        </span>
      </div>

      {/* Blog article chips */}
      {articles.map((a) => (
        <div
          key={a.id}
          onClick={(e) => e.stopPropagation()}
          title={`${a.titulo}\nEstado: ${a.status}`}
          className="flex items-center gap-1 rounded px-1 py-0.5 bg-green-100 border border-green-300 text-green-800 mb-0.5 cursor-default"
        >
          <FileText className="h-2.5 w-2.5 shrink-0" />
          <span className="text-xs truncate leading-tight">{a.titulo}</span>
        </div>
      ))}

      {/* Social entry chips */}
      {visibleEntries.map((entry) => {
        const colors        = PLATFORM_COLORS[entry.platform as Platform]
        const postIndicator = entry.post_status ? POST_STATUS_CHIP[entry.post_status] : null
        const calIndicator  = STATUS_COLORS[entry.status]
        const dotClass      = postIndicator?.dot ?? calIndicator?.dot ?? 'bg-white/60'
        const isLoading     = loadingPostId !== null && loadingPostId === entry.social_post_id
        const hasImage      = !!entry.post_asset_url
        const hasSocialPost = !!entry.social_post_id

        return (
          <div
            key={entry.id}
            onClick={(e) => e.stopPropagation()}
            className={`flex items-center rounded mb-0.5 overflow-hidden
              ${colors.bg} ${colors.text}
              ${postIndicator?.faded ? 'opacity-50' : 'opacity-90 hover:opacity-100'}
            `}
          >
            {/* Main area: click → PostEditorDrawer (if linked post) or CalendarEntryDrawer */}
            <button
              className="flex items-center gap-1 px-1 py-0.5 flex-1 min-w-0 hover:bg-black/10 transition-colors"
              onClick={() => onClickEntry(entry)}
              title={hasSocialPost ? 'Ver/editar pieza social' : 'Ver entrada del calendario'}
            >
              {isLoading
                ? <Loader2 className="h-1.5 w-1.5 shrink-0 animate-spin" />
                : <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
              }
              <span className="text-xs truncate leading-tight">
                {entry.title ?? PLATFORM_LABELS[entry.platform as Platform]}
              </span>
              {hasImage && <span className="text-[9px] shrink-0 ml-0.5">🖼</span>}
              {postIndicator?.showCheck && <span className="text-[9px] shrink-0">✓</span>}
            </button>

            {/* Gear button: always opens CalendarEntryDrawer for metadata */}
            <button
              className="px-1 py-0.5 hover:bg-black/15 transition-colors shrink-0"
              onClick={() => onClickSettings(entry)}
              title="Editar metadatos del calendario"
            >
              <Settings className="h-2.5 w-2.5 opacity-50" />
            </button>
          </div>
        )
      })}

      {/* Overflow chip */}
      {overflow > 0 && !showAll && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowAll(true) }}
          className="text-xs text-gray-400 hover:text-gray-700 text-left px-1 mt-0.5"
        >
          +{overflow} más
        </button>
      )}
      {showAll && totalItems > MAX_VISIBLE && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowAll(false) }}
          className="text-xs text-gray-400 hover:text-gray-700 text-left px-1 mt-0.5"
        >
          Ver menos
        </button>
      )}
    </div>
  )
}

// ─── WeekView sub-component ───────────────────────────────────────────────────

const WEEK_MAX_VISIBLE = 3

interface WeekViewProps {
  weekStart      : Date
  entriesByDate  : Record<string, CalendarEntry[]>
  articlesByDate : Record<string, BlogArticle[]>
  loadingPostId  : string | null
  onClickEntry   : (entry: CalendarEntry) => void
  onClickSettings: (entry: CalendarEntry) => void
  onClickDay     : (dateStr: string, entries: CalendarEntry[]) => void
  onCreateDay    : (dateStr: string) => void
}

function WeekView({
  weekStart, entriesByDate, articlesByDate, loadingPostId,
  onClickEntry, onClickSettings, onClickDay, onCreateDay,
}: WeekViewProps) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="p-4 overflow-x-auto">
      <div className="grid grid-cols-7 gap-2 min-w-[700px]">
        {days.map((day, i) => {
          const dateStr    = toISODate(day)
          const isToday    = dateStr === TODAY
          const isWeekend  = i >= 5
          const dayEntries = entriesByDate[dateStr] ?? []
          const dayArticles= articlesByDate[dateStr] ?? []

          return (
            <WeekDayColumn
              key={dateStr}
              day={day}
              dateStr={dateStr}
              isToday={isToday}
              isWeekend={isWeekend}
              entries={dayEntries}
              articles={dayArticles}
              loadingPostId={loadingPostId}
              onClickEntry={onClickEntry}
              onClickSettings={onClickSettings}
              onClickDay={onClickDay}
              onCreateDay={onCreateDay}
            />
          )
        })}
      </div>
    </div>
  )
}

interface WeekDayColumnProps {
  day            : Date
  dateStr        : string
  isToday        : boolean
  isWeekend      : boolean
  entries        : CalendarEntry[]
  articles       : BlogArticle[]
  loadingPostId  : string | null
  onClickEntry   : (entry: CalendarEntry) => void
  onClickSettings: (entry: CalendarEntry) => void
  onClickDay     : (dateStr: string, entries: CalendarEntry[]) => void
  onCreateDay    : (dateStr: string) => void
}

function WeekDayColumn({
  day, dateStr, isToday, isWeekend, entries, articles, loadingPostId,
  onClickEntry, onClickSettings, onClickDay, onCreateDay,
}: WeekDayColumnProps) {
  const [expanded, setExpanded] = useState(false)
  const visibleEntries = expanded ? entries : entries.slice(0, WEEK_MAX_VISIBLE)
  const overflow = entries.length - WEEK_MAX_VISIBLE

  const dayName = day.toLocaleDateString('es-ES', { weekday: 'short' })
    .replace(/^\w/, (c) => c.toUpperCase())
  const dayNum  = day.getDate()

  return (
    <div className={`flex flex-col rounded-xl border min-h-[200px]
      ${isToday ? 'border-pink-300 bg-pink-50/30' : isWeekend ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200 bg-white'}
    `}>
      {/* Column header */}
      <button
        onClick={() => onClickDay(dateStr, entries)}
        className="flex flex-col items-center py-2 px-1 border-b border-gray-100 hover:bg-black/5 transition-colors rounded-t-xl"
      >
        <span className={`text-[10px] font-medium uppercase tracking-wide
          ${isToday ? 'text-pink-600' : isWeekend ? 'text-gray-400' : 'text-gray-500'}`}>
          {dayName}
        </span>
        <span className={`text-base font-bold w-7 h-7 flex items-center justify-center rounded-full mt-0.5
          ${isToday ? 'bg-pink-600 text-white' : isWeekend ? 'text-gray-400' : 'text-gray-800'}`}>
          {dayNum}
        </span>
      </button>

      {/* Entries */}
      <div className="flex-1 p-1 space-y-1">
        {/* Blog article chips */}
        {articles.map((a) => (
          <div key={a.id} title={a.titulo}
            className="flex items-center gap-1 rounded px-1 py-0.5 bg-green-100 border border-green-200 text-green-800 text-[10px] truncate">
            <FileText className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{a.titulo}</span>
          </div>
        ))}

        {/* Social entry cards */}
        {visibleEntries.map((entry) => {
          const colors   = PLATFORM_COLORS[entry.platform as Platform]
          const statusCh = entry.post_status ? POST_STATUS_CHIP[entry.post_status] : null
          const dotClass = statusCh?.dot ?? 'bg-white/60'
          const isLoading = loadingPostId !== null && loadingPostId === entry.social_post_id

          return (
            <div key={entry.id}
              className={`rounded-lg border overflow-hidden cursor-pointer
                ${statusCh?.faded ? 'opacity-50' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Thumbnail */}
              {entry.post_asset_url ? (
                <img
                  src={entry.post_asset_url}
                  alt=""
                  className="w-full h-10 object-cover"
                />
              ) : (
                <div className={`w-full h-10 flex items-center justify-center ${colors.bg}`}>
                  <span className={`text-[10px] font-bold ${colors.text} opacity-80`}>
                    {(PLATFORM_LABELS[entry.platform as Platform] ?? entry.platform).slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Card body */}
              <div className="p-1 bg-white">
                <div className="flex items-center justify-between gap-0.5">
                  <div className="flex items-center gap-0.5 min-w-0">
                    {isLoading
                      ? <Loader2 className="h-1.5 w-1.5 shrink-0 animate-spin text-gray-400" />
                      : <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                    }
                    <span className={`text-[10px] font-semibold truncate ${colors.text} ${colors.bg} px-1 py-0.5 rounded`}>
                      {(PLATFORM_LABELS[entry.platform as Platform] ?? entry.platform).slice(0, 2)}
                    </span>
                  </div>
                  <button
                    onClick={() => onClickSettings(entry)}
                    className="shrink-0 text-gray-300 hover:text-gray-500 p-0.5"
                    title="Editar metadatos"
                  >
                    <Settings className="h-2.5 w-2.5" />
                  </button>
                </div>
                <button
                  className="w-full text-left mt-0.5"
                  onClick={() => onClickEntry(entry)}
                >
                  <p className="text-[10px] text-gray-700 line-clamp-2 leading-tight">
                    {entry.title ?? (entry.format ?? PLATFORM_LABELS[entry.platform as Platform])}
                  </p>
                </button>
                {entry.post_status && (
                  <span className={`inline-block text-[9px] px-1 py-0.5 rounded mt-0.5
                    ${entry.post_status === 'aprobado' || entry.post_status === 'listo'
                      ? 'bg-green-100 text-green-700'
                      : entry.post_status === 'en_diseno'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                    {entry.post_status === 'aprobado' ? 'Aprobado'
                      : entry.post_status === 'listo' ? 'Listo ✓'
                      : entry.post_status === 'en_diseno' ? 'En diseño'
                      : entry.post_status === 'publicado' ? 'Publicado'
                      : 'Borrador'}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* Overflow toggle */}
        {!expanded && overflow > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full text-[10px] text-gray-400 hover:text-gray-600 py-0.5 text-center"
          >
            +{overflow} más
          </button>
        )}
        {expanded && entries.length > WEEK_MAX_VISIBLE && (
          <button
            onClick={() => setExpanded(false)}
            className="w-full text-[10px] text-gray-400 hover:text-gray-600 py-0.5 text-center"
          >
            Ver menos
          </button>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={() => onCreateDay(dateStr)}
        className="flex items-center justify-center gap-1 py-1.5 text-[10px] text-gray-400 hover:text-pink-500 hover:bg-pink-50 transition-colors rounded-b-xl border-t border-gray-100"
      >
        <Plus className="h-3 w-3" />
        Añadir
      </button>
    </div>
  )
}

// ─── ListView sub-component ───────────────────────────────────────────────────

interface ListViewProps {
  entries        : CalendarEntry[]
  loadingPostId  : string | null
  onClickEntry   : (entry: CalendarEntry) => void
  onClickSettings: (entry: CalendarEntry) => void
}

function ListView({ entries, loadingPostId, onClickEntry, onClickSettings }: ListViewProps) {
  const sorted = [...entries].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))

  const grouped: Record<string, CalendarEntry[]> = {}
  for (const e of sorted) {
    if (!grouped[e.scheduled_date]) grouped[e.scheduled_date] = []
    grouped[e.scheduled_date].push(e)
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
        <List className="h-8 w-8 mb-3 opacity-40" />
        <p className="text-sm">No hay entradas este mes</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {Object.entries(grouped).map(([dateStr, dayEntries]) => {
        const label = new Date(dateStr + 'T12:00:00')
          .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
          .replace(/^\w/, (c) => c.toUpperCase())

        return (
          <div key={dateStr}>
            {/* Date header */}
            <div className="flex items-center gap-3 px-5 py-2 bg-gray-50 sticky top-0 z-10">
              <span className="text-xs font-semibold text-gray-600">{label}</span>
              <span className="text-xs text-gray-400">{dayEntries.length} pieza{dayEntries.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Entries for this day */}
            {dayEntries.map((entry) => {
              const colors   = PLATFORM_COLORS[entry.platform as Platform]
              const statusCh = entry.post_status ? POST_STATUS_CHIP[entry.post_status] : null
              const isLoading = loadingPostId !== null && loadingPostId === entry.social_post_id

              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer group"
                  onClick={() => onClickEntry(entry)}
                >
                  {/* Thumbnail */}
                  <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden">
                    {entry.post_asset_url ? (
                      <img src={entry.post_asset_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${colors.bg}`}>
                        <span className={`text-xs font-bold ${colors.text}`}>
                          {(PLATFORM_LABELS[entry.platform as Platform] ?? entry.platform).slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className={`text-[10px] font-semibold text-white px-1.5 py-0.5 rounded ${colors.bg}`}>
                        {PLATFORM_LABELS[entry.platform as Platform] ?? entry.platform}
                      </span>
                      {entry.format && (
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {entry.format}
                        </span>
                      )}
                      {entry.post_status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium
                          ${entry.post_status === 'aprobado' || entry.post_status === 'listo'
                            ? 'bg-green-100 text-green-700'
                            : entry.post_status === 'en_diseno'
                              ? 'bg-orange-100 text-orange-700'
                              : entry.post_status === 'publicado'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-500'
                          }`}>
                          {entry.post_status === 'aprobado' ? '● Aprobado'
                            : entry.post_status === 'listo' ? '● Listo'
                            : entry.post_status === 'en_diseno' ? '● En diseño'
                            : entry.post_status === 'publicado' ? '● Publicado'
                            : '● Borrador'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 truncate">
                      {entry.title ?? entry.format ?? PLATFORM_LABELS[entry.platform as Platform]}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {entry.post_asset_url
                        ? <span className="text-[10px] text-emerald-600">🖼 Con imagen</span>
                        : <span className="text-[10px] text-amber-600">⚠ Sin imagen</span>
                      }
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                    <button
                      onClick={(e) => { e.stopPropagation(); onClickSettings(entry) }}
                      className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Editar metadatos del calendario"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
