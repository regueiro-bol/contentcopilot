'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Loader2, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorNetwork {
  platform: string
  url     : string | null
  handle  : string | null
}

interface EditorialCompetitor {
  id      : string
  name    : string
  networks: CompetitorNetwork[]
}

interface BenchmarkRef {
  id               : string
  client_id        : string
  name             : string
  platform         : string
  what_they_do_well?: string
  sort_order       : number
  source?          : string
  competitor_id?   : string | null
  included?        : boolean
}

interface SynthesisData {
  benchmark_patterns?           : string
  differentiation_opportunities?: string
}

interface Props {
  clientId     : string
  onDataChange?: () => void
}

const PLATFORM_OPTIONS = ['linkedin', 'twitter_x', 'instagram', 'facebook', 'tiktok', 'youtube', 'web', 'otro']

const PLATFORM_LABELS: Record<string, string> = {
  linkedin  : 'LinkedIn',
  twitter_x : 'Twitter/X',
  instagram : 'Instagram',
  facebook  : 'Facebook',
  tiktok    : 'TikTok',
  youtube   : 'YouTube',
  web       : 'Web',
  otro      : 'Otro',
}

const PLATFORM_ICONS: Record<string, string> = {
  linkedin  : '💼',
  twitter_x : '𝕏',
  instagram : '📸',
  facebook  : '👥',
  tiktok    : '🎵',
  youtube   : '▶️',
  web       : '🌐',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuditBenchmark({ clientId, onDataChange }: Props) {
  const [competitors,    setCompetitors]    = useState<EditorialCompetitor[]>([])
  const [compNotes,      setCompNotes]      = useState<Record<string, string>>({})
  const [compIncluded,   setCompIncluded]   = useState<Record<string, boolean>>({})
  const [compRefIds,     setCompRefIds]     = useState<Record<string, string>>({})
  const [manualRefs,     setManualRefs]     = useState<BenchmarkRef[]>([])
  const [synthesis,      setSynthesis]      = useState<SynthesisData>({})
  const [loading,        setLoading]        = useState(true)
  const [savingCompId,   setSavingCompId]   = useState<string | null>(null)
  const [savingManualId, setSavingManualId] = useState<string | null>(null)
  const [savingSynth,    setSavingSynth]    = useState(false)
  const [savedSynthAt,   setSavedSynthAt]   = useState<string | null>(null)
  const [showForm,       setShowForm]       = useState(false)
  const [newName,        setNewName]        = useState('')
  const [newPlatform,    setNewPlatform]    = useState('linkedin')
  const [adding,         setAdding]         = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [compRes, refsRes, synthRes] = await Promise.all([
        fetch(`/api/social/benchmark/competitors?clientId=${clientId}`),
        fetch(`/api/social/benchmark?clientId=${clientId}`),
        fetch(`/api/social/synthesis?clientId=${clientId}`),
      ])

      if (compRes.ok) {
        const comps = await compRes.json() as EditorialCompetitor[]
        setCompetitors(comps)
      }

      if (refsRes.ok) {
        const allRefs  = await refsRes.json() as BenchmarkRef[]
        const manual   = allRefs.filter((r) => r.source !== 'competitor')
        const compRefs = allRefs.filter((r) => r.source === 'competitor' && r.competitor_id)

        setManualRefs(manual)

        const notes   : Record<string, string>  = {}
        const included: Record<string, boolean> = {}
        const refIds  : Record<string, string>  = {}

        for (const r of compRefs) {
          if (r.competitor_id) {
            notes[r.competitor_id]    = r.what_they_do_well ?? ''
            included[r.competitor_id] = r.included !== false
            refIds[r.competitor_id]   = r.id
          }
        }
        setCompNotes(notes)
        setCompIncluded(included)
        setCompRefIds(refIds)
      }

      if (synthRes.ok) {
        const s = await synthRes.json()
        setSynthesis(s ?? {})
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Guardar entrada de competidor ──────────────────────────────────────────

  async function saveCompetitorEntry(comp: EditorialCompetitor, newIncluded?: boolean, newNote?: string) {
    setSavingCompId(comp.id)
    const includedVal = newIncluded ?? compIncluded[comp.id] ?? true
    const noteVal     = newNote    ?? compNotes[comp.id]    ?? ''
    try {
      const existingId = compRefIds[comp.id]
      const payload = {
        client_id        : clientId,
        name             : comp.name,
        platform         : comp.networks[0]?.platform ?? 'web',
        what_they_do_well: noteVal,
        source           : 'competitor',
        competitor_id    : comp.id,
        included         : includedVal,
        sort_order       : 0,
      }

      if (!existingId) {
        const res = await fetch('/api/social/benchmark', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify(payload),
        })
        if (res.ok) {
          const created = await res.json() as BenchmarkRef
          setCompRefIds((prev) => ({ ...prev, [comp.id]: created.id }))
        }
      } else {
        await fetch('/api/social/benchmark', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify(payload),
        })
      }
      onDataChange?.()
    } catch { /* silencioso */ }
    finally { setSavingCompId(null) }
  }

  function toggleCompIncluded(comp: EditorialCompetitor) {
    const newVal = !(compIncluded[comp.id] ?? true)
    setCompIncluded((prev) => ({ ...prev, [comp.id]: newVal }))
    saveCompetitorEntry(comp, newVal)
  }

  // ─── Referentes manuales ────────────────────────────────────────────────────

  async function handleAddManual() {
    if (!newName.trim() || manualRefs.length >= 5) return
    setAdding(true)
    try {
      const res = await fetch('/api/social/benchmark', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          client_id : clientId,
          name      : newName.trim(),
          platform  : newPlatform,
          source    : 'manual',
          included  : true,
          sort_order: manualRefs.length,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const created = await res.json() as BenchmarkRef
      setManualRefs((prev) => [...prev, created])
      setNewName('')
      setShowForm(false)
      onDataChange?.()
    } catch (err) {
      console.error('[AuditBenchmark] Add manual error:', err)
    } finally {
      setAdding(false)
    }
  }

  async function handleDeleteManual(id: string) {
    setSavingManualId(id)
    try {
      await fetch(`/api/social/benchmark?id=${id}`, { method: 'DELETE' })
      setManualRefs((prev) => prev.filter((r) => r.id !== id))
      onDataChange?.()
    } catch { /* silencioso */ }
    finally { setSavingManualId(null) }
  }

  function handleUpdateManual(id: string, field: keyof BenchmarkRef, value: string) {
    setManualRefs((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r))
  }

  async function handleSaveManual(ref: BenchmarkRef) {
    setSavingManualId(ref.id)
    try {
      await fetch('/api/social/benchmark', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(ref),
      })
      onDataChange?.()
    } catch { /* silencioso */ }
    finally { setSavingManualId(null) }
  }

  // ─── Síntesis ────────────────────────────────────────────────────────────────

  async function handleSaveSynthesis() {
    setSavingSynth(true)
    try {
      const res = await fetch('/api/social/synthesis', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ client_id: clientId, ...synthesis }),
      })
      if (res.ok) {
        setSavedSynthAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
        onDataChange?.()
      }
    } catch { /* silencioso */ }
    finally { setSavingSynth(false) }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando benchmark…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── BLOQUE A: Competidores editoriales ───────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Competidores y referentes del cliente</h3>
        <p className="text-xs text-gray-500 mt-0.5 mb-4">
          Competidores editoriales con al menos una red social configurada en su ficha.
        </p>

        {competitors.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-5 text-center">
            <p className="text-sm text-gray-500">No hay competidores con redes sociales configuradas</p>
            <p className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
              Ve a la ficha del cliente → Competidores para añadirlos.
              <ExternalLink className="h-3 w-3" />
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {competitors.map((comp) => {
              const included = compIncluded[comp.id] ?? true
              return (
                <div key={comp.id} className={`rounded-xl border p-4 transition-all
                  ${included ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    {/* Toggle switch */}
                    <button
                      onClick={() => toggleCompIncluded(comp)}
                      title={included ? 'Excluir del análisis' : 'Incluir en el análisis'}
                      className={`mt-0.5 h-5 w-9 rounded-full transition-colors shrink-0 relative
                        ${included ? 'bg-pink-500' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all
                        ${included ? 'left-4' : 'left-0.5'}`} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-medium text-gray-900">{comp.name}</span>
                        {comp.networks.map((n) => (
                          <span key={n.platform} title={PLATFORM_LABELS[n.platform] ?? n.platform}
                            className="text-sm leading-none">
                            {PLATFORM_ICONS[n.platform] ?? '🌐'}
                          </span>
                        ))}
                        {savingCompId === comp.id && (
                          <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                        )}
                      </div>

                      {included && (
                        <textarea
                          rows={3}
                          value={compNotes[comp.id] ?? ''}
                          onChange={(e) => setCompNotes((prev) => ({ ...prev, [comp.id]: e.target.value }))}
                          onBlur={() => saveCompetitorEntry(comp)}
                          placeholder="Describe qué hace especialmente bien este competidor en las redes donde tiene presencia..."
                          className="w-full mt-2 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── BLOQUE B: Referentes adicionales ─────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-900">Referentes adicionales</h3>
          {manualRefs.length < 5 && (
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="text-xs gap-1.5 h-8">
              <Plus className="h-3.5 w-3.5" /> Añadir referente
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Medios, marcas de otros sectores o cuentas internacionales que sirvan de inspiración. Máximo 5.
        </p>

        {showForm && (
          <div className="rounded-lg border border-pink-200 bg-pink-50 p-4 mb-4 space-y-3">
            <p className="text-xs font-medium text-pink-800">Nuevo referente</p>
            <div className="flex gap-2">
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
                placeholder="Nombre de la cuenta o marca" autoFocus
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300" />
              <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white">
                {PLATFORM_OPTIONS.map((p) => (
                  <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setNewName('') }} className="text-xs h-7">Cancelar</Button>
              <Button size="sm" onClick={handleAddManual} disabled={adding || !newName.trim()}
                className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white h-7">
                {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Añadir'}
              </Button>
            </div>
          </div>
        )}

        {manualRefs.length === 0 && !showForm && (
          <div className="rounded-lg border border-dashed border-gray-300 p-5 text-center">
            <p className="text-sm text-gray-500">Aún no hay referentes adicionales configurados</p>
          </div>
        )}

        <div className="space-y-3">
          {manualRefs.map((ref, idx) => (
            <div key={ref.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-400 w-5">#{idx + 1}</span>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input type="text" value={ref.name}
                    onChange={(e) => handleUpdateManual(ref.id, 'name', e.target.value)}
                    onBlur={() => handleSaveManual(ref)}
                    className="text-sm font-medium border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-pink-300" />
                  <select value={ref.platform}
                    onChange={(e) => handleUpdateManual(ref.id, 'platform', e.target.value)}
                    onBlur={() => handleSaveManual(ref)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white">
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => handleDeleteManual(ref.id)} disabled={savingManualId === ref.id}
                  className="text-gray-300 hover:text-red-400 transition-colors p-1 rounded">
                  {savingManualId === ref.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">¿Qué hace bien?</label>
                <textarea rows={2} value={ref.what_they_do_well ?? ''}
                  onChange={(e) => handleUpdateManual(ref.id, 'what_they_do_well', e.target.value)}
                  onBlur={() => handleSaveManual(ref)}
                  placeholder="Ej: Gran frecuencia, contenido muy visual, comunidad activa..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── BLOQUE C: Análisis de benchmark ──────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Análisis de benchmark</h3>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1.5">Patrones comunes del benchmark</label>
          <textarea rows={4} value={synthesis.benchmark_patterns ?? ''}
            onChange={(e) => setSynthesis((p) => ({ ...p, benchmark_patterns: e.target.value }))}
            onBlur={handleSaveSynthesis}
            placeholder="¿Qué hacen de forma consistente los referentes? Patrones de formato, frecuencia, tono..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1.5">Oportunidades de diferenciación</label>
          <textarea rows={4} value={synthesis.differentiation_opportunities ?? ''}
            onChange={(e) => setSynthesis((p) => ({ ...p, differentiation_opportunities: e.target.value }))}
            onBlur={handleSaveSynthesis}
            placeholder="¿Qué espacio hay para diferenciarse? ¿Qué no están haciendo los referentes?"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none" />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {savedSynthAt && (
              <span className="flex items-center gap-1 text-green-600">
                <Check className="h-3 w-3" /> Guardado a las {savedSynthAt}
              </span>
            )}
          </span>
          <Button size="sm" onClick={handleSaveSynthesis} disabled={savingSynth}
            className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white">
            {savingSynth ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</> : 'Guardar análisis'}
          </Button>
        </div>
      </div>
    </div>
  )
}
