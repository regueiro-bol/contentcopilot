'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Check, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StrategyData {
  platform_decisions?       : string
  channel_architecture?     : string
  editorial_differentiation?: string
  phase_2_completed?        : boolean
  phase_2_approved_at?      : string | null
  updated_at?               : string
}

interface Props {
  clientId        : string
  onPhaseComplete?: () => void
}

// ─── Checklist ────────────────────────────────────────────────────────────────

// ─── Markdown cleanup ────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s/g, '').trim()
}

function stripData<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? stripMarkdown(v) : v])
  ) as T
}

const APPROVAL_CHECKLIST = [
  'Las decisiones por plataforma son claras y tienen veredicto concreto',
  'La arquitectura de canales define cómo fluye el contenido entre plataformas',
  'El equipo ha revisado y validado la estrategia',
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Phase2Strategy({ clientId, onPhaseComplete }: Props) {
  const [data,       setData]       = useState<StrategyData>({})
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [savedAt,    setSavedAt]    = useState<string | null>(null)
  const [showRegen,  setShowRegen]  = useState(false)
  const [checkItems, setCheckItems] = useState<boolean[]>(new Array(APPROVAL_CHECKLIST.length).fill(false))
  const [genError,   setGenError]   = useState<string | null>(null)

  const allChecked    = checkItems.every(Boolean)
  const hasContent    = !!(data.platform_decisions?.trim() && data.channel_architecture?.trim())
  const isApproved    = data.phase_2_completed === true

  // ─── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/strategy?clientId=${clientId}`)
      if (res.ok) {
        const d = await res.json() as StrategyData | null
        if (d) {
          setData(stripData(d))
          if (d.phase_2_completed) setCheckItems(new Array(APPROVAL_CHECKLIST.length).fill(true))
        }
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { loadData() }, [loadData])

  // ─── Save ──────────────────────────────────────────────────────────────────

  const save = useCallback(async (patch?: Partial<StrategyData>) => {
    const current = patch ? { ...data, ...patch } : data
    setSaving(true)
    try {
      const res = await fetch('/api/social/strategy', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          clientId               : clientId,
          platformDecisions      : current.platform_decisions,
          channelArchitecture    : current.channel_architecture,
          editorialDifferentiation: current.editorial_differentiation,
        }),
      })
      if (res.ok) {
        const saved = await res.json() as StrategyData
        setData(saved)
        setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      }
    } catch { /* silencioso */ }
    finally { setSaving(false) }
  }, [clientId, data])

  function set(key: keyof StrategyData, value: string) {
    setData((prev) => ({ ...prev, [key]: value }))
    setSavedAt(null)
  }

  // ─── Generate ─────────────────────────────────────────────────────────────

  async function handleGenerate(force = false) {
    if (!force && hasContent) { setShowRegen(true); return }
    setShowRegen(false)
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch('/api/social/generate-strategy', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? `Error ${res.status}`) }
      const result = await res.json() as {
        platformDecisions      : string
        channelArchitecture    : string
        editorialDifferentiation: string
      }
      const newData: StrategyData = {
        ...data,
        platform_decisions      : stripMarkdown(result.platformDecisions),
        channel_architecture    : stripMarkdown(result.channelArchitecture),
        editorial_differentiation: stripMarkdown(result.editorialDifferentiation),
      }
      setData(newData)
      setSavedAt(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Phase2Strategy] Generate error:', msg)
      setGenError(msg)
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
        body   : JSON.stringify({ clientId, phase: 2 }),
      })
      if (res.ok) {
        setData((p) => ({ ...p, phase_2_completed: true, phase_2_approved_at: new Date().toISOString() }))
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
        body   : JSON.stringify({ clientId, phase: 2, undo: true }),
      })
      setData((p) => ({ ...p, phase_2_completed: false, phase_2_approved_at: null }))
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
        <span className="text-sm">Cargando estrategia…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Descripción ── */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800 font-medium">Estrategia de plataformas</p>
        <p className="text-xs text-blue-700 mt-0.5">
          Define qué hacer en cada red social, cómo se relacionan entre sí y qué diferencia el contenido en cada una.
        </p>
      </div>

      {/* ── Error de generación ── */}
      {genError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-red-700">
          <span>Error al generar: {genError}</span>
          <button onClick={() => setGenError(null)} className="shrink-0 text-red-400 hover:text-red-600 font-medium">✕</button>
        </div>
      )}

      {/* ── Banner de contenido existente ── */}
      {hasContent && data.updated_at && !isApproved && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Contenido guardado el {new Date(data.updated_at).toLocaleDateString('es-ES')}. Puedes editarlo o regenerarlo.
        </div>
      )}

      {/* ── Botón generar ── */}
      {!isApproved && (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => handleGenerate()}
            disabled={generating}
            className="gap-2 bg-pink-600 hover:bg-pink-700 text-white"
          >
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando estrategia…</>
              : <><Sparkles className="h-4 w-4" /> Generar con IA</>
            }
          </Button>
          {hasContent && (
            <span className="text-xs text-gray-400">Ya hay contenido generado</span>
          )}
        </div>
      )}

      {/* ── Modal confirmación regenerar ── */}
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
        {/* 1. Decisiones por plataforma */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">
            Decisiones por plataforma
          </label>
          <p className="text-xs text-gray-400">Qué hacer en cada red, con qué rol y qué prioridad</p>
          <textarea
            rows={10}
            value={data.platform_decisions ?? ''}
            onChange={(e) => set('platform_decisions', e.target.value)}
            onBlur={() => save()}
            disabled={isApproved}
            placeholder="Para cada plataforma activa: decisión, rol asignado y justificación estratégica..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600"
          />
        </div>

        {/* 2. Arquitectura de canales */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">
            Arquitectura del ecosistema de canales
          </label>
          <p className="text-xs text-gray-400">Cómo se relacionan las plataformas entre sí</p>
          <textarea
            rows={8}
            value={data.channel_architecture ?? ''}
            onChange={(e) => set('channel_architecture', e.target.value)}
            onBlur={() => save()}
            disabled={isApproved}
            placeholder="Cómo fluye el contenido entre plataformas, qué hace cada una que las demás no hacen..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600"
          />
        </div>

        {/* 3. Diferenciación editorial */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">
            Diferenciación editorial por plataforma
          </label>
          <p className="text-xs text-gray-400">Qué hace diferente el contenido en cada red</p>
          <textarea
            rows={8}
            value={data.editorial_differentiation ?? ''}
            onChange={(e) => set('editorial_differentiation', e.target.value)}
            onBlur={() => save()}
            disabled={isApproved}
            placeholder="Tono, formato y enfoque específico de cada plataforma..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600"
          />
        </div>
      </div>

      {/* ── Guardar ── */}
      {!isApproved && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {saving && <span className="flex items-center gap-1 text-gray-500"><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</span>}
            {savedAt && !saving && (
              <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Guardado a las {savedAt}</span>
            )}
          </span>
          <Button size="sm" onClick={() => save()} disabled={saving}
            className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</> : 'Guardar'}
          </Button>
        </div>
      )}

      {/* ── Gate de aprobación / estado aprobado ── */}
      {isApproved ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <Check className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">Fase 2 completada y aprobada</p>
              {data.phase_2_approved_at && (
                <p className="text-xs text-green-700 mt-0.5">
                  Aprobada el {new Date(data.phase_2_approved_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <Button variant="ghost" size="sm" onClick={handleUndoApproval} disabled={approving}
              className="text-xs text-gray-400 hover:text-red-500">
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
              className={`gap-1.5 text-xs transition-colors
                ${allChecked && hasContent ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              {approving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aprobando…</>
                : <>Aprobar Fase 2 y continuar <ChevronRight className="h-3.5 w-3.5" /></>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
