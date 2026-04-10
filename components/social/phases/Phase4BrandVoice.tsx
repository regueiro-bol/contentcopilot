'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Check, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandVoiceData {
  voice_manual?           : string
  register_by_platform?   : string
  editorial_red_lines?    : string
  consistency_guidelines? : string
  phase_4_completed?      : boolean
  phase_4_approved_at?    : string | null
  updated_at?             : string
}

interface Props {
  clientId        : string
  onPhaseComplete?: () => void
}

// ─── Checklist ────────────────────────────────────────────────────────────────

const APPROVAL_CHECKLIST = [
  'El manual de voz tiene atributos concretos y ejemplos prácticos',
  'Las líneas rojas editoriales están definidas claramente',
  'El equipo ha revisado y validado las guidelines',
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Phase4BrandVoice({ clientId, onPhaseComplete }: Props) {
  const [data,       setData]       = useState<BrandVoiceData>({})
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [savedAt,    setSavedAt]    = useState<string | null>(null)
  const [showRegen,  setShowRegen]  = useState(false)
  const [checkItems, setCheckItems] = useState<boolean[]>(new Array(APPROVAL_CHECKLIST.length).fill(false))

  const allChecked = checkItems.every(Boolean)
  const hasContent = !!(data.voice_manual?.trim() && data.editorial_red_lines?.trim())
  const isApproved = data.phase_4_completed === true

  // ─── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/brand-voice?clientId=${clientId}`)
      if (res.ok) {
        const d = await res.json() as BrandVoiceData | null
        if (d) {
          setData(d)
          if (d.phase_4_completed) setCheckItems(new Array(APPROVAL_CHECKLIST.length).fill(true))
        }
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { loadData() }, [loadData])

  // ─── Save ──────────────────────────────────────────────────────────────────

  const save = useCallback(async (current?: BrandVoiceData) => {
    const d = current ?? data
    setSaving(true)
    try {
      const res = await fetch('/api/social/brand-voice', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          clientId              : clientId,
          voiceManual           : d.voice_manual,
          registerByPlatform    : d.register_by_platform,
          editorialRedLines     : d.editorial_red_lines,
          consistencyGuidelines : d.consistency_guidelines,
        }),
      })
      if (res.ok) {
        const saved = await res.json() as BrandVoiceData
        setData(saved)
        setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
      }
    } catch { /* silencioso */ }
    finally { setSaving(false) }
  }, [clientId, data])

  function set(key: keyof BrandVoiceData, value: string) {
    setData((prev) => ({ ...prev, [key]: value }))
    setSavedAt(null)
  }

  // ─── Generate ─────────────────────────────────────────────────────────────

  async function handleGenerate(force = false) {
    if (!force && hasContent) { setShowRegen(true); return }
    setShowRegen(false)
    setGenerating(true)
    try {
      const res = await fetch('/api/social/generate-brand-voice', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ clientId }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const result = await res.json() as {
        voiceManual           : string
        registerByPlatform    : string
        editorialRedLines     : string
        consistencyGuidelines : string
      }
      setData((prev) => ({
        ...prev,
        voice_manual           : result.voiceManual,
        register_by_platform   : result.registerByPlatform,
        editorial_red_lines    : result.editorialRedLines,
        consistency_guidelines : result.consistencyGuidelines,
      }))
      setSavedAt(null)
    } catch (err) {
      console.error('[Phase4BrandVoice] Generate error:', err)
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
        body   : JSON.stringify({ clientId, phase: 4 }),
      })
      if (res.ok) {
        setData((p) => ({ ...p, phase_4_completed: true, phase_4_approved_at: new Date().toISOString() }))
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
        body   : JSON.stringify({ clientId, phase: 4, undo: true }),
      })
      setData((p) => ({ ...p, phase_4_completed: false, phase_4_approved_at: null }))
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
        <span className="text-sm">Cargando guidelines…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Descripción ── */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800 font-medium">Tono y guidelines de marca</p>
        <p className="text-xs text-blue-700 mt-0.5">
          Define cómo habla la marca en redes: atributos de voz, registro por plataforma y líneas rojas editoriales.
          {' '}Basado en el brandbook del cliente si está disponible.
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
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando guidelines…</>
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
        {/* 1. Manual de voz */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Manual de voz para redes</label>
          <p className="text-xs text-gray-400">Atributos de voz y cómo se expresan en redes sociales</p>
          <textarea rows={12} value={data.voice_manual ?? ''} disabled={isApproved}
            onChange={(e) => set('voice_manual', e.target.value)} onBlur={() => save()}
            placeholder="Atributos de voz con su definición práctica y ejemplos de aplicación en redes..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>

        {/* 2. Registro por plataforma */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Registro por plataforma</label>
          <p className="text-xs text-gray-400">Cómo adapta la marca su tono en cada red</p>
          <textarea rows={8} value={data.register_by_platform ?? ''} disabled={isApproved}
            onChange={(e) => set('register_by_platform', e.target.value)} onBlur={() => save()}
            placeholder="Para cada plataforma activa: longitud típica, tono específico, estructura de posts, uso de emojis y hashtags..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>

        {/* 3. Lo que la marca nunca dice */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Lo que la marca nunca dice</label>
          <p className="text-xs text-gray-400">Líneas rojas editoriales</p>
          <textarea rows={6} value={data.editorial_red_lines ?? ''} disabled={isApproved}
            onChange={(e) => set('editorial_red_lines', e.target.value)} onBlur={() => save()}
            placeholder="Expresiones, tonos o enfoques que están explícitamente prohibidos en la comunicación social..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none disabled:bg-gray-50 disabled:text-gray-600" />
        </div>

        {/* 4. Consistencia en equipo distribuido */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block">Guía de consistencia para equipo distribuido</label>
          <p className="text-xs text-gray-400">Cómo mantener coherencia cuando varias personas publican</p>
          <textarea rows={6} value={data.consistency_guidelines ?? ''} disabled={isApproved}
            onChange={(e) => set('consistency_guidelines', e.target.value)} onBlur={() => save()}
            placeholder="Proceso de revisión, checklist de publicación, quién aprueba qué tipo de contenido..."
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
              <p className="text-sm font-semibold text-green-800">Fase 4 completada y aprobada</p>
              {data.phase_4_approved_at && (
                <p className="text-xs text-green-700 mt-0.5">
                  Aprobada el {new Date(data.phase_4_approved_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleUndoApproval} disabled={approving} className="text-xs text-gray-400 hover:text-red-500">
            {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Deshacer aprobación'}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Checklist de aprobación</h3>
            <p className="text-xs text-gray-500 mt-0.5">Confirma antes de aprobar la fase</p>
          </div>
          <div className="space-y-2.5">
            {APPROVAL_CHECKLIST.map((item, idx) => (
              <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                <div className={`mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                  ${checkItems[idx] ? 'bg-green-500 border-green-500' : 'border-gray-300 group-hover:border-green-400'}`}>
                  {checkItems[idx] && <Check className="h-2.5 w-2.5 text-white" />}
                  <input type="checkbox" checked={checkItems[idx]}
                    onChange={(e) => { const n = [...checkItems]; n[idx] = e.target.checked; setCheckItems(n) }}
                    className="sr-only" />
                </div>
                <span className={`text-sm transition-colors ${checkItems[idx] ? 'text-gray-700 line-through decoration-gray-400' : 'text-gray-600'}`}>{item}</span>
              </label>
            ))}
          </div>
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">{checkItems.filter(Boolean).length}/{APPROVAL_CHECKLIST.length} completados</span>
            <Button size="sm" onClick={handleApprove} disabled={!allChecked || !hasContent || approving}
              className={`gap-1.5 text-xs ${allChecked && hasContent ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              {approving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aprobando…</>
                : <>Aprobar Fase 4 y continuar <ChevronRight className="h-3.5 w-3.5" /></>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
