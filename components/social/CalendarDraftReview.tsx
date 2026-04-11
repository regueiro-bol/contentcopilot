'use client'

import { useState, useMemo } from 'react'
import {
  X, CheckSquare, Square, Loader2, Check, Trash2,
  BookOpen, Lightbulb, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DraftEntry {
  scheduledDate   : string
  platform        : string
  format?         : string
  contentType?    : string
  title?          : string
  description?    : string
  blogContenidoId?: string | null
  reasoning?      : string
}

export interface DraftStats {
  totalEntries: number
  byPlatform  : Record<string, number>
  blogDerived : number
  daysCount   : number
}

interface Draft {
  id        : string
  mode      : 'initial' | 'maintenance'
  start_date: string
  end_date  : string
  entries   : DraftEntry[]
  stats     : DraftStats
}

interface Props {
  clientId  : string
  draft     : Draft
  onApprove : (approvedEntries: DraftEntry[]) => void
  onDiscard : () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  linkedin : 'LinkedIn', twitter_x: 'Twitter/X', instagram: 'Instagram',
  facebook : 'Facebook', tiktok   : 'TikTok',    youtube  : 'YouTube',
}

const PLATFORM_BG: Record<string, string> = {
  linkedin : 'bg-blue-600',  twitter_x: 'bg-gray-900', instagram: 'bg-purple-600',
  facebook : 'bg-blue-500',  tiktok   : 'bg-black',    youtube  : 'bg-red-600',
}

const WEEKDAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS_ES   = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} ${MONTHS_ES[d.getMonth()].slice(0,3)}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalendarDraftReview({ clientId, draft, onApprove, onDiscard }: Props) {
  // Each entry gets a unique key and selected state
  const [items, setItems] = useState<Array<DraftEntry & { _key: string; _selected: boolean }>>(() =>
    draft.entries.map((e, i) => ({ ...e, _key: `${e.scheduledDate}-${e.platform}-${i}`, _selected: true })),
  )

  const [saving,        setSaving]        = useState(false)
  const [discarding,    setDiscarding]    = useState(false)
  const [discardModal,  setDiscardModal]  = useState(false)
  const [errorMsg,      setErrorMsg]      = useState('')
  const [editingKey,    setEditingKey]    = useState<string | null>(null)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())

  const selectedCount = items.filter((i) => i._selected).length
  const allSelected   = selectedCount === items.length
  const noneSelected  = selectedCount === 0

  // Group items by date
  const byDate = useMemo(() => {
    const map: Record<string, typeof items> = {}
    for (const item of items) {
      if (!map[item.scheduledDate]) map[item.scheduledDate] = []
      map[item.scheduledDate].push(item)
    }
    return map
  }, [items])

  const sortedDates = Object.keys(byDate).sort()

  // ── Selection helpers ──

  function toggleAll() {
    const next = !allSelected
    setItems((prev) => prev.map((i) => ({ ...i, _selected: next })))
  }

  function toggleItem(key: string) {
    setItems((prev) => prev.map((i) => i._key === key ? { ...i, _selected: !i._selected } : i))
  }

  function toggleDay(date: string) {
    const dayItems   = byDate[date] ?? []
    const allDaySel  = dayItems.every((i) => i._selected)
    setItems((prev) => prev.map((i) =>
      i.scheduledDate === date ? { ...i, _selected: !allDaySel } : i,
    ))
  }

  function rejectItem(key: string) {
    setItems((prev) => prev.map((i) => i._key === key ? { ...i, _selected: false } : i))
  }

  function toggleCollapseDay(date: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  // ── Inline edit ──

  function updateEntry(key: string, fields: Partial<DraftEntry>) {
    setItems((prev) => prev.map((i) => i._key === key ? { ...i, ...fields } : i))
  }

  // ── Approve ──

  async function handleApprove(onlySelected = true) {
    const toApprove = onlySelected
      ? items.filter((i) => i._selected)
      : items

    if (toApprove.length === 0) return
    setSaving(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/social/calendar-drafts', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          draftId        : draft.id,
          clientId,
          approvedEntries: toApprove.map(({ _key, _selected, ...e }) => e),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onApprove(toApprove.map(({ _key, _selected, ...e }) => e))
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // ── Discard ──

  async function handleDiscard() {
    setDiscarding(true)
    try {
      await fetch(`/api/social/calendar-drafts?draftId=${draft.id}`, { method: 'DELETE' })
      onDiscard()
    } catch { /* silencioso */ }
    finally { setDiscarding(false) }
  }

  const periodLabel = `${formatDate(draft.start_date)} → ${formatDate(draft.end_date)}`
  const modeLabel   = draft.mode === 'initial' ? 'Arranque inicial' : 'Planificación de período'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-stretch justify-center overflow-hidden">
      <div className="bg-white w-full max-w-5xl flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-base font-bold text-gray-900">Borrador de calendario</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                draft.mode === 'initial'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-violet-100 text-violet-700'
              }`}>{modeLabel}</span>
            </div>
            <p className="text-xs text-gray-500">{periodLabel}</p>
            {/* Stats */}
            <div className="flex items-center gap-4 mt-2">
              <span className="text-xs text-gray-600">
                <strong>{draft.stats.totalEntries}</strong> entradas generadas
              </span>
              <span className="text-xs text-gray-600">
                <strong>{Object.keys(draft.stats.byPlatform).length}</strong> plataformas
              </span>
              {draft.stats.blogDerived > 0 && (
                <span className="flex items-center gap-1 text-xs text-green-700">
                  <BookOpen className="h-3 w-3" />
                  <strong>{draft.stats.blogDerived}</strong> del blog
                </span>
              )}
              <span className="text-xs text-gray-600">
                <strong>{draft.stats.daysCount}</strong> días cubiertos
              </span>
            </div>
          </div>
          <button onClick={() => setDiscardModal(true)} className="text-gray-400 hover:text-gray-600 ml-4">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Action bar ── */}
        <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b border-gray-100 shrink-0 gap-3 flex-wrap">
          {/* Select all */}
          <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900">
            {allSelected
              ? <CheckSquare className="h-4 w-4 text-blue-600" />
              : <Square className="h-4 w-4" />
            }
            {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
          </button>

          <span className="text-xs text-gray-500">
            {selectedCount} de {items.length} entradas seleccionadas
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDiscardModal(true)}
              className="text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Descartar borrador
            </Button>
            <Button
              size="sm"
              onClick={() => handleApprove(true)}
              disabled={saving || noneSelected}
              className="text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
            >
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando {selectedCount}…</>
                : <><Check className="h-3.5 w-3.5" /> Aprobar {selectedCount === items.length ? 'todo' : `${selectedCount} seleccionadas`}</>
              }
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-6 py-2 border-b border-red-100">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* ── Table ── */}
        <div className="flex-1 overflow-y-auto">
          {sortedDates.map((date) => {
            const dayItems   = byDate[date]
            const collapsed  = collapsedDays.has(date)
            const allDaySel  = dayItems.every((i) => i._selected)
            const someDaySel = dayItems.some((i) => i._selected)

            return (
              <div key={date}>
                {/* Day separator */}
                <div className="flex items-center gap-3 px-6 py-2 bg-gray-50 border-y border-gray-100 sticky top-0 z-10">
                  <button
                    onClick={() => toggleDay(date)}
                    className="shrink-0"
                    title={allDaySel ? 'Deseleccionar día' : 'Seleccionar día'}
                  >
                    {allDaySel
                      ? <CheckSquare className="h-4 w-4 text-blue-600" />
                      : someDaySel
                        ? <CheckSquare className="h-4 w-4 text-blue-300" />
                        : <Square className="h-4 w-4 text-gray-300" />
                    }
                  </button>
                  <span className="text-xs font-semibold text-gray-700 flex-1">{formatDate(date)}</span>
                  <span className="text-xs text-gray-400">{dayItems.length} entrada{dayItems.length !== 1 ? 's' : ''}</span>
                  <button onClick={() => toggleCollapseDay(date)} className="text-gray-400 hover:text-gray-600">
                    {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Day entries */}
                {!collapsed && (
                  <div className="divide-y divide-gray-50">
                    {dayItems.map((item) => (
                      <EntryRow
                        key={item._key}
                        item={item}
                        editing={editingKey === item._key}
                        onToggle={() => toggleItem(item._key)}
                        onReject={() => rejectItem(item._key)}
                        onEdit={() => setEditingKey(editingKey === item._key ? null : item._key)}
                        onUpdate={(fields) => updateEntry(item._key, fields)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Discard confirmation modal ── */}
      {discardModal && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-60">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">¿Descartar este borrador?</h3>
            <p className="text-xs text-gray-500 mb-5">
              No se guardará ninguna entrada en el calendario. Esta acción no se puede deshacer.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDiscardModal(false)} className="text-xs text-gray-500">
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleDiscard}
                disabled={discarding}
                className="text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white"
              >
                {discarding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Sí, descartar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Entry Row ────────────────────────────────────────────────────────────────

interface EntryRowProps {
  item    : DraftEntry & { _key: string; _selected: boolean }
  editing : boolean
  onToggle: () => void
  onReject: () => void
  onEdit  : () => void
  onUpdate: (fields: Partial<DraftEntry>) => void
}

function EntryRow({ item, editing, onToggle, onReject, onEdit, onUpdate }: EntryRowProps) {
  const rejected = !item._selected

  return (
    <div className={`transition-colors ${rejected ? 'opacity-40' : ''}`}>
      <div className={`flex items-start gap-3 px-6 py-3 hover:bg-gray-50/80 ${editing ? 'bg-blue-50/30' : ''}`}>
        {/* Checkbox */}
        <button onClick={onToggle} className="mt-0.5 shrink-0">
          {item._selected
            ? <CheckSquare className="h-4 w-4 text-blue-600" />
            : <Square className="h-4 w-4 text-gray-300" />
          }
        </button>

        {/* Platform badge */}
        <span className={`shrink-0 mt-0.5 text-xs font-bold text-white px-2 py-0.5 rounded-full ${PLATFORM_BG[item.platform] ?? 'bg-gray-600'}`}>
          {(PLATFORM_LABELS[item.platform] ?? item.platform).slice(0, 2).toUpperCase()}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs font-semibold text-gray-800">{PLATFORM_LABELS[item.platform] ?? item.platform}</span>
            {item.format && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{item.format}</span>
            )}
            {item.contentType && (
              <span className="text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded max-w-[180px] truncate" title={item.contentType}>
                {item.contentType.length > 35 ? item.contentType.slice(0, 35) + '…' : item.contentType}
              </span>
            )}
            {item.blogContenidoId && (
              <span title="Derivada de artículo del blog" className="text-green-700 cursor-default">
                <BookOpen className="h-3 w-3" />
              </span>
            )}
          </div>
          <p className={`text-sm font-medium text-gray-900 ${rejected ? 'line-through' : ''}`}>
            {item.title ?? '(sin título)'}
          </p>
          {!editing && item.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{item.description}</p>
          )}
        </div>

        {/* Reasoning tooltip */}
        {item.reasoning && (
          <span title={item.reasoning} className="shrink-0 mt-0.5 cursor-help text-amber-500 hover:text-amber-600">
            <Lightbulb className="h-3.5 w-3.5" />
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className={`text-xs px-2 py-1 rounded hover:bg-blue-100 transition-colors ${editing ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-blue-600'}`}
          >
            {editing ? 'Cerrar' : 'Editar'}
          </button>
          {!rejected && (
            <button
              onClick={onReject}
              className="text-xs px-1.5 py-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Rechazar esta entrada"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Inline editor */}
      {editing && (
        <div className="px-6 pb-4 bg-blue-50/30 border-b border-blue-100/50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Plataforma</label>
              <select
                value={item.platform}
                onChange={(e) => onUpdate({ platform: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
              >
                {Object.entries(PLATFORM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Formato</label>
              <input
                type="text"
                value={item.format ?? ''}
                onChange={(e) => onUpdate({ format: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Título</label>
            <input
              type="text"
              value={item.title ?? ''}
              onChange={(e) => onUpdate({ title: e.target.value })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Briefing</label>
            <textarea
              rows={2}
              value={item.description ?? ''}
              onChange={(e) => onUpdate({ description: e.target.value })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha</label>
            <input
              type="date"
              value={item.scheduledDate}
              onChange={(e) => onUpdate({ scheduledDate: e.target.value })}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
        </div>
      )}
    </div>
  )
}
