'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Share2, Check, Lock, Loader2,
  BarChart2, Target, Layers, Mic2, TrendingUp, Rocket,
  Download, ShieldCheck, RotateCcw, MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Phase1Audit         from '@/components/social/phases/Phase1Audit'
import Phase2Strategy      from '@/components/social/phases/Phase2Strategy'
import Phase3Architecture  from '@/components/social/phases/Phase3Architecture'
import Phase4BrandVoice    from '@/components/social/phases/Phase4BrandVoice'
import Phase5KPIs          from '@/components/social/phases/Phase5KPIs'
import Phase6ActionPlan    from '@/components/social/phases/Phase6ActionPlan'
import StrategyRevisionPanel from '@/components/social/StrategyRevisionPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhaseStatus {
  completed : boolean
  approvedAt: string | null
}

interface StrategyStatus {
  phase1           : PhaseStatus
  phase2           : PhaseStatus
  phase3           : PhaseStatus
  phase4           : PhaseStatus
  phase5           : PhaseStatus
  phase6           : PhaseStatus
  completedCount   : number
  overallStatus    : 'not_started' | 'in_progress' | 'completed'
  clientValidated  : boolean
  clientValidatedAt: string | null
  revisionNotes    : string | null
}

interface Props {
  clientId: string
}

// ─── Configuración de fases ───────────────────────────────────────────────────

