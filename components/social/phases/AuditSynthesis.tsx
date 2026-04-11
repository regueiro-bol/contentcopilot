'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Check, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SynthesisData {
  id?                           : string
  client_id                     : string
  platform_context?             : string
  main_strengths?               : string
  main_weaknesses?              : string
  benchmark_patterns?           : string
  differentiation_opportunities?: string
  phase_1_completed?            : boolean
  phase_1_approved_at?          : string | null
}

interface Props {
  clientId        : string
  onPhaseComplete?: () => void
}

// ─── Checklist de aprobación ──────────────────────────────────────────────────

const APPROVAL_CHECKLIST = [
  'Se han auditado todas las plataformas relevantes del cliente',
  'Las valoraciones cualitativas reflejan la realidad actual',
  'Se han identificado al menos 2 referentes de benchmark',
  'Las fortalezas y debilidades son específicas y accionables',
  'El equipo ha revisado y validado el análisis',
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuditSynthesis({ clientId, onPhaseComplete }: Props) {
  const [synthesis,    setSynthesis]    = useState<SynthesisData>({ client_id: clientId })
  const [loading,      setLoading]      = useState(true)
  const [generating,   setGenerating]   = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [approving,    setApproving]    = useState(false)
  const [savedAt,      setSavedAt]      = useState<string | null>(null)
  const [checkItems,   setCheckItems]   = useState<boolean[]>(new Array(APPROVAL_CHECKLIST.length).fill(false))
  const allChecked = checkItems.every(Boolean)

  const fetchSynthesis = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/synthesis?clientId=${clientId}`)
      if (res.ok) {
        const data = await res.json() as SynthesisData | null
        if (data) {
          setSynthesis(data)
          // Si la fase ya está aprobada, marcar todos los checks
          if (data.phase_1_completed) {
            setCheckItems(new Array(APPROVAL_CHECKLIST.length).fill(true))
          }
        }
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { fetchSynthesis() }, [fetchSynthesis])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/social/generate-synthesis', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const result = await res.json() as { platform_context: string; main_strengths: string; main_weaknesses: string }
      setSynthesis((prev) => ({
        ...prev,
        platform_context: result.platform_context,
        main_strengths  : result.main_strengths,
        main_weaknesses : result.main_weaknesses,
      }))
      setSavedAt(null)
    } catch (err) {
      console.error('[AuditSynthesis] Generate error:', err)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/social/synthesis', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(synthesis),
      })
      if (res.ok) {
        const saved = await res.json() as SynthesisData
        setSynthesis(saved)
        setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      }
    } catch { /* silencioso */ }
    finally { setSaving(false) }
  }

  async function handleApprove() {
    if (!allChecked) return
    setApproving(true)
    try {
      // 1. Guardar síntesis si hay cambios
      await handleSave()

      // 2. Aprobar la fase
      const res = await fetch('/api/social/approve-phase', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, phase: 1 }),
      })
      if (res.ok) {
        setSynthesis((prev) => ({ ...prev, phase_1_completed: true, phase_1_approved_at: new Date().toISOString() }))
        onPhaseComplete?.()
      }
    } catch { /* silencioso */ }
    finally { setApproving(false) }
  }

  async function handleUndoApproval() {
    setApproving(true)
    try {
      const res = await fetch('/api/social/approve-phase', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, phase: 1, undo: true }),
      })
      if (res.ok) {
        setSynthesis((prev) => ({ ...prev, phase_1_completed: false, phase_1_approved_at: null }))
        setCheckItems(new Array(APPROVAL_CHECKLIST.length).fill(false))
        onPhaseComplete?.()
      }
    } catch { /* silencioso */ }
    finally { setApproving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando síntesis…</span>
      </div>
    )
  }

  const isApproved = synthesis.phase_1_completed === true

  return (
    <div className="space-y-6">
      {/* ── Síntesis generada por IA ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Síntesis de la auditoría</h3>
          {!isApproved && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              className="text-xs gap-1.5 h-8 border-pink-200 text-pink-700 hover:bg-pink-50"
            >
              {generating
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                : <><Sparkles className="h-3.5 w-3.5" /> Generar con IA</>
              }
            </Button>
          )}
        </div>

        {/* Marco estratégico por plataforma */}
        {synthesis.platform_context && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
              Marco estratégico por plataforma
            </p>
            <p className="text-sm text-blue-900 leading-relaxed whitespace-pre-line">
              {synthesis.platform_context}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Fortalezas */}
          <div>
            <label className="text-xs font-semibold text-green-700 uppercase tracking-wide block mb-1.5">
              Fortalezas principales
            </label>
            <textarea
              rows={5}
              value={synthesis.main_strengths ?? ''}
              onChange={(e) => setSynthesis((p) => ({ ...p, main_strengths: e.target.value }))}
              onBlur={handleSave}
              disabled={isApproved}
              placeholder="Describe las principales fortalezas del cliente en redes sociales…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-300 resize-none disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>

          {/* Debilidades */}
          <div>
            <label className="text-xs font-semibold text-red-600 uppercase tracking-wide block mb-1.5">
              Debilidades / gaps principales
            </label>
            <textarea
              rows={5}
              value={synthesis.main_weaknesses ?? ''}
              onChange={(e) => setSynthesis((p) => ({ ...p, main_weaknesses: e.target.value }))}
              onBlur={handleSave}
              disabled={isApproved}
              placeholder="Describe las principales debilidades y áreas de mejora…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none disabled:bg-gray-50 disabled:text-gray-600"
            />
          </div>
        </div>

        {!isApproved && (
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              {savedAt && (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="h-3 w-3" /> Guardado a las {savedAt}
                </span>
              )}
            </span>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white"
            >
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</> : 'Guardar síntesis'}
            </Button>
          </div>
        )}
      </div>

      {/* ── Estado: aprobada ── */}
      {isApproved ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <Check className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">Fase 1 completada y aprobada</p>
              {synthesis.phase_1_approved_at && (
                <p className="text-xs text-green-700 mt-0.5">
                  Aprobada el {new Date(synthesis.phase_1_approved_at).toLocaleDateString('es-ES', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              )}
            </div>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndoApproval}
              disabled={approving}
              className="text-xs text-gray-400 hover:text-red-500"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Deshacer aprobación'}
            </Button>
          )}
        </div>
      ) : (
        /* ── Checklist de aprobación ── */
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Checklist de aprobación</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Confirma que se han completado todos los puntos antes de aprobar la fase
            </p>
          </div>

          <div className="space-y-2.5">
            {APPROVAL_CHECKLIST.map((item, idx) => (
              <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                <div className={`mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                  ${checkItems[idx]
                    ? 'bg-green-500 border-green-500'
                    : 'border-gray-300 group-hover:border-green-400'
                  }
                `}>
                  {checkItems[idx] && <Check className="h-2.5 w-2.5 text-white" />}
                  <input
                    type="checkbox"
                    checked={checkItems[idx]}
                    onChange={(e) => {
                      const next = [...checkItems]
                      next[idx] = e.target.checked
                      setCheckItems(next)
                    }}
                    className="sr-only"
                  />
                </div>
                <span className={`text-sm transition-colors ${checkItems[idx] ? 'text-gray-700 line-through decoration-gray-400' : 'text-gray-600'}`}>
                  {item}
                </span>
              </label>
            ))}
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {checkItems.filter(Boolean).length}/{APPROVAL_CHECKLIST.length} completados
            </span>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={!allChecked || approving}
              className={`gap-1.5 text-xs transition-colors
                ${allChecked
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {approving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aprobando…</>
                : <>Aprobar Fase 1 y continuar <ChevronRight className="h-3.5 w-3.5" /></>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
