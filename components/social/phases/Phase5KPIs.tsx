'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Check, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface KPIsData {
  kpis_by_objective?       : string
  measurement_methodology? : string
  reporting_system?        : string
  phase_5_completed?       : boolean
  phase_5_approved_at?     : string | null
  updated_at?              : string
}

interface Props {
  clientId        : string
  onPhaseComplete?: () => void
}

// ─── Markdown cleanup ────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s/g, '').trim()
}

function stripData<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'string' ? stripMarkdown(v) : v])
  ) as T
}

const APPROVAL_CHECKLIST = [
  'Los indicadores de éxito están organizados por objetivo estratégico',
  'La metodología de medición es realista con las herramientas disponibles',
  'El equipo ha revisado y validado el sistema de KPIs',
]

export default function Phase5KPIs({ clientId, onPhaseComplete }: Props) {
  const [data,       setData]       = useState<KPIsData>({})
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [savedAt,    setSavedAt]    = useState<string | null>(null)
  const [showRegen,  setShowRegen]  = useState(false)
  const [checkItems, setCheckItems] = useState<boolean[]>(new Array(APPROVAL_CHECKLIST.length).fill(false))

  const allChecked = checkItems.every(Boolean)
  const hasContent = !!(data.kpis_by_objective?.trim() && data.measurement_methodology?.trim())
  const isApproved = data.phase_5_completed === true

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/kpis?clientId=${clientId}`)
      if (res.ok) {
        const d = await res.json() as KPIsData | null
        if (d) {
          setData(stripData(d))
          if (d.phase_5_completed) setCheckItems(new Array(APPROVAL_CHECKLIST.length).fill(true))
        }
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { loadData() }, [loadData])

  const save = useCallback(async (current?: KPIsData) => {
    const d = current ?? data
    setSaving(true)
    try {
      const res = await fetch('/api/social/kpis', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          clientId              : clientId,
          kpisByObjective       : d.kpis_by_objective,
          measurementMethodology: d.measurement_methodology,
          reportingSystem       : d.reporting_system,
        }),
      })
      if (res.ok) {
        const saved = await res.json() as KPIsData
        setData(saved)
        setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      }
    } catch { /* silencioso */ }
    finally { setSaving(false) }
  }, [clientId, data])

  function set(key: keyof KPIsData, value: string) {
    setData((prev) => ({ ...prev, [key]: value }))
    setSavedAt(null)
  }

  async function handleGenerate(force = false) {
    if (!force && hasContent) { setShowRegen(true); return }
    setShowRegen(false)
    setGenerating(true)
    try {
      const res = await fetch('/api/social/generate-kpis', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const result = await res.json() as {
        kpisByObjective        : string
        measurementMethodology : string
        reportingSystem        : string
      }
      setData((prev) => ({
        ...prev,
        kpis_by_objective      : stripMarkdown(result.kpisByObjective),
        measurement_methodology: stripMarkdown(result.measurementMethodology),
        reporting_system       : stripMarkdown(result.reportingSystem),
      }))
      setSavedAt(null)
    } catch (err) {
      console.error('[Phase5KPIs] Generate error:', err)
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
        body   : JSON.stringify({ clientId, phase: 5 }),
      })
      if (res.ok) {
        setData((p) => ({ ...p, phase_5_completed: true, phase_5_approved_at: new Date().toISOString() }))
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
        body   : JSON.stringify({ clientId, phase: 5, undo: true }),
      })
      setData((p) => ({ ...p, phase_5_completed: false, phase_5_approved_at: null }))
      setCheckItems(new Array(APPROVAL_CHECKLIST.length).fill(false))
      onPhaseComplete?.()
    } catch { /* silencioso */ }
    finally { setApproving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando KPIs…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800 font-medium">KPIs y métricas</p>
        <p className="text-xs text-blue-700 mt-0.5">
          Define qué medir, cómo y con qué frecuencia para saber si la estrategia está funcionando.
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
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando KPIs…</>
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
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Indicadores de éxito por objetivo</label>
          <p className="text-xs text-gray-400">KPIs organizados por lo que queremos conseguir</p>
          <textarea rows={12} value={data.kpis_by_objective ?? ''} disabled={isApproved}
            onChange={(e) => set('kpis_by_objective', e.target.value)} onBlur={() => save()}
            placeholder="Para cada objetivo estratégico: qué medimos, cómo lo medimos y qué target nos marcamos..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Metodología de medición</label>
          <p className="text-xs text-gray-400">Cómo y cuándo se miden los KPIs</p>
          <textarea rows={8} value={data.measurement_methodology ?? ''} disabled={isApproved}
            onChange={(e) => set('measurement_methodology', e.target.value)} onBlur={() => save()}
            placeholder="Herramientas, frecuencia de medición, fuentes de datos y responsable de cada métrica..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Sistema de reporting para el cliente</label>
          <p className="text-xs text-gray-400">Estructura y frecuencia de los informes</p>
          <textarea rows={6} value={data.reporting_system ?? ''} disabled={isApproved}
            onChange={(e) => set('reporting_system', e.target.value)} onBlur={() => save()}
            placeholder="Qué incluye cada tipo de reporte, con qué frecuencia y en qué formato se entrega..."
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

      {isApproved ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <Check className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">Fase 5 completada y aprobada</p>
              {data.phase_5_approved_at && (
                <p className="text-xs text-green-700 mt-0.5">
                  Aprobada el {new Date(data.phase_5_approved_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
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
                : <>Aprobar Fase 5 y continuar <ChevronRight className="h-3.5 w-3.5" /></>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
