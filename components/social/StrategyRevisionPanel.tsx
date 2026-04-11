'use client'

import { useState } from 'react'
import { X, Loader2, ChevronRight, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhaseImpact {
  phase : number
  label : string
  impact: string
}

interface Props {
  open    : boolean
  clientId: string
  onClose : () => void
  onApplied: () => void  // callback para refrescar el estado de la estrategia
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<number, string> = {
  2: 'Estrategia de plataformas',
  3: 'Arquitectura de contenidos',
  4: 'Tono y voz de marca',
  5: 'KPIs y métricas',
  6: 'Plan de acción',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StrategyRevisionPanel({ open, clientId, onClose, onApplied }: Props) {
  // ── Step state ──
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // ── Step 1 state ──
  const [instructions, setInstructions] = useState('')
  const [analyzing,    setAnalyzing]    = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  // ── Step 2 state ──
  const [phaseImpacts,    setPhaseImpacts]    = useState<PhaseImpact[]>([])
  const [selectedPhases,  setSelectedPhases]  = useState<Set<number>>(new Set())
  const [applying,        setApplying]        = useState(false)
  const [applyProgress,   setApplyProgress]   = useState<number>(0)  // 0-100
  const [currentPhaseMsg, setCurrentPhaseMsg] = useState('')
  const [applyError,      setApplyError]      = useState<string | null>(null)

  // ── Step 3 state (done) ──
  const [appliedPhases, setAppliedPhases] = useState<number[]>([])
  const [applyErrors,   setApplyErrors]   = useState<Record<string, string>>({})

  // ─── Reset ────────────────────────────────────────────────────────────────

  function handleClose() {
    setStep(1)
    setInstructions('')
    setAnalyzeError(null)
    setPhaseImpacts([])
    setSelectedPhases(new Set())
    setApplyError(null)
    setApplyProgress(0)
    setCurrentPhaseMsg('')
    setAppliedPhases([])
    setApplyErrors({})
    onClose()
  }

  // ─── Step 1 → Analyze ─────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (!instructions.trim()) return
    setAnalyzing(true)
    setAnalyzeError(null)

    try {
      const res = await fetch('/api/social/analyze-revision', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, instructions }),
      })

      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error ?? 'Error al analizar')
      }

      const data = await res.json() as {
        affectedPhases: number[]
        phaseImpacts  : Record<string, string>
      }

      const impacts: PhaseImpact[] = (data.affectedPhases ?? []).map((phase) => ({
        phase,
        label : PHASE_LABELS[phase] ?? `Fase ${phase}`,
        impact: data.phaseImpacts?.[String(phase)] ?? '',
      }))

      setPhaseImpacts(impacts)
      setSelectedPhases(new Set(data.affectedPhases ?? []))
      setStep(2)
    } catch (err: any) {
      setAnalyzeError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // ─── Step 2 → Apply ───────────────────────────────────────────────────────

  async function handleApply() {
    if (selectedPhases.size === 0) return
    const phases = Array.from(selectedPhases).sort()

    setApplying(true)
    setApplyError(null)
    setApplyProgress(5)
    setCurrentPhaseMsg(`Preparando revisión de ${phases.length} fase${phases.length > 1 ? 's' : ''}…`)

    // Simular progreso mientras espera (las llamadas son secuenciales y lentas)
    const totalSteps   = phases.length
    let   lastProgress = 5
    const progressInterval = setInterval(() => {
      setApplyProgress((prev) => {
        const target = lastProgress + (90 / totalSteps) * 0.3
        return Math.min(prev + 0.5, target)
      })
    }, 500)

    try {
      for (let i = 0; i < phases.length; i++) {
        const phaseNum = phases[i]
        lastProgress   = 5 + ((i / totalSteps) * 85)
        setApplyProgress(lastProgress)
        setCurrentPhaseMsg(`Regenerando Fase ${phaseNum}: ${PHASE_LABELS[phaseNum] ?? ''}…`)
      }

      const res = await fetch('/api/social/apply-revision', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, instructions, phases }),
      })

      clearInterval(progressInterval)

      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error ?? 'Error al aplicar revisión')
      }

      const data = await res.json() as { applied: number[]; errors: Record<string, string> }

      setApplyProgress(100)
      setCurrentPhaseMsg('¡Revisión aplicada!')
      setAppliedPhases(data.applied ?? [])
      setApplyErrors(data.errors ?? {})
      setStep(3)
    } catch (err: any) {
      clearInterval(progressInterval)
      setApplyError(err.message)
      setApplyProgress(0)
      setCurrentPhaseMsg('')
    } finally {
      setApplying(false)
    }
  }

  // ─── Toggle phase selection ────────────────────────────────────────────────

  function togglePhase(phase: number) {
    setSelectedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(phase)) next.delete(phase)
      else next.add(phase)
      return next
    })
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={handleClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-in-out">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Revisión de estrategia</h2>
              <p className="text-xs text-gray-500">
                {step === 1 && 'Describe los cambios solicitados'}
                {step === 2 && `${selectedPhases.size} fase${selectedPhases.size !== 1 ? 's' : ''} seleccionada${selectedPhases.size !== 1 ? 's' : ''}`}
                {step === 3 && 'Revisión completada'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={applying}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-5 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          {[
            { n: 1, label: 'Instrucciones' },
            { n: 2, label: 'Revisar fases' },
            { n: 3, label: 'Listo' },
          ].map(({ n, label }, idx) => (
            <div key={n} className="flex items-center">
              <div className={`
                flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold
                ${step === n ? 'bg-violet-600 text-white' : step > n ? 'bg-violet-100 text-violet-600' : 'bg-gray-200 text-gray-500'}
              `}>
                {step > n ? '✓' : n}
              </div>
              <span className={`ml-1.5 text-xs ${step === n ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
              {idx < 2 && <ChevronRight className="h-3.5 w-3.5 text-gray-300 mx-2" />}
            </div>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* ─── Step 1: Instructions ─── */}
          {step === 1 && (
            <>
              <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3">
                <p className="text-xs text-violet-800 leading-relaxed">
                  Describe con detalle los cambios que el cliente ha solicitado. La IA analizará qué fases de la estrategia necesitan regenerarse.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">
                  Instrucciones de revisión *
                </label>
                <textarea
                  rows={8}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Ej: El cliente quiere enfocarse más en LinkedIn y reducir la presencia en Instagram. Los pilares editoriales deben centrarse en liderazgo de pensamiento en el sector fintech, no en contenido genérico. La cadencia debe ser más conservadora: 3 posts semanales máximo en total..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none text-gray-700 placeholder:text-gray-400"
                  disabled={analyzing}
                />
                <p className="text-xs text-gray-400 text-right">{instructions.length} caracteres</p>
              </div>

              {analyzeError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{analyzeError}</p>
                </div>
              )}

              <Button
                onClick={handleAnalyze}
                disabled={!instructions.trim() || analyzing}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2"
              >
                {analyzing
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Analizando cambios…</>
                  : <><ChevronRight className="h-4 w-4" /> Analizar cambios</>
                }
              </Button>
            </>
          )}

          {/* ─── Step 2: Phase selection ─── */}
          {step === 2 && (
            <>
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                <p className="text-xs font-medium text-amber-900 mb-1">
                  Fases identificadas para revisión
                </p>
                <p className="text-xs text-amber-700">
                  La IA ha identificado las fases afectadas por los cambios. Puedes desmarcar las que no quieras regenerar.
                </p>
              </div>

              {/* Instructions summary */}
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
                <p className="text-xs text-gray-500 font-medium mb-1">Instrucciones recibidas:</p>
                <p className="text-xs text-gray-700 line-clamp-3">{instructions}</p>
              </div>

              {/* Phase checkboxes */}
              <div className="space-y-2">
                {phaseImpacts.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No se identificaron fases a regenerar.
                  </p>
                )}
                {phaseImpacts.map(({ phase, label, impact }) => {
                  const checked = selectedPhases.has(phase)
                  return (
                    <div
                      key={phase}
                      role="checkbox"
                      aria-checked={checked}
                      tabIndex={0}
                      onClick={() => togglePhase(phase)}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePhase(phase) } }}
                      className={`
                        flex items-start gap-3 p-3 rounded-lg border cursor-pointer select-none
                        transition-colors
                        ${checked
                          ? 'border-violet-300 bg-violet-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'}
                      `}
                    >
                      <div className={`
                        mt-0.5 flex items-center justify-center h-4 w-4 rounded border shrink-0 transition-colors
                        ${checked ? 'bg-violet-600 border-violet-600' : 'border-gray-300'}
                      `}>
                        {checked && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-500">Fase {phase}</span>
                          <span className="text-xs font-semibold text-gray-900">{label}</span>
                        </div>
                        {impact && (
                          <p className="text-xs text-gray-500 mt-0.5">{impact}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {selectedPhases.size > 0 && (
                <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5">
                  <p className="text-xs text-orange-800">
                    <span className="font-semibold">⚠ Atención:</span> Las fases regeneradas quedarán marcadas como pendientes de revisión y se reseteará la validación del cliente.
                  </p>
                </div>
              )}

              {applyError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{applyError}</p>
                </div>
              )}

              {/* Progress bar */}
              {applying && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-600">{currentPhaseMsg}</p>
                    <p className="text-xs text-gray-400">{Math.round(applyProgress)}%</p>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-600 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${applyProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  disabled={applying}
                  className="flex-1"
                >
                  ← Editar instrucciones
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={selectedPhases.size === 0 || applying}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white gap-2"
                >
                  {applying
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Aplicando…</>
                    : `Aplicar revisión (${selectedPhases.size})`
                  }
                </Button>
              </div>
            </>
          )}

          {/* ─── Step 3: Done ─── */}
          {step === 3 && (
            <>
              <div className="flex flex-col items-center text-center py-6 gap-4">
                <div className="h-16 w-16 rounded-2xl bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Revisión aplicada</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {appliedPhases.length} fase{appliedPhases.length !== 1 ? 's' : ''} han sido regenerada{appliedPhases.length !== 1 ? 's' : ''} con los cambios solicitados.
                  </p>
                </div>
              </div>

              {/* Applied phases */}
              <div className="space-y-2">
                {appliedPhases.map((phase) => (
                  <div key={phase} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-xs font-medium text-green-900">
                      Fase {phase} — {PHASE_LABELS[phase] ?? 'Fase ' + phase}
                    </span>
                  </div>
                ))}
                {Object.entries(applyErrors).map(([phase, msg]) => (
                  <div key={phase} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-red-900">Fase {phase} — Error</p>
                      <p className="text-xs text-red-700">{msg}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5">
                <p className="text-xs text-blue-800">
                  Las fases regeneradas están marcadas como <span className="font-semibold">pendientes de revisión</span>. Revisa el contenido actualizado y aprueba cada fase de nuevo cuando estés listo.
                </p>
              </div>

              <Button
                onClick={() => { onApplied(); handleClose() }}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                Ver estrategia actualizada
              </Button>
            </>
          )}

        </div>
      </div>
    </>
  )
}
