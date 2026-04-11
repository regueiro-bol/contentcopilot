'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Check, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArchitectureData {
  editorial_pillars?   : string
  formats_by_platform? : string
  publishing_cadence?  : string
  calendar_template?   : string
  phase_3_completed?   : boolean
  phase_3_approved_at? : string | null
  updated_at?          : string
}

interface Props {
  clientId        : string
  onPhaseComplete?: () => void
}

// ─── Checklist ────────────────────────────────────────────────────────────────

const APPROVAL_CHECKLIST = [
  'Los pilares editoriales están definidos con territorio y ángulo único',
  'Los formatos están asignados a cada plataforma activa',
  'La cadencia de publicación es realista y sostenible',
  'El equipo ha revisado y validado la arquitectura',
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Phase3Architecture({ clientId, onPhaseComplete }: Props) {
  const [data,       setData]       = useState<ArchitectureData>({})
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [savedAt,    setSavedAt]    = useState<string | null>(null)
  const [showRegen,  setShowRegen]  = useState(false)
  const [checkItems, setCheckItems] = useState<boolean[]>(new Array(APPROVAL_CHECKLIST.length).fill(false))

  const allChecked = checkItems.every(Boolean)
  const hasContent = !!(
    data.editorial_pillars?.trim() &&
    data.formats_by_platform?.trim() &&
    data.publishing_cadence?.trim()
  )
  const isApproved = data.phase_3_completed === true

  // ─── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/architecture?clientId=${clientId}`)
      if (res.ok) {
        const d = await res.json() as ArchitectureData | null
        if (d) {
          setData(d)
          if (d.phase_3_completed) setCheckItems(new Array(APPROVAL_CHECKLIST.length).fill(true))
        }
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { loadData() }, [loadData])

  // ─── Save ──────────────────────────────────────────────────────────────────

  const save = useCallback(async (current?: ArchitectureData) => {
    const d = current ?? data
    setSaving(true)
    try {
      const res = await fetch('/api/social/architecture', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          clientId         : clientId,
          editorialPillars : d.editorial_pillars,
          formatsByPlatform: d.formats_by_platform,
          publishingCadence: d.publishing_cadence,
          calendarTemplate : d.calendar_template,
        }),
      })
      if (res.ok) {
        const saved = await res.json() as ArchitectureData
        setData(saved)
        setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      }
    } catch { /* silencioso */ }
    finally { setSaving(false) }
  }, [clientId, data])

  function set(key: keyof ArchitectureData, value: string) {
    setData((prev) => ({ ...prev, [key]: value }))
    setSavedAt(null)
  }

  // ─── Generate ─────────────────────────────────────────────────────────────

  async function handleGenerate(force = false) {
    if (!force && hasContent) { setShowRegen(true); return }
    setShowRegen(false)
    setGenerating(true)
    try {
      const res = await fetch('/api/social/generate-architecture', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const result = await res.json() as {
        editorialPillars  : string
        formatsByPlatform : string
        publishingCadence : string
        calendarTemplate  : string
      }
      setData((prev) => ({
        ...prev,
        editorial_pillars  : result.editorialPillars,
        formats_by_platform: result.formatsByPlatform,
        publishing_cadence : result.publishingCadence,
        calendar_template  : result.calendarTemplate,
      }))
      setSavedAt(null)
    } catch (err) {
      console.error('[Phase3Architecture] Generate error:', err)
    } finally {
      setGenerating(false)
    }
  }

  // ─── Approve ──────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!allChecked) return
    setApproving(true)
    try {
      await save()
      const res = await fetch('/api/social/approve-phase', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, phase: 3 }),
      })
      if (res.ok) {
        setData((p) => ({ ...p, phase_3_completed: true, phase_3_approved_at: new Date().toISOString() }))
        onPhaseComplete?.()
      }
    } catch { /* silencioso */ }
    finally { setApproving(false) }
  }

  async function handleUndoApproval() {
    setApproving(true)
    try {
      await fetch('/api/social/approve-phase', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, phase: 3, undo: true }),
      })
      setData((p) => ({ ...p, phase_3_completed: false, phase_3_approved_at: null }))
      setCheckItems(new Array(APPROVAL_CHECKLIST.length).fill(false))
      onPhaseComplete?.()
    } catch { /* silencioso */ }
    finally { setApproving(false) }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando arquitectura…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Descripción ── */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800 font-medium">Arquitectura de contenidos</p>
        <p className="text-xs text-blue-700 mt-0.5">
          Define los pilares editoriales, los formatos por plataforma y la cadencia de publicación.
        </p>
      </div>

      {/* ── Banner contenido existente ── */}
      {hasContent && data.updated_at && !isApproved && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Contenido guardado el {new Date(data.updated_at).toLocaleDateString('es-ES')}. Puedes editarlo o regenerarlo.
        </div>
      )}

      {/* ── Botón generar ── */}
      {!isApproved && (
        <div className="flex items-center gap-3">
          <Button onClick={() => handleGenerate()} disabled={generating}
            className="gap-2 bg-pink-600 hover:bg-pink-700 text-white">
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando arquitectura…</>
              : <><Sparkles className="h-4 w-4" /> Generar con IA</>
            }
          </Button>
          {hasContent && <span className="text-xs text-gray-400">Ya hay contenido generado</span>}
        </div>
      )}

      {/* ── Confirmación regenerar ── */}
      {showRegen && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-800">¿Regenerar contenido?</p>
          <p className="text-xs text-amber-700">El contenido actual se sobreescribirá. Esta acción no se puede deshacer.</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowRegen(false)} className="text-xs h-7">Cancelar</Button>
            <Button size="sm" onClick={() => handleGenerate(true)} disabled={generating}
              className="text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white h-7">
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sí, regenerar'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Textareas ── */}
      <div className="space-y-5">
        {/* 1. Pilares editoriales */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Pilares editoriales</label>
          <p className="text-xs text-gray-400">Los temas o posiciones intelectuales que ocupará la marca</p>
          <textarea rows={12} value={data.editorial_pillars ?? ''} disabled={isApproved}
            onChange={(e) => set('editorial_pillars', e.target.value)} onBlur={() => save()}
            placeholder="3-5 pilares con nombre, descripción y ángulo permanente..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>

        {/* 2. Formatos por plataforma */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Formatos por plataforma</label>
          <p className="text-xs text-gray-400">Qué tipos de contenido se producirán en cada red</p>
          <textarea rows={10} value={data.formats_by_platform ?? ''} disabled={isApproved}
            onChange={(e) => set('formats_by_platform', e.target.value)} onBlur={() => save()}
            placeholder="Para cada plataforma activa: formatos nativos, nombre interno y frecuencia..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>

        {/* 3. Cadencia de publicación */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Cadencia de publicación</label>
          <p className="text-xs text-gray-400">Frecuencia y distribución semanal por plataforma</p>
          <textarea rows={6} value={data.publishing_cadence ?? ''} disabled={isApproved}
            onChange={(e) => set('publishing_cadence', e.target.value)} onBlur={() => save()}
            placeholder="Posts/semana por plataforma, distribución por días, horarios recomendados..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>

        {/* 4. Calendario tipo */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Propuesta de calendario tipo</label>
          <p className="text-xs text-gray-400">Distribución semanal de contenidos</p>
          <textarea rows={8} value={data.calendar_template ?? ''} disabled={isApproved}
            onChange={(e) => set('calendar_template', e.target.value)} onBlur={() => save()}
            placeholder="Ejemplo de semana tipo con qué publicar cada día en cada plataforma activa..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>
      </div>

      {/* ── Guardar ── */}
      {!isApproved && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {saving && <span className="flex items-center gap-1 text-gray-500"><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</span>}
            {savedAt && !saving && <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Guardado a las {savedAt}</span>}
          </span>
          <Button size="sm" onClick={() => save()} disabled={saving} className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</> : 'Guardar'}
          </Button>
        </div>
      )}

      {/* ── Aprobación ── */}
      {isApproved ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <Check className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">Fase 3 completada y aprobada</p>
              {data.phase_3_approved_at && (
                <p className="text-xs text-green-700 mt-0.5">
                  Aprobada el {new Date(data.phase_3_approved_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <Button variant="ghost" size="sm" onClick={handleUndoApproval} disabled={approving} className="text-xs text-gray-400 hover:text-red-500">
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Deshacer aprobación'}
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Checklist de aprobación</h3>
            <p className="text-xs text-gray-500 mt-0.5">Confirma antes de aprobar la fase</p>
          </div>
          <div className="space-y-2.5">
            {APPROVAL_CHECKLIST.map((item, idx) => (
              <div key={idx} role="checkbox" aria-checked={checkItems[idx]} tabIndex={0}
                onClick={() => { const n = [...checkItems]; n[idx] = !n[idx]; setCheckItems(n) }}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const n = [...checkItems]; n[idx] = !n[idx]; setCheckItems(n) } }}
                className="flex items-start gap-3 cursor-pointer group select-none"
              >
                <div className={`mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                  ${checkItems[idx] ? 'bg-green-500 border-green-500' : 'border-gray-300 group-hover:border-green-400'}`}>
                  {checkItems[idx] && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <span className={`text-sm transition-colors ${checkItems[idx] ? 'text-gray-700 line-through decoration-gray-400' : 'text-gray-600'}`}>{item}</span>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">{checkItems.filter(Boolean).length}/{APPROVAL_CHECKLIST.length} completados</span>
            <Button size="sm" onClick={handleApprove} disabled={!allChecked || !hasContent || approving}
              className={`gap-1.5 text-xs ${allChecked && hasContent ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              {approving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aprobando…</>
                : <>Aprobar Fase 3 y continuar <ChevronRight className="h-3.5 w-3.5" /></>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
