'use client'

/**
 * FaseDistributorModal
 *
 * Modal "Distribuir en fases" del Banco de Contenidos.
 * Permite al consultor definir 1-3 fases libres (nombre, duración, artículos/mes, tipo)
 * y distribuir los artículos del banco en el calendario editorial.
 */

import { useState, useMemo, useCallback } from 'react'
import { X, Plus, Trash2, Loader2, CheckCircle2, CalendarDays, Zap, AlertCircle, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn }     from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BancoItem {
  id            : string
  title         : string
  main_keyword  : string
  funnel_stage  : string | null
  fase          : string | null
  prioridad_final: number | null
  tipo_articulo  : string | null
  cluster       : string | null
}

interface Fase {
  nombre       : string
  duracionMeses: number
  articulosPorMes: number
  tipo         : 'evergreen' | 'mixto' | 'actualidad'
  fechaInicio  : string   // YYYY-MM-DD
}

interface Props {
  clienteId: string
  items    : BancoItem[]
  onClose  : () => void
  onDone   : (count: number) => void
}

// ─── Presets ──────────────────────────────────────────────────────────────────

function getNextMonday(): string {
  const d = new Date()
  const day = d.getDay()   // 0=dom, 1=lun…
  const diff = day === 1 ? 0 : (8 - day) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

const PRESETS: { label: string; desc: string; fases: Omit<Fase, 'fechaInicio'>[] }[] = [
  {
    label: 'Base + Mantenimiento',
    desc : 'Arranque intensivo seguido de ritmo sostenido',
    fases: [
      { nombre: 'Base inicial',  duracionMeses: 2,  articulosPorMes: 25, tipo: 'evergreen' },
      { nombre: 'Mantenimiento', duracionMeses: 10, articulosPorMes: 8,  tipo: 'mixto'     },
    ],
  },
  {
    label: 'Lineal constante',
    desc : 'Ritmo constante durante 12 meses',
    fases: [
      { nombre: 'Crecimiento', duracionMeses: 12, articulosPorMes: 6, tipo: 'mixto' },
    ],
  },
  {
    label: 'Campaña puntual',
    desc : 'Sprint intensivo de un mes',
    fases: [
      { nombre: 'Campaña', duracionMeses: 1, articulosPorMes: 20, tipo: 'evergreen' },
    ],
  },
]

// ─── Helpers: días hábiles ────────────────────────────────────────────────────

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6
}

