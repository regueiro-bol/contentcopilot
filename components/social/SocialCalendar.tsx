'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Loader2, FileText,
  AlertCircle, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  PLATFORMS, PLATFORM_LABELS, PLATFORM_COLORS, STATUS_COLORS,
  type Platform,
} from '@/lib/social/platforms'
import CalendarEntryDrawer, {
  type CalendarEntry, type BlogArticle,
} from './CalendarEntryDrawer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string
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

const TODAY = new Date().toISOString().split('T')[0]

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// ─── Component ────────────────────────────────────────────────────────────────

export default function SocialCalendar({ clientId }: Props) {
  const now    = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

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

  // Uncovered articles panel
  const [showUncovered, setShowUncovered] = useState(false)

  // Active platforms for the client (based on entries + all platforms as fallback)
  const clientPlatforms = useMemo<Platform[]>(() => {
    const fromEntries = new Set(entries.map((e) => e.platform as Platform))
    return PLATFORMS.filter((p) => fromEntries.has(p) || fromEntries.size === 0)
  }, [entries])

  // ── Fetch data ──

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

  function handleSaved(saved: CalendarEntry) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = saved; return next
      }
      return [...prev, saved].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    })
    // Refresh uncovered count
    fetchData()
  }

  function handleDeleted(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    fetchData()
  }

  // ── Grid computation ──

  const daysInMonth   = getDaysInMonth(year, month)
  const firstDayOffset = getFirstDayOffset(year, month)

  // Group entries and articles by date
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
    <div className="space-y-4">

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
              onClick={prevMonth}
              className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3 className="text-sm font-semibold text-gray-900 min-w-[150px] text-center">
              {formatMonth(year, month)}
            </h3>
            <button
              onClick={nextMonth}
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

          {/* Right: view selector + new button */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
              <button className="px-3 py-1.5 bg-gray-900 text-white font-medium">Mes</button>
              <button
                title="Próximamente"
                className="px-3 py-1.5 text-gray-400 cursor-not-allowed bg-white"
              >
                Semana
              </button>
            </div>
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

        {/* ── Calendar grid ── */}
        {!loading && (
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
              {/* Empty cells before first day */}
              {Array.from({ length: firstDayOffset }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-gray-50 min-h-[120px]" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day     = i + 1
                const dateStr = toDateStr(year, month, day)
                const isToday = dateStr === TODAY
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
                    onClickDay={() => openCreate(dateStr)}
                    onClickEntry={openEdit}
                  />
                )
              })}

              {/* Fill remaining cells to complete last row */}
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
      </div>

      {/* ── Drawer ── */}
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
    </div>
  )
}

// ─── DayCell sub-component ────────────────────────────────────────────────────

interface DayCellProps {
  day          : number
  dateStr      : string
  isToday      : boolean
  isWeekend    : boolean
  entries      : CalendarEntry[]
  articles     : BlogArticle[]
  onClickDay   : () => void
  onClickEntry : (entry: CalendarEntry) => void
}

const MAX_VISIBLE = 2

function DayCell({
  day, dateStr, isToday, isWeekend,
  entries, articles, onClickDay, onClickEntry,
}: DayCellProps) {
  const [showAll, setShowAll] = useState(false)

  const totalItems  = entries.length + articles.length
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
        const colors = PLATFORM_COLORS[entry.platform as Platform]
        const status = STATUS_COLORS[entry.status]
        return (
          <div
            key={entry.id}
            onClick={(e) => { e.stopPropagation(); onClickEntry(entry) }}
            className={`flex items-center gap-1 rounded px-1 py-0.5 mb-0.5 cursor-pointer ${colors.bg} ${colors.text} opacity-90 hover:opacity-100`}
          >
            <div className={`h-1.5 w-1.5 rounded-full shrink-0 bg-white/60 ring-1 ring-white/40 ${status?.dot ?? ''}`} />
            <span className="text-xs truncate leading-tight">
              {entry.title ?? PLATFORM_LABELS[entry.platform as Platform]}
            </span>
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
