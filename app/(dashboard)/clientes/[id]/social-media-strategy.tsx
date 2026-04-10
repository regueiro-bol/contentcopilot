'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Share2, Check, Lock, ChevronRight, Loader2,
  BarChart2, Target, Layers, Mic2, TrendingUp, Rocket,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Phase1Audit from '@/components/social/phases/Phase1Audit'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhaseStatus {
  completed : boolean
  approvedAt: string | null
}

interface StrategyStatus {
  phase1        : PhaseStatus
  phase2        : PhaseStatus
  phase3        : PhaseStatus
  phase4        : PhaseStatus
  phase5        : PhaseStatus
  phase6        : PhaseStatus
  completedCount: number
  overallStatus : 'not_started' | 'in_progress' | 'completed'
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
    sprintLabel: 'Sprint 2',
  },
  {
    numero     : 2,
    titulo     : 'Estrategia de plataformas',
    descripcion: 'Decisiones sobre en qué redes estar y con qué rol cada una.',
    icon       : Target,
    sprintLabel: 'Sprint 2',
  },
  {
    numero     : 3,
    titulo     : 'Arquitectura de contenidos',
    descripcion: 'Pilares editoriales, formatos por plataforma y cadencia de publicación.',
    icon       : Layers,
    sprintLabel: 'Sprint 3',
  },
  {
    numero     : 4,
    titulo     : 'Tono y guidelines',
    descripcion: 'Manual de voz para redes, registro por plataforma y líneas rojas editoriales.',
    icon       : Mic2,
    sprintLabel: 'Sprint 3',
  },
  {
    numero     : 5,
    titulo     : 'KPIs y métricas',
    descripcion: 'Indicadores de éxito, metodología de medición y sistema de reporting.',
    icon       : TrendingUp,
    sprintLabel: 'Sprint 4',
  },
  {
    numero     : 6,
    titulo     : 'Plan de acción',
    descripcion: 'Roadmap por horizontes, primeros 90 días y recursos necesarios.',
    icon       : Rocket,
    sprintLabel: 'Sprint 4',
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
  const [status, setStatus]         = useState<StrategyStatus | null>(null)
  const [loading, setLoading]       = useState(true)
  const [activePhase, setActivePhase] = useState(1)
  const [approving, setApproving]   = useState<number | null>(null)

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
          <div>
            {overallStatus === 'not_started' && (
              <Badge variant="secondary">Sin iniciar</Badge>
            )}
            {overallStatus === 'in_progress' && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                En progreso ({completedCount}/6 fases)
              </Badge>
            )}
            {overallStatus === 'completed' && (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                ✓ Completada
              </Badge>
            )}
          </div>
        </div>
      </div>

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
                  onClick={() => unlocked && setActivePhase(fase.numero)}
                  disabled={!unlocked}
                  title={!unlocked ? `Completa la fase ${fase.numero - 1} para continuar` : undefined}
                  className="flex flex-col items-center gap-1 group flex-1 min-w-0"
                >
                  <div className={`
                    h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all
                    ${phaseStatus.completed
                      ? 'bg-green-500 text-white ring-2 ring-green-200'
                      : isActive
                        ? 'bg-pink-600 text-white ring-2 ring-pink-200'
                        : unlocked
                          ? 'bg-gray-100 text-gray-600 hover:bg-pink-50 hover:text-pink-600 cursor-pointer'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
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
                    <Badge variant="secondary" className="text-xs">{fase.sprintLabel}</Badge>
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
            ) : phaseStatus.completed ? (
              <PhaseCompleted
                phaseNumber  = {fase.numero}
                approvedAt   = {phaseStatus.approvedAt}
                approving    = {approving === fase.numero}
                onEdit       = {() => handleApprove(fase.numero)} // undo
              />
            ) : fase.numero === 1 ? (
              <Phase1Audit
                clientId        = {clientId}
                onPhaseComplete = {fetchStatus}
              />
            ) : (
              <PhasePending
                titulo      = {fase.titulo}
                descripcion = {fase.descripcion}
                sprintLabel = {fase.sprintLabel}
                approving   = {approving === fase.numero}
                onApprove   = {() => handleApprove(fase.numero)}
              />
            )}
          </div>
        )
      })}
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

function PhasePending({
  titulo,
  descripcion,
  sprintLabel,
  approving,
  onApprove,
}: {
  titulo      : string
  descripcion : string
  sprintLabel : string
  approving   : boolean
  onApprove   : () => void
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-pink-50 border border-pink-200 p-5">
        <p className="text-sm text-pink-800 font-medium mb-1">{titulo}</p>
        <p className="text-xs text-pink-700">{descripcion}</p>
        <div className="mt-3 flex items-center gap-2">
          <Badge className="bg-pink-100 text-pink-700 border-pink-200 text-xs">{sprintLabel}</Badge>
          <span className="text-xs text-pink-600">Esta fase se construirá en el {sprintLabel}.</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled className="text-xs gap-1.5 opacity-50">
            Generar con IA
          </Button>
          <span className="text-xs text-gray-400">Disponible en {sprintLabel}</span>
        </div>

        <Button
          size="sm"
          onClick={onApprove}
          disabled={approving}
          className="gap-1.5 text-xs bg-pink-600 hover:bg-pink-700 text-white"
        >
          {approving
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aprobando…</>
            : <>Aprobar fase y continuar <ChevronRight className="h-3.5 w-3.5" /></>
          }
        </Button>
      </div>
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          disabled={approving}
          className="text-xs text-gray-400 hover:text-red-500"
        >
          {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Deshacer aprobación'}
        </Button>
      </div>
    </div>
  )
}