/** Distribuye `count` artículos en días hábiles entre inicio y fin, espaciados uniformemente */
function distribuirEnDiasHabiles(inicio: Date, fin: Date, count: number): string[] {
  if (count <= 0) return []
  const dias: Date[] = []
  const d = new Date(inicio)
  while (d <= fin) {
    if (!isWeekend(d)) dias.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  if (dias.length === 0) return []
  const result: string[] = []
  const step = Math.max(1, Math.floor(dias.length / count))
  for (let i = 0; i < count && i * step < dias.length; i++) {
    result.push(dias[i * step].toISOString().slice(0, 10))
  }
  // Rellenar si quedan huecos con el último día disponible
  while (result.length < count) {
    result.push(dias[dias.length - 1].toISOString().slice(0, 10))
  }
  return result
}

// ─── Lógica de asignación de artículos a fases ───────────────────────────────

const FUNNEL_PRIORITY: Record<string, number> = { bofu: 0, mofu: 1, tofu: 2 }
const FASE_PRIORITY  : Record<string, number> = { arranque: 0, consolidacion: 1, expansion: 2, sin_fase: 3 }

function sortItems(items: BancoItem[]): BancoItem[] {
  return [...items].sort((a, b) => {
    const pa = (a.prioridad_final ?? 3)
    const pb = (b.prioridad_final ?? 3)
    if (pa !== pb) return pa - pb
    const fa = FUNNEL_PRIORITY[a.funnel_stage ?? ''] ?? 99
    const fb = FUNNEL_PRIORITY[b.funnel_stage ?? ''] ?? 99
    if (fa !== fb) return fa - fb
    const ka = FASE_PRIORITY[a.fase ?? ''] ?? 99
    const kb = FASE_PRIORITY[b.fase ?? ''] ?? 99
    return ka - kb
  })
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FaseDistributorModal({ clienteId, items, onClose, onDone }: Props) {
  const [step, setStep]             = useState<1 | 2 | 3>(1)
  const [fases, setFases]           = useState<Fase[]>([
    { nombre: 'Base inicial', duracionMeses: 2, articulosPorMes: 25, tipo: 'evergreen', fechaInicio: getNextMonday() },
  ])
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [creados, setCreados]       = useState(0)

  // Calcular fechas encadenadas
  const fasesConFechas = useMemo(() => {
    const result: (Fase & { fechaFin: string; total: number })[] = []
    let currentStart = new Date(fases[0].fechaInicio)
    for (const f of fases) {
      const inicio = new Date(currentStart)
      const fin    = addMonths(inicio, f.duracionMeses)
      fin.setDate(fin.getDate() - 1)
      result.push({
        ...f,
        fechaInicio: inicio.toISOString().slice(0, 10),
        fechaFin   : fin.toISOString().slice(0, 10),
        total      : f.articulosPorMes * f.duracionMeses,
      })
      currentStart = addMonths(inicio, f.duracionMeses)
    }
    return result
  }, [fases])

  const totalArticulos = fasesConFechas.reduce((s, f) => s + f.total, 0)

  // Asignar artículos a fases
  const sorted = useMemo(() => sortItems(items.filter((i) => i.id)), [items])

  const asignacion = useMemo(() => {
    const result: { fase: typeof fasesConFechas[0]; articulos: BancoItem[]; fechas: string[] }[] = []
    let offset = 0
    for (const f of fasesConFechas) {
      const slice = sorted.slice(offset, offset + f.total)
      const fechas = distribuirEnDiasHabiles(new Date(f.fechaInicio), new Date(f.fechaFin), slice.length)
      result.push({ fase: f, articulos: slice, fechas })
      offset += f.total
    }
    return result
  }, [fasesConFechas, sorted])

  // ── Presets ────────────────────────────────────────────────
  function aplicarPreset(preset: typeof PRESETS[0]) {
    const start = fases[0].fechaInicio
    setFases(preset.fases.map((f) => ({ ...f, fechaInicio: start })))
  }

  // ── Edición de fases ───────────────────────────────────────
  function updateFase(idx: number, patch: Partial<Fase>) {
    setFases((prev) => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }
  function addFase() {
    if (fases.length >= 3) return
    setFases((prev) => [...prev, { nombre: `Fase ${prev.length + 1}`, duracionMeses: 3, articulosPorMes: 8, tipo: 'mixto', fechaInicio: '' }])
  }
  function removeFase(idx: number) {
    setFases((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Guardar ────────────────────────────────────────────────
  const handleGuardar = useCallback(async () => {
    if (asignacion.length === 0) return
    setSaving(true); setError(null)
    try {
      const batchItems = asignacion.flatMap(({ articulos, fechas }) =>
        articulos.map((art, i) => ({
          titulo           : art.title,
          keyword          : art.main_keyword,
          fecha_publicacion: fechas[i] ?? fechas[fechas.length - 1],
          tipo_articulo    : art.tipo_articulo ?? 'nuevo',
          funnel_stage     : art.funnel_stage,
          cluster          : art.cluster,
          fuente           : 'banco',
          notas            : null,
          map_item_id      : art.id,
        })),
      )

      if (batchItems.length === 0) {
        setError('No hay artículos del banco para programar.')
        return
      }

      const res = await fetch('/api/strategy/calendario/batch', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ client_id: clienteId, items: batchItems }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error creando entradas')
      setCreados(data.count ?? batchItems.length)
      setStep(3)
      onDone(data.count ?? batchItems.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }, [asignacion, clienteId, onDone])

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-gray-900">Distribuir en fases</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Steps indicator */}
            <div className="flex items-center gap-1">
              {([1, 2, 3] as const).map((n) => (
                <div key={n} className={cn(
                  'h-1.5 w-8 rounded-full transition-colors',
                  step >= n ? 'bg-indigo-500' : 'bg-gray-200',
                )} />
              ))}
            </div>
            <button type="button" onClick={onClose}><X className="h-4 w-4 text-gray-400 hover:text-gray-600" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── PASO 1 — Definir fases ───────────────────────── */}
          {step === 1 && (
            <div className="p-6 space-y-5">
              {/* Presets */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Presets</p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => aplicarPreset(p)}
                      className="rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                      <p className="text-xs font-semibold text-gray-800">{p.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{p.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fases */}
              <div className="space-y-3">
                {fases.map((f, idx) => (
                  <div key={idx} className="rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Fase {idx + 1}</p>
                      {fases.length > 1 && (
                        <button type="button" onClick={() => removeFase(idx)}
                          className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Nombre de la fase</label>
                        <input
                          type="text"
                          value={f.nombre}
                          onChange={(e) => updateFase(idx, { nombre: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Duración (meses)</label>
                        <input
                          type="number" min={1} max={24} value={f.duracionMeses}
                          onChange={(e) => updateFase(idx, { duracionMeses: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Artículos / mes</label>
                        <input
                          type="number" min={1} max={50} value={f.articulosPorMes}
                          onChange={(e) => updateFase(idx, { articulosPorMes: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Tipo de contenido</label>
                        <select value={f.tipo} onChange={(e) => updateFase(idx, { tipo: e.target.value as Fase['tipo'] })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
                          <option value="evergreen">Evergreen</option>
                          <option value="mixto">Mixto</option>
                          <option value="actualidad">Actualidad</option>
                        </select>
                      </div>
                      {idx === 0 && (
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 mb-1">Fecha de inicio</label>
                          <input
                            type="date" value={f.fechaInicio}
                            onChange={(e) => updateFase(0, { fechaInicio: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                          />
                        </div>
                      )}
                    </div>
                    {/* Resumen fase */}
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 pt-1">
                      <span className="font-bold text-gray-600">{f.duracionMeses * f.articulosPorMes} artículos</span>
                      <span>en {f.duracionMeses} {f.duracionMeses === 1 ? 'mes' : 'meses'}</span>
                      <span>·</span>
                      <span>{f.articulosPorMes}/mes</span>
                    </div>
                  </div>
                ))}

                {fases.length < 3 && (
                  <button type="button" onClick={addFase}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 py-2">
                    <Plus className="h-3.5 w-3.5" /> Añadir Fase {fases.length + 1}
                  </button>
                )}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-indigo-900">Total: {totalArticulos} artículos</p>
                  <p className="text-[10px] text-indigo-500 mt-0.5">
                    {sorted.length} disponibles en banco · {Math.min(totalArticulos, sorted.length)} se programarán
                  </p>
                </div>
                {totalArticulos > sorted.length && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Solo {sorted.length} en banco
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PASO 2 — Revisión ────────────────────────────── */}
          {step === 2 && (
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500">
                Revisión de la distribución. Los artículos se asignan por prioridad y fase editorial.
              </p>
              <div className="space-y-4">
                {asignacion.map(({ fase, articulos, fechas }, fi) => (
                  <div key={fi} className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-indigo-900">{fase.nombre}</p>
                        <p className="text-[10px] text-indigo-500">
                          {fase.fechaInicio} → {fase.fechaFin} · {articulos.length} artículos
                        </p>
                      </div>
                      <span className={cn(
                        'text-[10px] font-bold rounded-full px-2 py-0.5',
                        fase.tipo === 'evergreen' ? 'bg-green-100 text-green-700' :
                        fase.tipo === 'actualidad' ? 'bg-rose-100 text-rose-700' :
                        'bg-gray-100 text-gray-600',
                      )}>
                        {fase.tipo}
                      </span>
                    </div>
                    {articulos.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">Sin artículos disponibles para esta fase</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                        {articulos.slice(0, 20).map((art, i) => (
                          <div key={art.id} className="flex items-center gap-3 px-4 py-2">
                            <span className="text-[10px] text-gray-400 w-[60px] shrink-0">{fechas[i] ?? '—'}</span>
                            <p className="text-xs text-gray-700 flex-1 truncate">{art.title}</p>
                            {art.funnel_stage && (
                              <span className={cn(
                                'text-[9px] font-bold rounded-full px-1.5 py-0.5 shrink-0',
                                art.funnel_stage === 'tofu' ? 'bg-green-100 text-green-700' :
                                art.funnel_stage === 'mofu' ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700',
                              )}>{art.funnel_stage.toUpperCase()}</span>
                            )}
                          </div>
                        ))}
                        {articulos.length > 20 && (
                          <p className="text-[10px] text-center text-gray-400 py-2">
                            +{articulos.length - 20} más…
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
              )}
            </div>
          )}

          {/* ── PASO 3 — Listo ───────────────────────────────── */}
          {step === 3 && (
            <div className="p-6 flex flex-col items-center text-center py-12 space-y-4">
              <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">¡Distribución completada!</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {creados} artículos programados en {fases.length} fase{fases.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                {fasesConFechas.map((f, i) => (
                  <p key={i} className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">{f.nombre}</span>
                    {' '}— {f.fechaInicio} a {f.fechaFin}
                  </p>
                ))}
              </div>
              <a href="/strategy/calendario"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-xl px-4 py-2.5 transition-colors mt-2">
                Ver calendario editorial <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 3 && (
          <div className="p-4 border-t border-gray-100 flex justify-between items-center shrink-0">
            <Button variant="outline" size="sm" onClick={step === 1 ? onClose : () => setStep(1)}>
              {step === 1 ? 'Cancelar' : '← Atrás'}
            </Button>
            <div className="flex items-center gap-2">
              {step === 1 && (
                <Button size="sm" onClick={() => setStep(2)} disabled={totalArticulos === 0}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                  Revisar distribución <ChevronRight className="h-4 w-4" />
                </Button>
              )}
              {step === 2 && (
                <Button size="sm" onClick={handleGuardar} disabled={saving || asignacion.every((a) => a.articulos.length === 0)}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {saving ? 'Programando…' : `Programar ${Math.min(totalArticulos, sorted.length)} artículos`}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-4 border-t border-gray-100 flex justify-center shrink-0">
            <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
          </div>
        )}
      </div>
    </div>
  )
}