const FASES = [
  {
    numero     : 1,
    titulo     : 'Auditoría y benchmark',
    descripcion: 'Análisis del estado actual en redes y comparativa con competidores.',
    icon       : BarChart2,
  },
  {
    numero     : 2,
    titulo     : 'Estrategia de plataformas',
    descripcion: 'Decisiones sobre en qué redes estar y con qué rol cada una.',
    icon       : Target,
  },
  {
    numero     : 3,
    titulo     : 'Arquitectura de contenidos',
    descripcion: 'Pilares editoriales, formatos por plataforma y cadencia de publicación.',
    icon       : Layers,
  },
  {
    numero     : 4,
    titulo     : 'Tono y guidelines',
    descripcion: 'Manual de voz para redes, registro por plataforma y líneas rojas editoriales.',
    icon       : Mic2,
  },
  {
    numero     : 5,
    titulo     : 'KPIs y métricas',
    descripcion: 'Indicadores de éxito, metodología de medición y sistema de reporting.',
    icon       : TrendingUp,
  },
  {
    numero     : 6,
    titulo     : 'Plan de acción',
    descripcion: 'Roadmap por horizontes, primeros 90 días y recursos necesarios.',
    icon       : Rocket,
  },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPhaseStatus(status: StrategyStatus | null, phase: number): PhaseStatus {
  if (!status) return { completed: false, approvedAt: null }
  const key = `phase${phase}` as keyof StrategyStatus
  return status[key] as PhaseStatus
}

function isPhaseUnlocked(status: StrategyStatus | null, phase: number): boolean {
  if (phase === 1) return true
  return getPhaseStatus(status, phase - 1).completed
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SocialMediaStrategy({ clientId }: Props) {
  const [status, setStatus]           = useState<StrategyStatus | null>(null)
  const [loading, setLoading]         = useState(true)
  const [activePhase, setActivePhase] = useState(1)
  const [approving, setApproving]     = useState<number | null>(null)
  const [validating, setValidating]         = useState(false)
  const [showNotes, setShowNotes]           = useState(false)
  const [notesInput, setNotesInput]         = useState('')
  const [showRevisionPanel, setShowRevisionPanel] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/social/strategy-status/${clientId}`)
      if (res.ok) {
        const data = await res.json() as StrategyStatus
        setStatus(data)
        // Avanzar al primer fase incompleta o desbloqueada
        const firstIncomplete = FASES.find((f) => !getPhaseStatus(data, f.numero).completed)
        if (firstIncomplete && isPhaseUnlocked(data, firstIncomplete.numero)) {
          setActivePhase(firstIncomplete.numero)
        }
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function handleApprove(phase: number) {
    const currentPhase = getPhaseStatus(status, phase)
    setApproving(phase)
    try {
      const res = await fetch('/api/social/approve-phase', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, phase, undo: currentPhase.completed }),
      })
      if (res.ok) {
        await fetchStatus()
        // Si se completó (no undo), avanzar a la siguiente fase
        if (!currentPhase.completed && phase < 6) {
          setActivePhase(phase + 1)
        }
      }
    } catch { /* silencioso */ }
    finally { setApproving(null) }
  }

  async function handleValidate(validated: boolean) {
    setValidating(true)
    try {
      const res = await fetch('/api/social/validate-strategy', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          clientId,
          validated,
          notes: notesInput.trim() || undefined,
        }),
      })
      if (res.ok) {
        await fetchStatus()
        if (!validated) setNotesInput('')
        setShowNotes(false)
      }
    } catch { /* silencioso */ }
    finally { setValidating(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando estrategia social…</span>
      </div>
    )
  }

  const completedCount = status?.completedCount ?? 0
  const overallStatus  = status?.overallStatus  ?? 'not_started'

  return (
    <div className="space-y-6">
      {/* ── Header del módulo ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-pink-100 flex items-center justify-center">
              <Share2 className="h-5 w-5 text-pink-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Estrategia Social Media</h2>
              <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                La estrategia se define una vez y perdura hasta que haya cambios significativos en el posicionamiento del cliente.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {overallStatus === 'not_started' && (
              <Badge variant="secondary">Sin iniciar</Badge>
            )}
            {overallStatus === 'in_progress' && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                En progreso ({completedCount}/6 fases)
              </Badge>
            )}
            {overallStatus === 'completed' && !status?.clientValidated && (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                ✓ Completada
              </Badge>
            )}
            {status?.clientValidated && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1">
                <ShieldCheck className="h-3 w-3" /> Validada por cliente
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/social/export-word?clientId=${clientId}`)}
              title={overallStatus !== 'completed' ? 'Puedes descargar aunque la estrategia esté incompleta' : undefined}
              className="gap-1.5 text-xs text-gray-600 border-gray-300 hover:border-pink-400 hover:text-pink-600"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar Word
            </Button>
          </div>
        </div>
      </div>

      {/* ── Panel de validación por cliente (solo cuando strategy completada) ── */}
      {overallStatus === 'completed' && (
        <div className={`rounded-xl border p-5 space-y-3 ${
          status?.clientValidated
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-white border-gray-200'
        }`}>
          {status?.clientValidated ? (
            /* ── Estado: validada ── */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Validada por el cliente</p>
                    {status.clientValidatedAt && (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        {new Date(status.clientValidatedAt).toLocaleDateString('es-ES', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRevisionPanel(true)}
                    className="text-xs gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
                  >
                    <RotateCcw className="h-3 w-3" /> Iniciar revisión
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleValidate(false)}
                    disabled={validating}
                    className="text-xs text-gray-400 hover:text-amber-600 gap-1"
                  >
                    {validating
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : 'Desmarcar'
                    }
                  </Button>
                </div>
              </div>
              {status.revisionNotes && (
                <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2">
                  <p className="text-xs font-medium text-emerald-700 mb-1 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> Notas de revisión
                  </p>
                  <p className="text-xs text-gray-600 whitespace-pre-line">{status.revisionNotes}</p>
                </div>
              )}
            </div>
          ) : (
            /* ── Estado: pendiente de validación ── */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Validación por cliente</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Marca la estrategia como aprobada por el cliente para activar la herencia en ejecución.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRevisionPanel(true)}
                    className="text-xs gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
                  >
                    <RotateCcw className="h-3 w-3" /> Iniciar revisión
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowNotes((v) => !v)}
                    className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Validar con cliente
                  </Button>
                </div>
              </div>

              {showNotes && (
                <div className="space-y-2.5 pt-1">
                  <textarea
                    rows={3}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Notas de la validación (opcional): feedback del cliente, ajustes acordados…"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowNotes(false)} className="text-xs h-7">
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleValidate(true)}
                      disabled={validating}
                      className="text-xs h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {validating
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</>
                        : <><Check className="h-3 w-3" /> Confirmar validación</>
                      }
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Wizard: barra de progreso ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center">
          {FASES.map((fase, idx) => {
            const phaseStatus = getPhaseStatus(status, fase.numero)
            const unlocked    = isPhaseUnlocked(status, fase.numero)
            const isActive    = activePhase === fase.numero
            const isLast      = idx === FASES.length - 1

            return (
              <div key={fase.numero} className="flex items-center flex-1">
                {/* Step */}
                <button
                  onClick={() => setActivePhase(fase.numero)}
                  disabled={!unlocked}
                  title={!unlocked ? `Completa la fase ${fase.numero - 1} para continuar` : undefined}
                  className={`flex flex-col items-center gap-1 group flex-1 min-w-0 ${unlocked ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <div className={`
                    h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all
                    ${phaseStatus.completed
                      ? 'bg-green-500 text-white ring-2 ring-green-200 hover:ring-4'
                      : isActive
                        ? 'bg-pink-600 text-white ring-2 ring-pink-200'
                        : unlocked
                          ? 'bg-gray-100 text-gray-600 hover:bg-pink-50 hover:text-pink-600'
                          : 'bg-gray-100 text-gray-400'
                    }
                  `}>
                    {phaseStatus.completed
                      ? <Check className="h-4 w-4" />
                      : !unlocked
                        ? <Lock className="h-3.5 w-3.5" />
                        : <span className="text-xs">{String(fase.numero).padStart(2, '0')}</span>
                    }
                  </div>
                  <span className={`text-xs font-medium text-center leading-tight hidden sm:block max-w-[80px] truncate
                    ${isActive ? 'text-pink-600' : phaseStatus.completed ? 'text-green-700' : 'text-gray-500'}
                  `}>
                    {fase.titulo}
                  </span>
                </button>

                {/* Connector */}
                {!isLast && (
                  <div className={`h-0.5 flex-shrink-0 w-4 mx-1 rounded
                    ${getPhaseStatus(status, fase.numero).completed ? 'bg-green-400' : 'bg-gray-200'}
                  `} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Panel de la fase activa ── */}
      {FASES.map((fase) => {
        if (fase.numero !== activePhase) return null
        const phaseStatus = getPhaseStatus(status, fase.numero)
        const unlocked    = isPhaseUnlocked(status, fase.numero)
        const Icon        = fase.icon

        return (
          <div key={fase.numero} className="bg-white rounded-xl border border-gray-200 p-6">
            {/* Cabecera de la fase */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center
                  ${phaseStatus.completed ? 'bg-green-100' : 'bg-pink-100'}
                `}>
                  <Icon className={`h-5 w-5 ${phaseStatus.completed ? 'text-green-600' : 'text-pink-600'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Fase {String(fase.numero).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-gray-900">{fase.titulo}</h3>
                </div>
              </div>

              {phaseStatus.completed && (
                <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
                  <Check className="h-3.5 w-3.5" />
                  Completada
                  {phaseStatus.approvedAt && (
                    <span className="text-gray-400 font-normal">
                      · {new Date(phaseStatus.approvedAt).toLocaleDateString('es-ES')}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Contenido de la fase */}
            {!unlocked ? (
              <PhaseBlocked phaseNumber={fase.numero} />
            ) : fase.numero === 1 ? (
              <Phase1Audit
                clientId        = {clientId}
                onPhaseComplete = {fetchStatus}
              />
            ) : fase.numero === 2 ? (
              <Phase2Strategy
                clientId        = {clientId}
                onPhaseComplete = {fetchStatus}
              />
            ) : fase.numero === 3 ? (
              <Phase3Architecture
                clientId        = {clientId}
                onPhaseComplete = {fetchStatus}
              />
            ) : fase.numero === 4 ? (
              <Phase4BrandVoice
                clientId        = {clientId}
                onPhaseComplete = {fetchStatus}
              />
            ) : fase.numero === 5 ? (
              <Phase5KPIs
                clientId        = {clientId}
                onPhaseComplete = {fetchStatus}
              />
            ) : (
              <Phase6ActionPlan
                clientId        = {clientId}
                onPhaseComplete = {fetchStatus}
              />
            )}
          </div>
        )
      })}

      {/* ── Panel de revisión IA ── */}
      <StrategyRevisionPanel
        open     ={showRevisionPanel}
        clientId ={clientId}
        onClose  ={() => setShowRevisionPanel(false)}
        onApplied={() => { setShowRevisionPanel(false); fetchStatus() }}
      />
    </div>
  )
}

// ─── Sub-componentes de estado ────────────────────────────────────────────────

function PhaseBlocked({ phaseNumber }: { phaseNumber: number }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 p-8 flex flex-col items-center text-center">
      <Lock className="h-8 w-8 text-gray-300 mb-3" />
      <p className="text-sm font-medium text-gray-500">Fase bloqueada</p>
      <p className="text-xs text-gray-400 mt-1">
        Completa y aprueba la fase {phaseNumber - 1} para continuar
      </p>
    </div>
  )
}


function PhaseCompleted({
  approvedAt,
  approving,
  onEdit,
}: {
  phaseNumber: number
  approvedAt : string | null
  approving  : boolean
  onEdit     : () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-green-50 border border-green-200 p-5 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-green-500 flex items-center justify-center shrink-0">
          <Check className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-green-800">Fase completada y aprobada</p>
          {approvedAt && (
            <p className="text-xs text-green-700 mt-0.5">
              Aprobada el {new Date(approvedAt).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" className="text-xs gap-1.5" disabled>
          Ver / Editar
        </Button>
        {process.env.NODE_ENV === 'development' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={approving}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Deshacer aprobación'}
          </Button>
        )}
      </div>
    </div>
  )
}
