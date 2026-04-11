'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ActionPlanData {
  roadmap?            : string
  first_90_days?      : string
  team_resources?     : string
  phase_6_completed?  : boolean
  phase_6_approved_at?: string | null
  updated_at?         : string
}

interface Props {
  clientId        : string
  onPhaseComplete?: () => void
}

const APPROVAL_CHECKLIST = [
  'El roadmap tiene los tres horizontes con hitos concretos',
  'Los primeros 90 días están detallados con acciones y responsables',
  'El equipo ha revisado y validado el plan',
]

export default function Phase6ActionPlan({ clientId, onPhaseComplete }: Props) {
  const [data,       setData]       = useState<ActionPlanData>({})
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [savedAt,    setSavedAt]    = useState<string | null>(null)
  const [showRegen,  setShowRegen]  = useState(false)
  const [checkItems, setCheckItems] = useState<boolean[]>(new Array(APPROVAL_CHECKLIST.length).fill(false))

  const allChecked = checkItems.every(Boolean)
  const hasContent = !!(data.roadmap?.trim() && data.first_90_days?.trim())
  const isApproved = data.phase_6_completed === true

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/action-plan?clientId=${clientId}`)
      if (res.ok) {
        const d = await res.json() as ActionPlanData | null
        if (d) {
          setData(d)
          if (d.phase_6_completed) setCheckItems(new Array(APPROVAL_CHECKLIST.length).fill(true))
        }
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { loadData() }, [loadData])

  const save = useCallback(async (current?: ActionPlanData) => {
    const d = current ?? data
    setSaving(true)
    try {
      const res = await fetch('/api/social/action-plan', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          clientId      : clientId,
          roadmap       : d.roadmap,
          first90Days   : d.first_90_days,
          teamResources : d.team_resources,
        }),
      })
      if (res.ok) {
        const saved = await res.json() as ActionPlanData
        setData(saved)
        setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      }
    } catch { /* silencioso */ }
    finally { setSaving(false) }
  }, [clientId, data])

  function set(key: keyof ActionPlanData, value: string) {
    setData((prev) => ({ ...prev, [key]: value }))
    setSavedAt(null)
  }

  async function handleGenerate(force = false) {
    if (!force && hasContent) { setShowRegen(true); return }
    setShowRegen(false)
    setGenerating(true)
    try {
      const res = await fetch('/api/social/generate-action-plan', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const result = await res.json() as {
        roadmap       : string
        first90Days   : string
        teamResources : string
      }
      setData((prev) => ({
        ...prev,
        roadmap       : result.roadmap,
        first_90_days : result.first90Days,
        team_resources: result.teamResources,
      }))
      setSavedAt(null)
    } catch (err) {
      console.error('[Phase6ActionPlan] Generate error:', err)
    } finally {
      setGenerating(false)
    }
  }

  async function handleApprove() {
    if (!allChecked) return
    setApproving(true)
    try {
      await save()
      const res = await fetch('/api/social/approve-phase', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId, phase: 6 }),
      })
      if (res.ok) {
        setData((p) => ({ ...p, phase_6_completed: true, phase_6_approved_at: new Date().toISOString() }))
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
        body   : JSON.stringify({ clientId, phase: 6, undo: true }),
      })
      setData((p) => ({ ...p, phase_6_completed: false, phase_6_approved_at: null }))
      setCheckItems(new Array(APPROVAL_CHECKLIST.length).fill(false))
      onPhaseComplete?.()
    } catch { /* silencioso */ }
    finally { setApproving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando plan de acción…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800 font-medium">Plan de acción</p>
        <p className="text-xs text-blue-700 mt-0.5">
          Traduce la estrategia en un roadmap ejecutable: qué hacer, cuándo y con qué recursos.
          Al aprobar esta fase se completa la estrategia social del cliente.
        </p>
      </div>

      {hasContent && data.updated_at && !isApproved && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Contenido guardado el {new Date(data.updated_at).toLocaleDateString('es-ES')}. Puedes editarlo o regenerarlo.
        </div>
      )}

      {!isApproved && (
        <div className="flex items-center gap-3">
          <Button onClick={() => handleGenerate()} disabled={generating}
            className="gap-2 bg-pink-600 hover:bg-pink-700 text-white">
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando plan…</>
              : <><Sparkles className="h-4 w-4" /> Generar con IA</>
            }
          </Button>
          {hasContent && <span className="text-xs text-gray-400">Ya hay contenido generado</span>}
        </div>
      )}

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

      <div className="space-y-5">
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Roadmap de implementación</label>
          <p className="text-xs text-gray-400">Los tres horizontes: Fundación, Activación y Consolidación</p>
          <textarea rows={14} value={data.roadmap ?? ''} disabled={isApproved}
            onChange={(e) => set('roadmap', e.target.value)} onBlur={() => save()}
            placeholder="Horizonte 1 (días 1-30): qué construir antes de publicar.&#10;Horizonte 2 (días 31-90): arranque y calibración.&#10;Horizonte 3 (meses 4-12): consolidación y escala..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Primeros 90 días — acciones concretas</label>
          <p className="text-xs text-gray-400">Qué hacer exactamente en los primeros 3 meses</p>
          <textarea rows={10} value={data.first_90_days ?? ''} disabled={isApproved}
            onChange={(e) => set('first_90_days', e.target.value)} onBlur={() => save()}
            placeholder="Semana a semana o bloque a bloque: acciones, responsables y entregables esperados..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Equipo y recursos necesarios</label>
          <p className="text-xs text-gray-400">Quién hace qué y qué herramientas se necesitan</p>
          <textarea rows={8} value={data.team_resources ?? ''} disabled={isApproved}
            onChange={(e) => set('team_resources', e.target.value)} onBlur={() => save()}
            placeholder="Roles necesarios con dedicación estimada, stack tecnológico recomendado y presupuesto orientativo..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>
      </div>

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

      {/* ── Gate especial de Fase 6 ── */}
      {isApproved ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <Check className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-800">✅ Estrategia social completada</p>
              {data.phase_6_approved_at && (
                <p className="text-xs text-green-700 mt-0.5">
                  Completada el {new Date(data.phase_6_approved_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-green-700 mb-3">
            La estrategia está lista. Puedes usar el módulo de Ejecución desde el menú Social Media para crear el calendario y gestionar las piezas.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <Button variant="ghost" size="sm" onClick={handleUndoApproval} disabled={approving} className="text-xs text-gray-400 hover:text-red-500">
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Deshacer aprobación'}
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-pink-200 bg-pink-50 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-pink-900">Aprobar y cerrar la estrategia social</h3>
            <p className="text-xs text-pink-700 mt-1">
              Al aprobar el Plan de Acción se completa la estrategia social de este cliente. A partir de este momento
              podrás usar el módulo de Ejecución (calendario, piezas y publicación) desde el menú Social Media.
            </p>
          </div>
          <div className="space-y-2.5">
            {APPROVAL_CHECKLIST.map((item, idx) => (
              <div key={idx} role="checkbox" aria-checked={checkItems[idx]} tabIndex={0}
                onClick={() => { const n = [...checkItems]; n[idx] = !n[idx]; setCheckItems(n) }}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const n = [...checkItems]; n[idx] = !n[idx]; setCheckItems(n) } }}
                className="flex items-start gap-3 cursor-pointer group select-none"
              >
                <div className={`mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                  ${checkItems[idx] ? 'bg-green-500 border-green-500' : 'border-pink-300 group-hover:border-green-400'}`}>
                  {checkItems[idx] && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <span className={`text-sm transition-colors ${checkItems[idx] ? 'text-gray-700 line-through decoration-gray-400' : 'text-pink-800'}`}>{item}</span>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-pink-200 flex items-center justify-between">
            <span className="text-xs text-pink-600">{checkItems.filter(Boolean).length}/{APPROVAL_CHECKLIST.length} confirmados</span>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={!allChecked || !hasContent || approving}
              className={`gap-2 font-semibold transition-colors
                ${allChecked && hasContent
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
            >
              {approving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Completando…</>
                : <>✓ Completar estrategia social</>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
