'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BenchmarkRef {
  id              : string
  client_id       : string
  name            : string
  platform        : string
  what_they_do_well?: string
  sort_order      : number
}

interface SynthesisData {
  benchmark_patterns?           : string
  differentiation_opportunities?: string
}

interface Props {
  clientId   : string
  onDataChange?: () => void
}

const PLATFORM_OPTIONS = [
  'linkedin', 'twitter_x', 'instagram', 'facebook', 'tiktok', 'youtube', 'web', 'otro',
]

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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuditBenchmark({ clientId, onDataChange }: Props) {
  const [refs,     setRefs]     = useState<BenchmarkRef[]>([])
  const [synthesis, setSynthesis] = useState<SynthesisData>({})
  const [loading,  setLoading]  = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingSynth, setSavingSynth] = useState(false)
  const [savedSynthAt, setSavedSynthAt] = useState<string | null>(null)

  // New ref form state
  const [showForm, setShowForm] = useState(false)
  const [newName,  setNewName]  = useState('')
  const [newPlatform, setNewPlatform] = useState('linkedin')
  const [adding,   setAdding]   = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [refsRes, synthRes] = await Promise.all([
        fetch(`/api/social/benchmark?clientId=${clientId}`),
        fetch(`/api/social/synthesis?clientId=${clientId}`),
      ])
      if (refsRes.ok)  setRefs(await refsRes.json())
      if (synthRes.ok) {
        const s = await synthRes.json()
        setSynthesis(s ?? {})
      }
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleAddRef() {
    if (!newName.trim()) return
    if (refs.length >= 5) return

    setAdding(true)
    try {
      const res = await fetch('/api/social/benchmark', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          client_id : clientId,
          name      : newName.trim(),
          platform  : newPlatform,
          sort_order: refs.length,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const created = await res.json() as BenchmarkRef
      setRefs((prev) => [...prev, created])
      setNewName('')
      setShowForm(false)
      onDataChange?.()
    } catch (err) {
      console.error('[AuditBenchmark] Add error:', err)
    } finally {
      setAdding(false)
    }
  }

  async function handleDeleteRef(id: string) {
    setSavingId(id)
    try {
      await fetch(`/api/social/benchmark?id=${id}`, { method: 'DELETE' })
      setRefs((prev) => prev.filter((r) => r.id !== id))
      onDataChange?.()
    } catch { /* silencioso */ }
    finally { setSavingId(null) }
  }

  async function handleUpdateRef(id: string, field: keyof BenchmarkRef, value: string) {
    setRefs((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r))
  }

  async function handleSaveRefField(ref: BenchmarkRef) {
    setSavingId(ref.id)
    try {
      await fetch('/api/social/benchmark', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(ref),
      })
      onDataChange?.()
    } catch { /* silencioso */ }
    finally { setSavingId(null) }
  }

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
      {/* ── Referentes ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Referentes de benchmark</h3>
            <p className="text-xs text-gray-500 mt-0.5">Máximo 5 cuentas o marcas de referencia</p>
          </div>
          {refs.length < 5 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
              className="text-xs gap-1.5 h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir referente
            </Button>
          )}
        </div>

        {/* Formulario inline */}
        {showForm && (
          <div className="rounded-lg border border-pink-200 bg-pink-50 p-4 mb-4 space-y-3">
            <p className="text-xs font-medium text-pink-800">Nuevo referente</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRef()}
                placeholder="Nombre de la cuenta o marca"
                autoFocus
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
              >
                {PLATFORM_OPTIONS.map((p) => (
                  <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setNewName('') }} className="text-xs h-7">
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleAddRef}
                disabled={adding || !newName.trim()}
                className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white h-7"
              >
                {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Añadir'}
              </Button>
            </div>
          </div>
        )}

        {refs.length === 0 && !showForm && (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
            <p className="text-sm text-gray-500">Aún no hay referentes configurados</p>
            <p className="text-xs text-gray-400 mt-1">
              Añade hasta 5 cuentas o marcas que sirvan de referencia para la estrategia
            </p>
          </div>
        )}

        <div className="space-y-3">
          {refs.map((ref, idx) => (
            <div key={ref.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-400 w-5">#{idx + 1}</span>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={ref.name}
                    onChange={(e) => handleUpdateRef(ref.id, 'name', e.target.value)}
                    onBlur={() => handleSaveRefField(ref)}
                    className="text-sm font-medium border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                  <select
                    value={ref.platform}
                    onChange={(e) => handleUpdateRef(ref.id, 'platform', e.target.value)}
                    onBlur={() => handleSaveRefField(ref)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
                  >
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => handleDeleteRef(ref.id)}
                  disabled={savingId === ref.id}
                  className="text-gray-300 hover:text-red-400 transition-colors p-1 rounded"
                >
                  {savingId === ref.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />
                  }
                </button>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">¿Qué hace bien? (puntos a aprender o evitar)</label>
                <textarea
                  rows={2}
                  value={ref.what_they_do_well ?? ''}
                  onChange={(e) => handleUpdateRef(ref.id, 'what_they_do_well', e.target.value)}
                  onBlur={() => handleSaveRefField(ref)}
                  placeholder="Ej: Gran frecuencia de publicación, contenido muy visual, comunidad activa..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Análisis de benchmark ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Análisis de benchmark</h3>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1.5">
            Patrones comunes del benchmark
          </label>
          <textarea
            rows={4}
            value={synthesis.benchmark_patterns ?? ''}
            onChange={(e) => setSynthesis((p) => ({ ...p, benchmark_patterns: e.target.value }))}
            onBlur={handleSaveSynthesis}
            placeholder="¿Qué hacen de forma consistente los referentes? Patrones de formato, frecuencia, tono, engagement..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1.5">
            Oportunidades de diferenciación
          </label>
          <textarea
            rows={4}
            value={synthesis.differentiation_opportunities ?? ''}
            onChange={(e) => setSynthesis((p) => ({ ...p, differentiation_opportunities: e.target.value }))}
            onBlur={handleSaveSynthesis}
            placeholder="¿Qué espacio hay para diferenciarse? ¿Qué no están haciendo los referentes que podría hacer nuestro cliente?"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {savedSynthAt && (
              <span className="flex items-center gap-1 text-green-600">
                <Check className="h-3 w-3" /> Guardado a las {savedSynthAt}
              </span>
            )}
          </span>
          <Button
            size="sm"
            onClick={handleSaveSynthesis}
            disabled={savingSynth}
            className="text-xs gap-1.5 bg-pink-600 hover:bg-pink-700 text-white"
          >
            {savingSynth
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</>
              : 'Guardar análisis'
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
